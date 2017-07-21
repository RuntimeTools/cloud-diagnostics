/*******************************************************************************
 * Copyright 2017 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/

//=============================================================================
// Main module entry point for cloud-diagnostics module
//=============================================================================

const nodereport = require('node-report/api');
const heapdump = require('heapdump');
const gencore = require('gencore');
const pkgcloud = require('pkgcloud');  // for Object Storage API
const cfenv = require('cfenv');  // Cloud Foundry environment API
const fs = require('fs');

var volumeMount;
var objectStorageClient;
var objectStorageContainer;
var dumpSeqNum = 1;
var options = {
  "name": "cloud-diagnostics",
  "nodereport": "api+signal",
  "heapdump": "api+signal",
  "coredump": "api+signal",
  "volume": "var/dumps",
  "objectstorage": "dumps"
};

//-----------------------------------------------------------------------------
// Initialization - set up dump storage location and dump trigger actions
//-----------------------------------------------------------------------------
console.log('cloud-diagnostics: initializing dump storage options and signal handlers');

// Parse options file, if any
try {
  options = JSON.parse(fs.readFileSync('cloud-diagnostics.json', 'utf8'));
  console.log('cloud-diagnostics: options: ' + JSON.stringify(options));
} catch (err) {
  console.log('cloud-diagnostics: no cloud-diagnostics.json options file found, using defaults');
}

// Process persistent volume option, check if the specified volume mount point for dumps exists
if (fs.existsSync(options.volume)) {
  volumeMount = options.volume;
  console.log('cloud-diagnostics: using NFS file system ' + volumeMount + ' for dumps');
} else {
  // No persistent volume mount point available, next see if object storage is available 
  objectStorageContainer = options.objectstorage; // TODO: create container if it does not exist?

  // Look for Object Storage service credentials
  var appEnv = cfenv.getAppEnv();
  var serviceInstances = appEnv.services['Object-Storage'] || {};
  var serviceInstance = serviceInstances[0] || {};
  var serviceCredentials = serviceInstance.credentials;

  if (serviceCredentials) {
    // Add in the extra service provider credentials and initialize the pkgcloud client
    serviceCredentials.provider = 'openstack';
    serviceCredentials.keystoneAuthVersion = 'v3';
    serviceCredentials.tenantId = serviceCredentials.projectId;
    serviceCredentials.authUrl = serviceCredentials.auth_url;
    objectStorageClient = pkgcloud.storage.createClient(serviceCredentials);
    console.log('cloud-diagnostics: using Object Storage service for dumps');
  } else {
    console.log('cloud-diagnostics: no persistent storage available for dumps, using local disk');
  }
}

// Load and initialize the native library for signal handling
var native = require('./native');
native.setSignals(signal_callback);

// Set up additional dump triggers. TODO: control via options for the other dump triggers (api and signal)
if (options.nodereport.includes("exception")) {
  console.log('cloud-diagnostics: set trigger for node report on uncaught exception');
  process.on('uncaughtException', (err) => {
    console.log('cloud-diagnostics: triggering node report on uncaught exception');
    exports.storeNodeReport((error, filename) => {
      console.log('cloud-diagnostics: exception triggered node report written to: ' + filename);
    });
  });
}

//-----------------------------------------------------------------------------
// Callback for native signal dump trigger
//-----------------------------------------------------------------------------
function signal_callback(err, dump_type) {
  // console.log('cloud-diagnostics: signal callback invoked for dump type: ' + dump_type);
  
  switch (dump_type) {
  case 'nodereport':
    exports.storeNodeReport((error, filename) => {
      // console.log('cloud-diagnostics: signal triggered node report written to: ' + filename);
    });
    break;
  case 'heapdump':
    exports.storeHeapDump((error, filename) => {
      // console.log('cloud-diagnostics: signal triggered heapdump written to: ' + filename);
    });
    break;
  case 'coredump':
    exports.storeCoreDump((error, filename) => {
      // console.log('cloud-diagnostics: signal triggered core dump written to: ' + filename);
    });
    break;
  }
}

//-----------------------------------------------------------------------------
// Initializer for Object Storage - pass in credentials
//-----------------------------------------------------------------------------
exports.initObjectStore = function(credentials) {
  console.log('cloud-diagnostics: initializing Object Storage credentials');
  objectStorageClient = pkgcloud.storage.createClient(credentials);
}

//-----------------------------------------------------------------------------
// Initializer for Object Storage dump directory (aka 'container')
//-----------------------------------------------------------------------------
exports.setContainer = function(container) {
  console.log('cloud-diagnostics: initializing Object Storage container name');
  objectStorageContainer = container;
  
  // TODO create dump container if it does not already exist?
}

//-----------------------------------------------------------------------------
// Getter for Object Storage connection status
//-----------------------------------------------------------------------------
exports.connected = function() {
  return objectStorageClient != undefined;
}

//=============================================================================
// Dump trigger functions for node-report, heap dump and core dumps. First set
// of APIs writes dumps to persistent storage (if available). The second set of
// APIs writes dumps to the local application disk.
//=============================================================================

//-----------------------------------------------------------------------------
// Function to trigger node-report and write the report to persistent storage
//-----------------------------------------------------------------------------
exports.storeNodeReport = function(callback) {
  console.log('cloud-diagnostics: request for node report to persistent storage');
  
  if (volumeMount) {
    // First choice, we have a persistent volume mounted (eg for a docker container
    // running in kubernetes), so use that for persisting the dump
    nodereport.setDirectory(volumeMount);
    var filename = nodereport.triggerReport();
    console.log('cloud-diagnostics: node report written to persistent volume: ' + volumeMount + '/' + filename);
    setImmediate(callback, null, volumeMount + '/' + filename);

  } else if (objectStorageClient !== undefined) {
    // Second choice, object storage is available (eg in a Bluemix Cloud Foundry container)

    // Trigger the node report, and create read and write streams for it
    var report = nodereport.triggerReport();
    var readStream = fs.createReadStream(report);
    var writeStream = objectStorageClient.upload({container: objectStorageContainer, remote: report});

    // Add error and success handlers to the write stream
    writeStream.on('error', function(err) {
      console.log('cloud-diagnostics: Error writing to stream: ' + err);
      fs.unlink(report, () => {});
      setImmediate(callback, err, null);
    });
    writeStream.on('success', function(file) {
      console.log('cloud-diagnostics: node report written to Object Storage: ' + file.container + '/' + file.name);
      fs.unlink(report, () => {});
      setImmediate(callback, null, file.container + '/' + file.name);
    });

    // Pipe the node report from the local file to object storage
    readStream.pipe(writeStream);

  } else {
    // Fallback to use the local file system for the report
    var filename = nodereport.triggerReport();
    console.log('cloud-diagnostics: node report written to local disk: ' + filename);
    setImmediate(callback, null, filename);
  }
}

//-----------------------------------------------------------------------------
// Function to trigger a heapdump and write the dump to persistent storage
//-----------------------------------------------------------------------------
exports.storeHeapDump = function(callback) {
  console.log('cloud-diagnostics: request for heap dump to persistent storage');

  if (volumeMount) {
    // First choice, we have a persistent volume mounted (eg for a docker container
    // running in kubernetes), so use that for persisting the dump

    // Construct filename for heapdump, i.e. heapdump.<date>.<time>.heapsnapshot
    var date = new Date();
    var timestamp = '.' + date.getFullYear() + (date.getMonth()+1) + date.getDate() + '.'
                  + date.getHours() + date.getMinutes() + date.getSeconds();
    heapdump.writeSnapshot(volumeMount + '/heapdump' + timestamp + '.heapsnapshot', function(err, filename) {
      console.log('cloud-diagnostics: heapdump written to persistent volume: ' + filename);
      setImmediate(callback, null, filename);
    });

  } else if (objectStorageClient !== undefined) {
    // Second choice, object storage is available (eg in a Bluemix Cloud Foundry container)

    // Trigger the heapdump, and create read and write streams for it
    heapdump.writeSnapshot(function(err, filename) {
      var readStream = fs.createReadStream(filename);
      var writeStream = objectStorageClient.upload({container: objectStorageContainer, remote: filename});

     // Add error and success handlers to the write stream
      writeStream.on('error', function(err) {
        console.log('cloud-diagnostics: Error writing to stream: ' + err);
        fs.unlink(filename, () => {});
        setImmediate(callback, err, null);
      });
      writeStream.on('success', function(file) {
        console.log('cloud-diagnostics: heapdump written to Object Storage: ' + file.container + '/' + file.name);
        fs.unlink(filename, () => {});
        setImmediate(callback, null, file.container + '/' + file.name);
      });

      // Pipe the heapdump from the local file to object storage
      readStream.pipe(writeStream);
    });

  } else {
    // Fallback to use the local file system for the heapdump

    // Construct filename for heapdump, i.e. heapdump.<date>.<time>.heapsnapshot
    var date = new Date();
    var timestamp = '.' + date.getFullYear() + (date.getMonth()+1) + date.getDate() + '.'
                  + date.getHours() + date.getMinutes() + date.getSeconds();
    heapdump.writeSnapshot('/heapdump' + timestamp + '.heapsnapshot', function(err, filename) {
      console.log('cloud-diagnostics: heapdump written to local disk: ' + filename);
      setImmediate(callback, null, filename);
    });
  }
}

//-----------------------------------------------------------------------------
// Function to trigger a core dump and copy the dump to persistent storage.
// This uses the gencore npm to collect native libraries and zip up the core
// dump and libraries.
//-----------------------------------------------------------------------------
exports.storeCoreDump = function(callback) {
  console.log('cloud-diagnostics: request for core dump to Object Storage');
  
  if (process.platform == 'win32') {
    console.log('cloud-diagnostics: storeCoreDump() function not supported on Windows.');
    setImmediate(callback, new Error('function not supported on Windows'));
    return;
  }
  
  // Run the gencore facility to create the dump and zip it up with the libraries
  gencore.collectCore((error, filename) => {
    if (error === null) {
      console.log('cloud-diagnostics: temporary core dump zip file written to ' + filename);

      if (volumeMount) {
        // First choice, we have a persistent volume mounted (eg for a docker container
        // running in kubernetes), so use that for persisting the dump
        fs.rename(filename, volumeMount + '/' + filename, function(err) {
          if (error === null) {
            console.log('cloud-diagnostics: core dump written to persistent volume: '
                        + volumeMount + '/' + filename);
            fs.unlink(filename, () => {});
            setImmediate(callback, null, volumeMount + '/' + filename);
          } else {
            console.log('cloud-diagnostics: error writing core dump to persistent volume');
            setImmediate(callback, err, null);
          }
        });

      } else if (objectStorageClient !== undefined) {
        // Second choice, object storage is available (eg in a Bluemix Cloud Foundry container)
        var readStream = fs.createReadStream(filename);
        var writeStream = objectStorageClient.upload({container: objectStorageContainer, remote: filename});

        // Add error and success handlers to the write stream
        writeStream.on('error', function(err) {
          console.log('cloud-diagnostics: Error writing to stream: ' + err);
          fs.unlink(filename, () => {});
          setImmediate(callback, err, null);
        });
        writeStream.on('success', function(file) {
          console.log('cloud-diagnostics: core dump written to Object Storage container: '
                      + file.container + '/' + file.name);
          fs.unlink(filename, () => {});
          setImmediate(callback, null, file.container + '/' + file.name);
        });

        // Pipe the dump from the local file to object storage
        readStream.pipe(writeStream);
      } else {
        // Fallback is just to leave the dump in the local file system
        console.log('cloud-diagnostics: core dump written to local disk: ' + filename);
        setImmediate(callback, null, filename);
      }
    } else {
      console.log('cloud-diagnostics: gencore.collectCore() failed' + error);
      setImmediate(callback, error, null);
    }
  });
}

//-----------------------------------------------------------------------------
// Function to trigger node-report and write the report to local disk
//-----------------------------------------------------------------------------
exports.writeNodeReport = function() {
  console.log('cloud-diagnostics: request for node report to application directory');
  nodereport.triggerReport();
}

//-----------------------------------------------------------------------------
// Function to trigger heapdump and write the dump to local disk
//-----------------------------------------------------------------------------
exports.writeHeapDump = function() {
  console.log('cloud-diagnostics: request for heap dump to application directory');
  heapdump.writeSnapshot();
}

//-----------------------------------------------------------------------------
// Function to trigger a core dump and write the dump to local disk
//-----------------------------------------------------------------------------
exports.writeCoreDump = function() {
  console.log('cloud-diagnostics: request for core dump to application directory');
  if (process.platform == 'win32') {
    console.log('cloud-diagnostics: writeCoreDump() function not supported on Windows.');
    return;
  }
  gencore.createCore((error, filename) => {
    console.log('cloud-diagnostics: core dump written to ' + filename);
  });
}

