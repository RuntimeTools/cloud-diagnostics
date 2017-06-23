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

#include <nan.h>

namespace cloud_diagnostics {
using v8::Local;
using v8::Function;
using v8::Value;
using v8::Isolate;
using v8::String;

#ifndef __APPLE__
static Nan::Callback signal_callback;
static uv_signal_t signal_handle[3];
#endif

//=============================================================================
// Signal handler - calls back to JS to trigger requested dump
//=============================================================================
inline void OnSignal(uv_signal_t* handle, int signo) {
  Nan::HandleScope scope;
  fprintf(stdout, "cloud-diagnostics: signal handler called for signal: %d\n", signo);
#if !(defined(__APPLE__) || defined(_WIN32))
  v8::Isolate* isolate = reinterpret_cast<Isolate*>(handle->data);

  // Callback to JavaScript, requested dump type depends on the signal
  if (signo == SIGRTMIN) {
    Local<Value> argv[] = {Nan::Null(), String::NewFromUtf8(isolate, "nodereport")};
    signal_callback.Call(2, argv);
  } else if (signo == SIGRTMIN + 1) {
    Local<Value> argv[] = {Nan::Null(), String::NewFromUtf8(isolate, "heapdump")};
    signal_callback.Call(2, argv);
  } else if (signo == SIGRTMIN + 2) {
    Local<Value> argv[] = {Nan::Null(), String::NewFromUtf8(isolate, "coredump")};
    signal_callback.Call(2, argv);
  }
#endif
}

//=============================================================================
// API function - set JavaScript callback for dump signals
//=============================================================================
NAN_METHOD(SetSignals) {
  Nan::HandleScope scope;
#if !(defined(__APPLE__) || defined(_WIN32))
  Isolate* isolate = info.GetIsolate();

  if (info[0]->IsFunction()) {
    signal_callback.SetFunction(info[0].As<Function>());
  } else {
    fprintf(stderr, "cloud-diagnostics: internal error, no callback supplied on SetSignals() call\n");
    return; // error, no callback supplied
  }
  // Setup the signal handlers
  // fprintf(stdout, "cloud-diagnostics: setting up signal handlers\n");
  for (int i = 0; i < 3; i++) {
    uv_signal_init(uv_default_loop(), &signal_handle[i]);
    uv_signal_start(&signal_handle[i], OnSignal, SIGRTMIN + i);
    uv_unref(reinterpret_cast<uv_handle_t*>(&signal_handle[i]));
    signal_handle[i].data = isolate;
  }
#endif
}

//=============================================================================
// Native module initializer function, called when the module is require'd
//=============================================================================
void Initialize(v8::Local<v8::Object> exports) {

  exports->Set(Nan::New("setSignals").ToLocalChecked(),
               Nan::New<v8::FunctionTemplate>(SetSignals)->GetFunction());
}

NODE_MODULE(native, Initialize)

}  // namespace cloud_diagnostics
