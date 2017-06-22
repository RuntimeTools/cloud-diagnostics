# cloud-diagnostics
This module delivers enhanced support for obtaining diagnostic dumps from Node.js applications in cloud deployments. JavaScript API and external signal triggers are provided for generation of node-report, heapdump and core dumps from Node.js applications. The module addresses the problem of preserving dumps across container restarts by providing support for dumps to be written to persistent storage. An Object Storage service or NFS file storage (persistent volumes) can be used to store the dumps.

This module currently supports Bluemix Cloud Foundry applications using Object Storage, Bluemix Container Service Docker containers using Object Storage or NFS file storage, and Bluemix Kubernetes containers using Object Storage or NFS file storage. Support is for Linux only.

## Usage

1) Edit your application's package.json file to add the cloud-diagnostics module to your application's start command and dependencies:
```
 "scripts": {
    "start": "node -r cloud-diagnostics app.js"
  },
  "dependencies": {
    ...
    "cloud-diagnostics": "0.0.2"
  },
```
2) If you are using a docker image, add the cloud-diagnostics module to the application start CMD line in your Dockerfile:
```
CMD node -r cloud-diagnostics app.js
```
3) If you are using the Object Storage service to save your dumps, connect the Object Storage service to your cloud application, and create a storage container in the service. If you use `dumps` for the storage container name, no further configuration is require. If you use a different name you will need to supply the name in a `cloud-diagnostics.json` options file, see below.

4) If you are using NFS file storage (persistent volumes) to save your dumps, mount the persistent volume to your container. If you use `/var/dumps` as your volume path, no further configuration is require. If you use a different name you will need to supply the name in a JSON options file, see below.

5) Use the JavaScript APIs or external signals documented below to trigger dumps.

## Triggering of dumps using JavaScript APIs

The module provides the following JavaScript APIs for writing dumps to persistent storage:
```js
const diagnostics = require('cloud-diagnostics');

diagnostics.storeNodeReport(callback); // write a node-report to persistent storage
diagnostics.storeHeapDump(callback);   // write a heapdump to persistent storage
diagnostics.storeCoreDump(callback);   // write a core dump to persistent storage (as a `.tar.gz`)
```
Two parameters are passed to the callback: `(err, filename)`. The filename consists of the persistent storage path name followed by the dump name, for example `dumps/node-report.20170516.151316.47.001.txt`.

APIs are also provided to write dumps to the application container's local disk:
```js
diagnostics.writeNodeReport(); // write to local container disk
diagnostics.writeHeapDump();   // write to local container disk
diagnostics.writeCoreDump();   // write to local container disk
```
If you are using an Object Storage service to save your dumps, an optional API - `diagnostics.initObjectStore()` - is provided for explicit Object Storage configuration. By default in Bluemix, the module reads the configuration and credentials for Object Storage from the VCAP_SERVICES environment variable, and it is not necessary to use this API.
```js
const diagnostics = require('cloud-diagnostics');

var credentials = {
    provider: 'openstack',
    keystoneAuthVersion: 'v3',
    authUrl: 'https://identity.open.softlayer.com',
    tenantId: '********************************', // projectId from Object Storage credentials
    domainId: '********************************',
    username: '********************************',
    password: '***********',
    region: "london",
};

diagnostics.initObjectStore(credentials,'dump container name');
```
You can use the `diagnostics.connected()` API to check whether the module has an Object Storage service connected.

## Triggering of dumps using external signals

The module also supports dump triggering via external signals sent to the Node.js process. The module has native signal handlers for the Linux real-time signals SIGRTMIN, SIGRTMIN+1, SIGRTMIN+2. These signals are handled by the cloud-diagnostics module and trigger a node-report, heapdump or core dump respectively.

For **Bluemix Cloud Foundry applications**, use the `cf ssh` command to remotely access the application container and send a signal to the Node.js process. For example, this command will trigger a node-report to be written to a configured Object Storage service:
```
> cf ssh APPLICATION -c "pkill -RTMIN node"
```
A Linux bash script and a Windows command file are provided in the cloud-diagnostics module scripts directory to simplify the remote triggering of dumps for Bluemix Cloud Foundry applications:
```
Usage: cfdump node|heap|core APPLICATION
```

For **Bluemix Container Service applications**, use the `bx ic exec` command to remotely access the application container and send a signal to the Node.js process. For example, this command will trigger a node-report to be written to a configured persistent storage volume:
```
> bx ic exec CONTAINER pkill -RTMIN node
```
A Linux bash script and a Windows command file are provided in the cloud-diagnostics module scripts directory to simplify the remote triggering of dumps for Bluemix Container Service Docker applications:
```
Usage: icdump node|heap|core CONTAINER
```
For **Bluemix Kubernetes applications**, use the `kubectl exec` command to access the application container and send a signal to the Node.js process. For example, this command will trigger a node-report to be written to a configured persistent storage volume:
```
> kubectl exec POD [-c CONTAINER] -- pkill -RTMIN node
```
A Linux bash script and a Windows command file are provided in the cloud-diagnostics module scripts directory to simplify the triggering of dumps for Bluemix Kubernetes applications:
```
Usage: kbdump node|heap|core POD [CONTAINER]
```

## Options file

You can supply a `cloud-diagnostics.json` options file to control the behaviour of the cloud-diagnostics module. A sample options file is provided, which contains the following default settings:
```js
{
  "name": "cloud-diagnostics options",
  "nodereport": "api+signal",
  "heapdump": "api+signal",
  "coredump": "api+signal",
  "volume": "var/dumps",
  "objectstorage": "dumps"
}
```
The `nodereport`, `heapdump` and `coredump` properties control which triggers are enabled for each dump type. The default triggers for all three dump types are `api` and `signal`. The `volume` property sets the name of the mount path of the persistent storage volume that will be used by the module when writing dump files (default is "/var/dumps"). The `objectstorage` property sets the name of the storage container that will be used by the module when writing dump files to an Object Storage service (default is "dumps").

## Implementation details

Main pre-requisite packages:
- node-report (https://www.npmjs.org/package/node-report) for node-report generation
- heapdump (https://www.npmjs.org/package/heapdump) for heapdump generation
- gencore (https://www.npmjs.org/package/gencore) to trigger core dumps, while the application continues to run
- pkgcloud (https://www.npmjs.org/package/pkgcloud) for access to the Object Storage service
- cfenv (https://www.npmjs.org/package/cfenv) for access to Cloud Foundry environment variables

## License

[Licensed under the Apache 2.0 License.](LICENSE.md)
