// .noTranscode
/* Copyright 2013 Google. All rights reserved.
 *
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file or at
 * https://developers.google.com/open-source/licenses/bsd
*/

(function(){

function assert(mustBeTrue) {
  if (!mustBeTrue) {
    console.assert(mustBeTrue);
    throw new Error('Assert');
  }
}

var _debug = true;
var maker_debug = _debug;
var expando_debug = _debug;
var accesses_debug = _debug;
var get_set_debug = _debug;
var calls_debug = _debug;
var recording_debug = _debug;

var special_debug = false;

function debugAll(value) {
  maker_debug = value;
  expando_debug = value;
  accesses_debug = value;
  get_set_debug = value;
  calls_debug = value;
  recording_debug = value;
  if (value) {
    setTimeout(function() {
      console.log('Stopping debugAll')
      debugAll(false);
    }, 100);
  }
}

function FakeObjectRef(index) {
  // The DOM object we are faking is _objectsReferenced[index].
  // The JSONable representation of that DOM object is at _jsonableObjectReps[index].
  this._fake_object_ref = index;
}

var proxyDepth = 0;

function FakeMaker() {
  // Co-indexed
  this._proxiedObjects = [];
  this._proxiesOfObjects = [];
  this._expandoProperties = [];
  this._originalProperties = []; // object keys when proxy first created.
  this._setExpandoGlobals = [];
  this._expandoPrototypes = [];
  this._expandoPrototypeCopies = [];

  this._callbacks = [];

  // Co-indexed
  this._objectsReferenced = [];  // DOM objects
  this._jsonableObjectReps = [];  // JSONable object representations
  this._objectReferences = [];  // Pointers to _objectsReferenced and _jsonableObjectReps

  this._recording = []; // Number, String, Boolean. Objects are refs to _objectsReferenced

  this._proxyPropertyNamePath = [];
  this.exclusions = FakeCommon.chromeBuiltins.concat([
    'Proxy', 'Reflect', 'FakeMaker', 'FakePlayer', 'webkitStorageInfo', '__F_',
    ]);
  // DOM elements with id are also globals.
  var qs = window.document.querySelector.bind(window.document);
  this.isElementId = function(name) {
    var result = !!qs('[id=' + name + ']');
    if (maker_debug)
       console.log('isElementId ' + name + ' : ' + result);
    if (result) {
      this.installProxyForWindowProperty(name);
    }
    return result;
  }

  var deproxyArgsButProxyCallbacks = {
    registerElement: function(args, path) {
      var fakeMaker = this;
      // registerElement(name, options)
      var elementName = args[0];
      var options = args[1];
      var outputArgs = [elementName];
      if (options) {
        var optionsCopy = {};
        if (options.extends)
          optionsCopy.extends = options.extends;
        outputArgs.push(optionsCopy);
        if (options.prototype) {
          console.log('registerElement  ' + elementName + ' options.prototype.__proto__ ' + fakeMaker.isAProxy(options.prototype.__proto__));
          var currentExpandoPrototypes = fakeMaker._expandoPrototypes.length;
          // Get the proto chain from obj to HTMLElement.prototype
          var chain = [];
          var found = fakeMaker._someProtos(options.prototype, function(proto) {
            var deproxiedProto = fakeMaker.toObject(proto) || proto;
            if (deproxiedProto === HTMLElement.prototype) {
              // We've processed all of the user-defined properties.
              return true;
            }
            chain.push(deproxiedProto);
          });
          if (!found) {
            console.log('chain of deproxiedProto ', chain)
            throw new Error('The CustomElement prototype must extend HTMLElement.prototype');
          }

          // Copy the user's object, up to the required prototype.
          chain.reverse();
          var prototypeCopy = HTMLElement.prototype;
          var found = chain.forEach(function(deproxiedProto) {
            // Extend the chain
            prototypeCopy = Object.create(prototypeCopy);
            Object.getOwnPropertyNames(deproxiedProto).forEach(function(name) {
              if (FakeCommon.lifeCycleOperations.indexOf(name) !== -1) {
                prototypeCopy[name] = fakeMaker._proxyACallback(deproxiedProto[name], path);
              } else {
                var descriptor = Object.getOwnPropertyDescriptor(deproxiedProto, name);
                if (calls_debug)
                  console.log('registerElement, prototype property ' + name  + ' isAProxy: '+ fakeMaker.isAProxy(descriptor.value));
                Object.defineProperty(prototypeCopy, name, descriptor);
              }
            });
            // Behind our back JS+DOM will make an expando property __proto__ of any newed
            // custom elements and set it to the object value of prototype. Record these objects
            // to avoid placing their properties on the originalProperties list.
            fakeMaker._expandoPrototypes.push(deproxiedProto);
            fakeMaker._expandoPrototypeCopies.push(prototypeCopy);

            if (calls_debug) {
              var deproxiedProtoLength = Object.getOwnPropertyNames(deproxiedProto).length;
              var prototypeCopyLength = Object.getOwnPropertyNames(prototypeCopy).length;
              console.log('proto comparison ' + deproxiedProtoLength +' === ' + prototypeCopyLength);
              console.assert(deproxiedProtoLength === prototypeCopyLength);
              console.log('added expandoPrototype at ' + fakeMaker._expandoPrototypes.length)
            }
          }, path + '.prototype');

          outputArgs[1].prototype = prototypeCopy;
        } // TODO: do we need to process the upgrade even if the prototype is not set?
      }
      return outputArgs;
    },
  };
  this._DOMFunctionsThatCallback = Object.create(null);
  this._DOMFunctionsThatCallback.registerElement = deproxyArgsButProxyCallbacks.registerElement;
  this._functionProxiesThatTakeCallbackArgs = [];
  this._callbackArgHandlers = [];
}

FakeMaker.prototype = {

  // Operate on the fake, the operations will be recorded.
  makeFake: function(obj, path) {
    if (!(obj)) throw new Error('Assert FAILS obj');
    if (!(path)) throw new Error('Assert FAILS path');
    this.startRecording(path);
    return this._wrapReturnValue(obj, obj, path);
  },

  // The record returned as JSON.
  toJSON: function() {
    var fullRecord = {
      objects: this._jsonableObjectReps,
      expandoProperties: this._setExpandoGlobals,
      recording: this._recording
    };
    try {
      return JSON.stringify(fullRecord, this._replacer);
    } catch (ex) {
      console.log('FakeMaker.toJSON FAILED ' + ex.stack);
      throw ex;
    }
  },

  startRecording: function(path) {
    if (this._active)
      console.warn('Recording was not stopped');

    this._active = true;

    if (recording_debug)
      console.log('startRecording ' + path + ' >>');
  },

  stopRecording: function(path) {
    if (!this._active)
      console.warn('Recording was not started');

    this._active = false;

    if (recording_debug)
      console.log('stopRecording  ' + path + ' <<');
  },

  installProxyForWindowProperty: function(name) {
    if (this.exclusions.indexOf(name) === -1) {
      switch(typeof window[name]){
        case 'object':
        case 'function':
          window[name] =
            this._getOrCreateProxyObject(window[name], window, 'window.'+name);
          break;
        default:
          break;
      }
    }
  },

  elementIds: function() {
    // DOM elements with id are also globals.
    var ids = [];
    var elts = document.querySelectorAll('[id]');
    for (var i = 0; i < elts.length; i++) {
      ids.push(elts[i].id);
    }
    return ids;
  },

  makeFakeWindow: function() {
    // Any access through window. will activate the proxy.
    var windowProxy = this.makeFake(window, 'window');

    // set return onto window
    return windowProxy;
  },

  //-------------------------------------------------------------

  _replacer: function(key, value) {
    if (value === Infinity) {
      return {'_fake_': 'Infinity'};
    } else if (Number.isNaN(value)) {
      return {'_fake_': 'NaN'};
    } else {
      return value;
    }
  },

  // Objects map uniquely to a proxy: create map entry.
  _registerProxyObject: function(obj, theThis, proxy) {
    this._proxiedObjects.push(obj);
    this._proxiesOfObjects.push(proxy);
    return this._proxiesOfObjects.length - 1;
  },

  // Objects map uniquely to a proxy: lookup map entry.
  _lookupProxyObject: function(obj, path) {
    var index = this._proxiedObjects.indexOf(obj);
    if (index !== -1) {
      if (recording_debug) {
        console.log('_lookupProxyObject found index: ' +
            index + ', typeof: ' + (typeof obj) + ' at ' + path);
      }
      return this._proxiesOfObjects[index];
    }
    index = this._proxiesOfObjects.indexOf(obj);
    if (index !== -1) {  // The object is a proxy.
      // Normally this is a sign that we set a proxy into the DOM by mistake.
      // However in one case it's the easiest fix:
      // options.prototype = Object.create(HTMLElement.prototype);
      // The get HTMLElement.prototype returns a proxy which becomes the .__proto__
      // for CustomElements. We would want to return a proxy in that case anyway.
      if (recording_debug)
        console.log('_lookupProxyObject called with a proxy, index ' + index + ' at ' + path);
      return obj;
    }

    if (maker_debug)
      console.log('_lookupProxyObject no find for object typeof ' + typeof obj + ' at ' + path);
  },

  _createJSONableObjectRepresentation: function(obj, path) {
    assert(!this.isAProxy(obj));
    var jsonableObjectRep = {};
    var fakeMaker = this;
    var rep = jsonableObjectRep;
    var repPath = path;
    // Walk the proto chain of obj and set fake protos on jsonableObjectRep.
    this._someProtos(Object.getPrototypeOf(obj), function(proto) {
      repPath = repPath + '__proto__';
      var indexOfProxy = fakeMaker._proxiedObjects.indexOf(obj);
      if (indexOfProxy !== -1)
        return true; // Stop, we found a proxy on chain.
      var indexOfRefedProto = fakeMaker._objectsReferenced.indexOf(proto);
      if (indexOfRefedProto === -1) {
        rep._fake_proto_  = fakeMaker._getOrCreateObjectRef(proto, repPath);
      } else {
        rep._fake_proto_ = fakeMaker._objectReferences[indexOfRefedProto];
      }
      rep = rep._fake_proto_;
    }, path);
    return jsonableObjectRep;
  },

  _getOrCreateObjectRef: function(obj, path) {
    if (!(obj))
      throw new Error('null object passed to _getOrCreateObjectRef');

    var indexOfRefedObject = this._objectsReferenced.indexOf(obj);
    var ref;
    if (indexOfRefedObject !== -1) {
      ref = this._objectReferences[indexOfRefedObject];
    } else {
      // The rep may cause more ref creation for proto, so create it first before
      // moving the indexes up.
      var jsonableObjectRep = this._createJSONableObjectRepresentation(obj, path);
      ref = new FakeObjectRef(this._objectsReferenced.length);
      this._objectReferences.push(ref);
      this._objectsReferenced.push(obj);
      this._jsonableObjectReps.push(jsonableObjectRep);
    }

    if (recording_debug) {
      var message;
      if (indexOfRefedObject === -1) {
        message =  'create ' + (this._objectsReferenced.length - 1);
      }  else {
        message = 'get ' + indexOfRefedObject;
      }
      message +=  ' at ' + path;
      console.log('_getOrCreateObjectRef ' + message, ref);
    }
    return ref;
  },

  _getOrCreateFunctionObjectRef: function(fnc, path) {
    var ref = this._getOrCreateObjectRef(fnc, path);
    this._objectReferences[ref._fake_object_ref]._fake_function_ = true;
    return ref;
  },

  // Append primitives, store objects and append their reference.
  _record: function(value, path) {
    if (!this._active)
      return value;
    if (value && typeof value === 'object') {
      if (!Object.getOwnPropertyDescriptor(value, '_fake_object_ref'))
        throw new Error('Attempt to record an object');
      this._recording.push(value);
    } else if (typeof value === 'undefined') {
      // we cannot JSON.stringify undefined.
      this._recording.push({'_fake_undefined': true});
    } else if (typeof value === 'function') {
      throw new Error('Attempt to record a function');
    } else {
      this._recording.push(value);
    }
    if (recording_debug)
      console.log("_record " + (this._recording.length - 1) + '@' + path + ' ' + (__F_.calls.length - 1), typeof value);

    this._recording.push(path + ' ' + (__F_.calls.length - 1));
    return value;
  },

  _getOrCreateProxyObject: function(obj, theThis, path) {
    if (path.indexOf('windowProxy.Object') !== -1)
      throw new Error('Builtin Object seen on path');
    if (!obj)
      return obj; // typeof null === 'object'
    return this._lookupProxyObject(obj, path) ||
        this._createProxyObject(obj, theThis, path);
  },

  _wrapReturnValue: function(value, theThis, path) {
    if (get_set_debug || calls_debug)
      console.log('_wrapReturnValue ' + path + ' isAProxy: ' + this.isAProxy(value) + ' type:', typeof(value));
    if (this.isAProxy(value))
      return value;

    switch (typeof value ) {
      case 'object':
      case 'xml':
        if (!value) // Don't record null as object
          return this._record(value, path);
        // Compound values are set into the object graph.
        // The player will re-constitute the object graph to support
        // accesses to these values.
        this._record(this._getOrCreateObjectRef(value, path), path);
        break;
      case 'function':
        this._record(this._getOrCreateFunctionObjectRef(value, path), path);
        break;
      default:
        // Simple values are recorded. The player will replay these values
        // using getters set into object properties.
        return this._record(value, path);
    }
    // Compound values are tracked recursively.
    return this._getOrCreateProxyObject(value, theThis, path);
  },

  _wrapCallResult: function(returnValue, theThis, path) {
      return this._wrapReturnValue(returnValue, theThis, path);
  },

  _proxyACallback: function(callback, path, sync) {
    if (calls_debug)
     console.log('_proxyACallback ' + path);
   if (!path)
    throw new Error('_proxyACallback no path')

    var fakeMaker = this;
    fakeMaker._callbacks.push(callback);  // Assign a number to each callback.
    if (calls_debug)
      console.log('_proxyACallback registered ' + fakeMaker._callbacks.length + ' at ' + path);
    if (fakeMaker.isAProxy(callback))
      throw new Error('_proxyACallback sees a proxy');

    return function() {  // This is the function that the DOM will call.
      if (calls_debug) {
        console.log('_proxyACallback callback called ' + path + ' with depth ' + __F_.depth);
        // For registerElement(), 'this.__proto__' will not be a proxy but this.__proto__.__proto__
        // will be HTMLElement.prototype which is a proxy.
        var thisProtoProto = Object.getPrototypeOf(Object.getPrototypeOf(this));
        var thisProtoIndex = fakeMaker.isAProxy(thisProtoProto) ? fakeMaker.getIndexOfProxy(thisProtoProto, path) : 'not a proxy';
        console.log('_proxyACallback thisProtoProto proxyIndex ' + thisProtoIndex, thisProtoProto);
      }

      // Simulate  'this.callback(args)' having a proxy for 'this'.
      // In normal proxy.apply, 'this' is already proxied because the .apply was preceded by a .get().
      // But in callback apply here, the DOM has the 'this' object. So we need to proxy it to
      // record the callback actions.
      var proxyThis = fakeMaker._getOrCreateProxyObject(this, null, path + '.this');

      // Record this call. We are called out of the DOM so we have to assume no proxies exist.
      var fncProxy = fakeMaker._getOrCreateProxyObject(callback, this, path);
      var ref = fakeMaker._getOrCreateFunctionObjectRef(callback, path);
      var refThis = fakeMaker._getOrCreateObjectRef(this, path + '.this');
      ref._callback_this = refThis._fake_object_ref;
      ref._callback_ = fakeMaker._callbacks.indexOf(callback);
      // The lifecycle events for custom elements are called synchronously but our
      // the call stack depth will be zero because we don't transcode the caller.
      ref._callback_depth = __F_.depth || sync;
      fakeMaker._record(ref, path + '-callback');
      // Check if 'this' has an expandoPrototype on its proto chain
      var protoOwner = fakeMaker.deproxyArg(this);
      fakeMaker._someProtos(Object.getPrototypeOf(this), function(proto) {
        console.log("checking proto isAProxy " + fakeMaker.isAProxy(proto))
        var index = fakeMaker._expandoPrototypeCopies.indexOf(proto);
        if (index !== -1) {
          console.log('_proxyACallback found _expandoPrototypeCopies at ' + index);
          // this proto is a copy we created while de-proxying the arguments to registerElement
          Object.setPrototypeOf(protoOwner, fakeMaker._expandoPrototypes[index]);
          return true;
        }
        protoOwner = proto;
      });
      if (calls_debug) {
        console.log('_proxyACallback entering callback with "this" ref ' + refThis._fake_object_ref
              + ' indexOfProxy ' + fakeMaker.getIndexOfProxy(this, path));
      }
      callback.apply(proxyThis, arguments);
    }
  },

  deproxyArg: function(argMaybeProxy) {
      var proxyIndex = this._proxiesOfObjects.indexOf(argMaybeProxy);
      if (calls_debug)
        console.log('arg is proxy at ' + proxyIndex);

      if (proxyIndex === -1)
        return argMaybeProxy;
      else
        return this._proxiedObjects[proxyIndex];
  },

  deproxyArgs: function(args, theThis, path) {
    if (calls_debug)
      console.log('deproxyArgs ' + args.length);

    var fakeMaker = this;
    return args.map(function(argMaybeProxy, index) {
      // callback need wrappers to map callback arguments to their proxies.
      if (typeof argMaybeProxy === 'function')
        return fakeMaker._proxyACallback(argMaybeProxy, path);
      else
        return fakeMaker.deproxyArg(argMaybeProxy);
    });
  },

  // Expandos are values added to DOM globals by JS.
  // We don't want to record or proxy them.
  shouldBeExpando: function(obj, name, indexOfProxy) {
    if (expando_debug)
      console.log('no existing expando ' + name + ' next look in ' +
        this._originalProperties[indexOfProxy].length + ' originalProperties at index ' + indexOfProxy);

    if (this._originalProperties[indexOfProxy].indexOf(name) !== -1)
      return false;

    var isElementId = (obj === window) && this.isElementId(name);
    if (isElementId)
      return false;

    var descriptor = Object.getOwnPropertyDescriptor(obj, name);
    if (descriptor && descriptor.set) {
      if (expando_debug)
       console.log('set found setter ' + name);
      // setters are not expandos, just ignore the set.
      return false;
    }
    return true;
  },

  registerExpando: function(obj, name) {
      var indexOfProxy = this._proxiedObjects.indexOf(obj);
      if (!(indexOfProxy !== -1))
        throw new Error('registerExpando Assert FAILS indexOfProxy !== -1')

      var expandos = this._expandoProperties[indexOfProxy] =
          this._expandoProperties[indexOfProxy] || {};

      expandos[name] = true;
      if (expando_debug) {
        console.log('registered expando property ' + name +
          ' of  proxy at ' + indexOfProxy);
      }
  },

  getExpandoProperty: function(obj, name, receiver, path) {
    var proxy = this._getOrCreateProxyObject(obj, receiver, path);
    var indexOfProxy = this._proxiesOfObjects.indexOf(proxy);
    if (expando_debug)
      console.log('looking for expando ' + name + ' at index ' + indexOfProxy);

    if (name === 'console' && obj === window)
      return console;

    if (obj === window && this.exclusions.indexOf(name) !== -1) {
      if (expando_debug) console.log('found exclusion ' + name);
      return {value: window[name]};
    }

    var expandos = this._expandoProperties[indexOfProxy];
    if (expandos && expandos.hasOwnProperty(name)) {
      var deproxyReceiver = this.deproxyArg(receiver);
      var value = Reflect.get(obj, name, deproxyReceiver);
      if (expando_debug && value && (typeof value === 'object') && !this.isAProxy(value))
        console.log('found expando property ' + name + ' own: ', Object.getOwnPropertyNames(value));
      return {value: value};
    }
  },

  _markAccess: function(obj, name, path) {
    // The DOM property 'name' was used by the app.

    // The access marks create stub properties on playback. We can't do that for
    // 'prototype' or '__proto__', we use the object refs and fake_proto to handle these.
    if (name === 'prototype' || name === '__proto__')
      return;

    var indexOfProxy = this.getIndexOfProxy(obj, path);
    var indexOfRefedObject = this._objectsReferenced.indexOf(obj);
    if (indexOfRefedObject === -1) {
      var ref = this._getOrCreateObjectRef(obj, path);
      indexOfRefedObject = this._objectsReferenced.indexOf(obj);
    }

    var jsonableObjectRep = this._jsonableObjectReps[indexOfRefedObject];
    // Mark the rep to create a getter at this name in the player.
    jsonableObjectRep[name] = true;

    if (accesses_debug) {
      var indexOfRef = this._objectsReferenced.indexOf(obj);
      var ref;
      if (indexOfRef !== -1) {
        ref = this._objectReferences[indexOfRef];
      } else {
        throw new Error('_markAccess ' + name + ' is not in _objectsReferenced ' + Object.getOwnPropertyNames(obj).join(', '));
      }
      console.log('Object at ' + indexOfProxy + ' accesses ' + name);
    }
  },

  _getPropertyDescriptor: function(target, name, path) {
    return this._someProtos(target, function(proto) {
      return Reflect.getOwnPropertyDescriptor(proto, name);
    }, path);
  },

  isAProxy: function(obj) {
    return (this._proxiesOfObjects.indexOf(obj) !== -1);
  },

  toObject: function(maybeProxy) {
    var index = this._proxiesOfObjects.indexOf(maybeProxy);
    if (index !== -1)
      return this._proxiedObjects[index];
  },

  classNameIfPossible: function(maybeProxy) {
    var obj = this.toObject(maybeProxy);
    if (obj) {
      var ctor = this.toObject(obj.constructor);
      if (ctor) {
        return this.toObject(ctor.name)
      }
    }
  },

  _someProtos: function(obj, callback, path) {
    var protoPath = '';
    var mark = obj;
    while (mark) {
      var result = callback(mark);
      if (result)
        return result;
      if (get_set_debug && path) {
        protoPath += '.__proto__';
        console.log('proto climbing ' + path + protoPath + ', proto: ' + typeof (mark));
      }
      var proto = Object.getPrototypeOf(mark);
      mark = this.toObject(proto) || proto;
    }
  },

  _wrapPropertyDescriptor: function(target, name, descriptor, obj, path) {
      // Create a new proxy and ref it.
      descriptor.value = this._wrapReturnValue(descriptor.value, obj, path + '.' + name);
      return descriptor;
  },

  _getFromPropertyDescriptor: function(obj, target, name, receiver, descriptor, path) {
    var result;
    if (!descriptor) {
      result = this._wrapReturnValue(undefined, undefined, path + '.' + name);
      if (get_set_debug)
        console.log('_getFromPropertyDescriptor ' + name + ': undefined ' + path);
    } else if (descriptor.get) {
      this.stopRecording(path);
      var value = Reflect.get(obj, name, receiver);
      this.startRecording(path);
      result = this._wrapCallResult(value, obj, path + '.' + name);
      if (get_set_debug)
        console.log('get from getter ' + name+ ' {' + typeof result + '}' + path);
    } else if (this.isAProxy(descriptor.value)) {
      // Only objects and functions have proxies, so property is one of those.
      var indexOfObj = this._proxiesOfObjects.indexOf(descriptor.value);
      var proxiedObj = this._proxiedObjects[indexOfObj];
      var ref;
      if (typeof proxiedObj === 'object')
        ref = this._getOrCreateObjectRef(proxiedObj, path);
      else if (typeof proxiedObj === 'function')
        ref = this._getOrCreateFunctionObjectRef(proxiedObj, path);
      else
        throw new Error('Proxy get for proxy is not an object or function');

      this._record(ref, path + '.' + name);
      // Return the pre-existing proxy.
      result = descriptor.value;
      if (get_set_debug)
        console.log('_getFromPropertyDescriptor returns existing proxy for : ' + name + ' {' + typeof proxiedObj + '} at ' + path);
    } else if (name === 'prototype') {
      // DOM .prototype is non-configurable. Therefore we cannot replace it with
      // a getter function during playback.  Instead we send an object ref to be
      // resolved in the player and we don't record it.
      var ref = this._getOrCreateObjectRef(descriptor.value, path + '.prototype');
      var indexOfRefedObject = this._objectsReferenced.indexOf(obj);
      this._jsonableObjectReps[indexOfRefedObject].prototype = ref;
      if (get_set_debug)
        console.log('_getFromPropertyDescriptor prototype ', ref);
      return this._getOrCreateProxyObject(descriptor.value, obj, path + '.prototype');
    } else if (name === 'name') {
      // V8 bug makes name not configurable. Therefore we cannot replace it with
      // a getter during playback.
      var indexOfRefedObject = this._objectsReferenced.indexOf(obj);
      result = descriptor.value;
      this._jsonableObjectReps[indexOfRefedObject].name = result;
      if (get_set_debug)
        console.log('_getFromPropertyDescriptor name ', result);
    }  else {
      // Wrap the value, store on target and return it.
      var wrappedDescriptor = this._wrapPropertyDescriptor(target, name, descriptor, obj, path);
      Object.defineProperty(target, name, wrappedDescriptor);
      result = wrappedDescriptor.value;
      if (get_set_debug)
        console.log('_getFromPropertyDescriptor from defineProperty: ' + name + ' {' + typeof descriptor.value + '} at ' + path);
    }
    return result;
  },

  getIndexOfProxy: function(obj, path) {
    var indexOfProxy = this._proxiedObjects.indexOf(obj);
    if (indexOfProxy === -1)
      throw new Error('set: No proxy for object at ' + path);
    return indexOfProxy;
  },

  _preSet: function(obj, name, value, receiver, path) {
    // In set/defineProperty we don't want to wrap the value, just
    // record that it was set in case JS code later reads it.
    var indexOfProxy = this.getIndexOfProxy(obj, path);

    // Force the name to become an expando
    var isExpando = this.getExpandoProperty(obj, name, receiver, path + 'set.');
    if (isExpando) {
      if (expando_debug)
        console.log('set found expando, set ' + name + ' to ' + typeof(value));
      if (obj === window) {
        this._setExpandoGlobals.push(name);
        if (expando_debug && typeof value === 'object' && !this.isAProxy(value))
          console.log('set found window expando ' + name + ' isAProxy ' + this.isAProxy(value), Object.getOwnPropertyNames(value));
      }
    } else {
      if (this.shouldBeExpando(obj, name, indexOfProxy))
        this.registerExpando(obj, name);
    }
  },

  _createProxyObject: function(obj, theThis, path) {
    if (proxyDepth++ > 10)
      throw new Error("we are in too deep....");
    if (obj === null)
      throw new Error('Do not proxy null');

    var fakeMaker = this;

    var shadow;  // Workaround for https://github.com/tvcutsem/harmony-reflect/issues/25
    if (typeof obj === 'object')
      shadow = {};
    else if (typeof obj === 'function')
      shadow = eval('(function ' + obj.name + '(){})');
    else
      throw new Error('Cannot make proxy for ' + typeof obj);

    if (fakeMaker.isAProxy(obj))
      throw new Error('_createProxyObject on proxy object ' + path);

    var proxyImpl = {  // close over 'obj' and 'path'

      // target[name] or getter
      get: function(target, name, receiver) { // target is bound to the shadow object
        console.log("get " + name + " begins >>>>>");
        // Secret property name for debugging
        if (name === '__fakeMakerProxy')
          return true;

        if (fakeMaker.isAProxy(obj))
          throw new Error('get on proxy object');

        if (get_set_debug) {
          console.log('get ' + name + ' obj === window: ' + (obj === window),
            ' obj: ' + fakeMaker.classNameIfPossible(obj));
        }

        // Was this own property written by JS onto obj?
        var result = fakeMaker.getExpandoProperty(obj, name, receiver, path);
        if (result) {
          console.log("get " + name + " returns expando <<<< at " + path + ' isAProxy ' + fakeMaker.isAProxy(result.value));
          return result.value; // Yes, then player need not know about it.
        }

        if (get_set_debug)
          console.log('not expando, look for descriptor ' + path + '.' + name);

        var descriptor = Object.getOwnPropertyDescriptor(obj, name);
        if (!descriptor) {
          if (get_set_debug)
            console.log('get traversing proto chain for ' + name + ' at ' + path)
          result = this.getFromProtoChain(obj, name, receiver, path);
        } else {  // We found an 'own' property.
          if (fakeMaker.suspendProxies) {
            // The 'own' property was found while traversing the proto-chain, don't record anything.
            return Reflect.get(obj, name, receiver);
          }
          if (get_set_debug)
            console.log('got descriptor ' + name + ' at ' + path);
          result = fakeMaker._getFromPropertyDescriptor(obj, target, name, receiver, descriptor, path);
        }
        if (typeof result !== 'undefined' && name !== 'prototype' && name !== 'name') {
          fakeMaker._markAccess(obj, name, path);
          // '.apply()' will need to process some functions for callbacks before they go into the DOM. But it does not
          // know the name of the function it will call. So we check the name here and mark the shadow/target for apply
          if (name in fakeMaker._DOMFunctionsThatCallback) {
            if (get_set_debug) {
              var indexOfResult = fakeMaker._proxiesOfObjects.indexOf(result);
              console.log(name + ' isA _DOMFunctionsThatCallback ' + path + ' pushing ' + (typeof result) + ' isAProxy ' + fakeMaker.isAProxy(result) + ' index ' + indexOfResult );
            }
            fakeMaker._functionProxiesThatTakeCallbackArgs.push(result);
            fakeMaker._callbackArgHandlers.push(fakeMaker._DOMFunctionsThatCallback[name].bind(fakeMaker));
          }
        }
        console.log("get " + name + " returns " + typeof result + " <<<<")
        return result;
      },

      wrapUndefinedOriginalProperty: function(obj, name, path) {
        // The name is not defined on the object or its proto chain.
        var indexOfProxy = fakeMaker.getIndexOfProxy(obj, path);
        if (fakeMaker.shouldBeExpando(obj, name, indexOfProxy)) {
          // Expando, not defined on DOM.
          // eg window.Platform = window.Platform || {};
          return undefined;
        }
        // Not expando, just a property with no value?
        if (get_set_debug)
          console.log('getFromProtoChain ' + name + ': undefined ' + path);
        return fakeMaker._wrapReturnValue(undefined, undefined, path + '.' + name);
      },

      getFromProtoChain: function(target, name, receiver, path) {
        // Recurse up the proto chain to find 'name'.
        var proto = Object.getPrototypeOf(obj);
        if (!proto) {
          return this.wrapUndefinedOriginalProperty(obj, name, path);
        }
        // On playback we won't mimic the traversal, we'll just replay the result from a getter
        // at property key 'name' on the original target. Thus we don't want to record any intermediate
        // steps.
        // Any link in the proto chain can have a proxy value and any link could have been set by the
        // app JS. A proxy value will trigger the 'get' trap and return a recorded result causing playback.
        // Since we don't want playback, we need avoid using the proxy value.  A __proto__ value set by JS
        // should not be proxied since we don't want to record any actions on object set by JS.
        // Once we deproxy the proto, a 'get' on the proto could cause further traversal, and that link could
        // be a proxy. The recursive 'get' would result in a recording. Thus we want to suspend proxy operation
        // during the protochain traversal.
        var deproxyProto = fakeMaker.deproxyArg(proto);
        var deproxyReceiver = fakeMaker.deproxyArg(receiver);
        fakeMaker.suspendProxies = true;
        var result = Reflect.get(deproxyProto, name, deproxyReceiver);
        fakeMaker.suspendProxies = false;
        if (typeof result === 'undefined')
          return this.wrapUndefinedOriginalProperty(obj, name, path);

        if (get_set_debug)
          console.log('getFromProtoChain Reflect.get result for ' + name + ' ' + typeof result);

        if (name === '__proto__')  // these won't be backed by replay on playback
          return result;

        if (fakeMaker._expandoPrototypes.indexOf(deproxyProto) === -1) {
          // The proto was not an expando, assume it is a DOM proto
          return fakeMaker._wrapReturnValue(result, receiver, path + '.' + name);
        } else {
          // Don't proxy results from non-DOM protos.
          if (get_set_debug)
            console.log('getFromProtoChain found expandoPrototype when looking for ' + name + ' at ' + path);
          return result;
        }
      },

      has: function(target, name) {
        return Reflect.has(obj, name);
      },

      getOwnPropertyDescriptor: function(target, name) {
        // Read the descriptor from the real object.
        var descriptor = Object.getOwnPropertyDescriptor(obj, name);
        if (get_set_debug)
          console.log('getOwnPropertyDescriptor ' + name + ' is ' + !!descriptor, descriptor);
        if (!descriptor) {
          if (get_set_debug) {
            console.log('No descriptor, getOwnPropertyDescriptor obj ' + Object.getOwnPropertyNames(obj).join(', '));
            console.log('No descriptor, getOwnPropertyDescriptor target ' + Object.getOwnPropertyNames(target).join(', '))            ;
          }
          return descriptor;
        }

        // Was this property written by JS onto obj?
        var result = fakeMaker.getExpandoProperty(obj, name, receiver, path + '.getOwnPropertyDescriptor.');
        if (get_set_debug)
          console.log('getOwnPropertyDescriptor ' + name + ' is expando ' + !!result);
        if (result) {
          // Store the descriptor on the target to fool the validator
          var targetDescriptor = Object.getOwnPropertyDescriptor(target, name);
          if (!targetDescriptor)
            Object.defineProperty(target, name, descriptor);
          return descriptor; // Yes, then player need not know about it.
        }

        if (descriptor.value) { // Wrap the value and store it on the shadow.
          var wrappedDescriptor = fakeMaker._wrapPropertyDescriptor(target, name, descriptor, obj, path);
          if (get_set_debug){
            var targetDescriptor = Object.getOwnPropertyDescriptor(target, name);
            console.log('getOwnPropertyDescriptor: ' + name + ' original descriptor ', descriptor);
            console.log('wrappedDescriptor ', wrappedDescriptor);
            console.log('previous targetDescriptor ', targetDescriptor);
          }
          Object.defineProperty(target, name, wrappedDescriptor);
          return wrappedDescriptor;
        }

          throw new Error('getOwnPropertyDescriptor no descriptor value ' + name, descriptor)
      },

      set: function(target, name, value, receiver) {
        console.log("set " + name + " begins >>>>>");
        fakeMaker._preSet(obj, name, value, receiver, path + '.set(' + name + ')');
        obj[name] = value;
        if (name === 'fontStyle')
          console.log('set fontStyle to ' + value);
        console.log("set " + name + " returns <<<<<");
        return true;
      },

      defineProperty: function(target, name, desc) {
        if (get_set_debug)
          console.log('defineProperty ' + name + ' at ' + path);
        fakeMaker._preSet(obj, name, desc.value, null, path + '.defineProperty(' + name + ')');
        var result = Object.defineProperty(obj, name, desc);
        // Write a descriptor on the target.
        // Use the just-changed value of the obj descriptor, since the 'defineProperty' is really 'update properties'
        var updatedDescriptor = Object.getOwnPropertyDescriptor(obj, name);
        Object.defineProperty(target, name, updatedDescriptor);
        if (get_set_debug) {
          console.log('defineProperty: ' + name + ' input descriptor ', desc);
          console.log('defineProperty: ' + name + ' target descriptor ', Object.getOwnPropertyDescriptor(target, name));
          console.log('defineProperty: ' + name + ' obj descriptor ', updatedDescriptor);
          console.log('defineProperty result on obj ', result);
        }
        return result;
      },

      // target.apply(thisArg, args)
      apply: function(target, thisArg, args) {
        if (calls_debug && (thisArg === window || obj === window)) {
          console.log('apply: thisArg === window: ' + (thisArg === window));
          console.log('apply: obj === window: ' + (obj === window));
        }
        // If we now call a DOM function it could operate on the proxy and cause
        // records to be created; In the player there will be no DOM function and
        // these records will not be replayed. So we pass original objects except
        // for callback functions.
        var deproxiedthisArg = fakeMaker.toObject(thisArg);
        deproxiedthisArg = deproxiedthisArg || thisArg;
        var indexOfFunctionProxy = fakeMaker._proxiedObjects.indexOf(obj);
        var functionProxy = fakeMaker._proxiesOfObjects[indexOfFunctionProxy];
        var DOMCallbackIndex = fakeMaker._functionProxiesThatTakeCallbackArgs.indexOf(functionProxy);
        if (calls_debug) {
          console.log('apply: ' + path + ' proxy index  ', indexOfFunctionProxy + ' isA ' + (typeof functionProxy) + ' isAProxy ' + fakeMaker.isAProxy(functionProxy));
          console.log('apply: ' + path + ' __DOMFunctionsThatCallback ', DOMCallbackIndex);
        }
        var deproxiedArgs;
        if (DOMCallbackIndex !== -1)
          deproxiedArgs = fakeMaker._callbackArgHandlers[DOMCallbackIndex](args, path);
        else
          deproxiedArgs = fakeMaker.deproxyArgs(args, deproxiedthisArg, path);

        if (calls_debug) {
          console.log("apply with this: "+ typeof(deproxiedthisArg) + ' proxyIndex: ' + fakeMaker._proxiesOfObjects.indexOf(thisArg) + ", args " + deproxiedArgs.length + ' at ' + path + '()');
          console.log("apply thisArg === deproxiedthisArg: "+ (thisArg === deproxiedthisArg));
          deproxiedArgs.forEach(function(arg, index) {
            console.log('apply ['+index +']=', typeof arg);
          });
        }
        var result = Reflect.apply(obj, deproxiedthisArg, deproxiedArgs);
        return fakeMaker._wrapCallResult(result, thisArg, path + '()');
      },

      // new target(args)
      construct: function(target, args) {
          var deproxiedArgs = fakeMaker.deproxyArgs(args, obj, path);
          if (calls_debug) {
            console.log('construct '+ path + ' args ' + args.length);
            args.forEach(function(arg, index) {
              console.log('construct args ['+index +'] ' + typeof(arg));
            });
          }
          // We can't use Reflect.construct because "DOM object constructor cannot be called as a function."
          var returnValue;
          if (args.length === 0)
            returnValue = new obj();
          else if (args.length === 1)
            returnValue = new obj(deproxiedArgs[0]);
          else if (args.length === 2)
            returnValue = new obj(deproxiedArgs[0], deproxiedArgs[1]);
          else if (args.length === 3)
            returnValue = new obj(deproxiedArgs[0], deproxiedArgs[1], deproxiedArgs[2]);
          else if (args.length === 4)
            returnValue = new obj(deproxiedArgs[0], deproxiedArgs[1], deproxiedArgs[2], deproxiedArgs[3]);
          else
            returnValue = Reflect.construct(obj, deproxiedArgs);
          if (calls_debug)
            console.log("construct result " + ((returnValue !== null) ? typeof(returnValue) : 'null'));
          return fakeMaker._wrapCallResult(returnValue, obj, path + '.new()');
      },

      getOwnPropertyNames: function(target) {
        if (recording_debug)
          console.log('getOwnPropertyNames  at ' + path)
        var result = Object.getOwnPropertyNames(obj);
        if (recording_debug)
          console.log('getOwnPropertyNames ', result);
        // Mark these names as accessed so they are written on the object ref for playback.
        result.forEach(function(name) {
          fakeMaker._markAccess(obj, name, path);
        });
        return result;
      },

      getPrototypeOf: function(target) {
        var result = fakeMaker._wrapReturnValue(Object.getPrototypeOf(obj), obj, path + '.getPrototypeOf');
        if (recording_debug)
          console.log('getPrototypeOf at ' + path + '.getPrototypeOf');
        return result;
      },
      setPrototypeOf: function(target, newProto) {
        fakeMaker._preSet(obj, '__proto__', newProto, null, path + '.setPrototypeOf');
        return Reflect.setPrototypeOf(obj, newProto);
      },
      deleteProperty: function(target, name) {
        // TODO: we need to remove properties on the Player?
        return Reflect.deleteProperty(obj, name);
      },
      enumerate: function(target) {
        var result = Reflect.enumerate(obj);
        if (recording_debug)
          console.log('enumerate ', result);
        // Mark these names as accessed so they are written on the object ref for playback.
        result.forEach(function(name) {
          fakeMaker._markAccess(obj, name, path);
        });
        return result;
      },
      preventExtensions: function(target) {
        // Forward only.
        var result = Reflect.preventExtensions(obj);
        return fakeMaker._lookupProxyObject(result, path);
      },
      isExtensible: function(target) {
        var result = Reflect.isExtensible(obj);
        if (recording_debug)
          console.log('isExtensible ', result);
        return fakeMaker._record(result, path + '.isExtensible');
      },
      ownsKeys: function(target) {
        var result = ownKeys(obj);
        if (recording_debug)
          console.log('ownsKeys ', result);
        // An array of strings, no need to wrap in proxy
        return fakeMaker._record(result, path + '.enumerate');
      }
    };

    var proxy = Proxy(shadow,  proxyImpl);

    // Accumulate the property names on the original object before registering
    // our new object as proxied.
    var originalProperties = [];
    var attributesName = '.attributes';
    if (path.indexOf(attributesName, path.length - attributesName.length) !== -1 && obj.getNamedItem) {
      for (var i = 0; i < obj.length; i++)
        originalProperties.push(obj[i].nodeName);
      if (maker_debug)
        console.log(attributesName + ' found ', originalProperties)
    }

    originalProperties = originalProperties.concat(Object.getOwnPropertyNames(obj));

    if (maker_debug)
      console.log('Accumulated ' + originalProperties.length + ' originalProperties ' + path);

    var indexOfProxy = this._registerProxyObject(obj, theThis, proxy);
    this._originalProperties[indexOfProxy] = originalProperties;
    if (fakeMaker._proxiedObjects.indexOf(obj) === -1)
      throw new Error("No proxy for object at "+path);

    if (maker_debug) {
      console.log(proxyDepth + ': _createProxyObject ' + path);
    }
    proxyDepth--;
    return proxy;
  },

  // These DOM functions must be run as built-in on the playback.
  // Eg document.write(script tag). TODO check that the write is a script tag.
  _dontProxy: function(path, obj, name) {
    if (name === 'write' && path === 'window.document') {
      var dontProxy = {_do_not_proxy_function_: 'document.write.bind(document)'};

      // Mark the special case object as proxied for toJSON
      var value = obj[name];
      var indexOfProxy = this._registerProxyObject(value, obj, dontProxy);
      var ref = this._getOrCreateFunctionObjectRef(value, path + '.' + name);
      ref._do_not_proxy_function_ = 'document.write.bind(document)';

      // Mark the container as accesses at the name of the special case.
      this._markAccess(obj, name, path);
      return function() {
        console.log('document.write ', arguments[0]);
        obj[name].call(obj, arguments[0]);
      }
    }
  },

  functionProperties : ["length", "name", "arguments", "caller", "prototype"],

  _getObjectReferenceIndex: function(value, propertyName) {
    var indexOfRefedObject = this._objectsReferenced.indexOf(value);
    if (indexOfRefedObject === -1) {
      if (this.isAProxy(value)) {
        if (recording_debug)
          console.log('_replaceObjectsAndFunctions descriptor.value isAProxy ' + propertyName);

        var indexOfProxy = this._proxiesOfObjects.indexOf(value);
        var objProxied = this._proxiedObjects[indexOfProxy];
        indexOfRefedObject = this._objectsReferenced.indexOf(objProxied);

        if (recording_debug) {
          console.log('_replaceObjectsAndFunctions '+ propertyName
              +' found proxy, returning ref ', this._objectReferences[indexOfRefedObject]);
        }
      } // else the propertyName may have been used in getOwnPropertyNames only
    }
    return indexOfRefedObject;
  },

  // Given an obj and a propertyName we know was accessed, return value so
  // FakePlayer can reconstitute the property.

  _replaceObjectsAndFunctions: function(obj, propertyName) {
    var jsonablePropertyRep = {};

    // Set object reference for __proto__ property.
    if (propertyName === '__proto__') {
      var protoValue = Object.getPrototypeOf(obj);
      if (!protoValue) {
        jsonablePropertyRep = {'_fake_undefined': true};
      } else {
        var index = this._getObjectReferenceIndex(protoValue, propertyName);
        if (index !== -1)
          jsonablePropertyRep = this._objectReferences[index];
        else
          console.log('_replaceObjectsAndFunctions found proto without proxy ' + Object.getOwnPropertyNames(protoValue));
      }
      if (recording_debug)
        console.log('_replaceObjectsAndFunctions ' + propertyName + ' jsonable ', jsonablePropertyRep);
      return jsonablePropertyRep;
    }

    // Other properties will be replay() functions in the player.
    return jsonablePropertyRep = 1;
  },

};

window.FakeMaker = FakeMaker;

}());
