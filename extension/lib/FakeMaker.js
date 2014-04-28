// .noTranscode
/* Copyright 2013 Google. All rights reserved.
 *
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file or at
 * https://developers.google.com/open-source/licenses/bsd
*/

(function(){

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
  this._proxiedObjectRecievers = [];
  this._expandoProperties = [];
  this._originalProperties = []; // object keys when proxy first created.
  this._setExpandoGlobals = [];
  this._expandoPrototypes = [];

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
    // call the closure-bound definition before proxies.
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
          console.log('registerElement  ' + elementName);
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
            fakeMaker._expandoPrototypes.push(prototypeCopy);
            if (calls_debug) {
              var deproxiedProtoLength = Object.getOwnPropertyNames(deproxiedProto).length;
              var prototypeCopyLength = Object.getOwnPropertyNames(prototypeCopy).length;
              console.log('proto comparison ' + deproxiedProtoLength +' === ' + prototypeCopyLength);
              console.assert(deproxiedProtoLength === prototypeCopyLength);
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
            this._getOrCreateProxyObject(window[name], window[name], 'window.'+name);
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
    this._proxiedObjectRecievers.push(theThis);  // TODO remove and arg also
    this._proxiesOfObjects.push(proxy);
    return this._proxiesOfObjects.length - 1;
  },

  // Objects map uniquely to a proxy: lookup map entry.
  _lookupProxyObject: function(obj, theThis, path) {
    var index = this._proxiedObjects.indexOf(obj);
    if (index !== -1) {
      if (typeof obj === 'object' || !theThis ||
        theThis === this._proxiedObjectRecievers[index]) {
        if (recording_debug) {
              console.log('_lookupProxyObject found index: ' +
                index + ', typeof: ' + (typeof obj) + ' at ' + path);
        }
        return this._proxiesOfObjects[index];
      }
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
      var jsonableObjectRep = {};
      var fakeMaker = this;
      var rep = jsonableObjectRep;
      var repPath = path;
      // Walk the proto chain of obj and set fake protos on jsonableObjectRep.
      this._someProtos(Object.getPrototypeOf(obj), function(proto) {
        var indexOfRefedProto = fakeMaker._objectsReferenced.indexOf(proto);
        repPath = repPath + '__proto__';
        if (indexOfRefedProto === -1) {
          rep._fake_proto_  = fakeMaker._getOrCreateObjectRef(proto, repPath);
        } else {
          rep._fake_proto_ = fakeMaker._objectReferences[indexOfRefedProto];
        }
        rep = rep._fake_proto_;
        return (indexOfRefedProto !== -1);  // stop if we found a proxy on chain
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
    return this._lookupProxyObject(obj, theThis, path) ||
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
      if (calls_debug)
        console.log('_proxyACallback callback called ' + path + ' with depth ' + __F_.depth);

      // Record this call. We are called out of the DOM so we have to assume no proxies exist.
      var fncProxy = fakeMaker._getOrCreateProxyObject(callback, this, path);
      var ref = fakeMaker._getOrCreateFunctionObjectRef(callback, path);
      var refThis = fakeMaker._getOrCreateObjectRef(this, path+'.this');
      ref._callback_this = refThis._fake_object_ref;
      ref._callback_ = fakeMaker._callbacks.indexOf(callback);
      // The lifecycle events for custom elements are called synchronously but our
      // the call stack depth will be zero because we don't transcode the caller.
      ref._callback_depth = __F_.depth || sync;
      fakeMaker._record(ref, path + '-callback');

      // Simulate  'this.callback(args)' having a proxy for 'this'.
      // In normal proxy.apply, 'this' is already proxied because the .apply was preceded by a .get().
      // But in callback apply here, the DOM has the 'this' object. So we need to proxy it to
      // record the callback actions.
      var proxyThis = fakeMaker._getOrCreateProxyObject(this, null, path + '.this');
      if (calls_debug)
        console.log('_proxyACallback entering callback with "this" ref index ' + refThis._fake_object_ref);
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
      console.log('no existing expando ' + name + ' next look in original');

    if (this._originalProperties[indexOfProxy].indexOf(name) === -1) {
      // Not on the object when we created the proxy: is an expando.
      var isElementId = (obj === window) && this.isElementId(name);
      if (!isElementId) {
        // Not a special case of an element id
        var descriptor = Object.getOwnPropertyDescriptor(obj, name);
        if (descriptor && descriptor.set) {
          if (expando_debug)
           console.log('set found setter ' + name);
          // setters are not expandos, just ignore the set.
          return false;
        }
        return true;
      }
    }
    return false;
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

  getExpandoProperty: function(obj, name) {
    var indexOfProxy = this._proxiedObjects.indexOf(obj);
    if (expando_debug) console.log('looking for expando ' + name + ' in obj at index ' + indexOfProxy);
    if (!(indexOfProxy !== -1)) {
      console.log('getExpandoProperty typeof obj: ' + (obj ? typeof(obj) : 'null') + ' name ' + name);
      console.log('getExpandoProperty obj: ' + Object.getOwnPropertyNames(obj).join(','));
      throw new Error('getExpandoProperty Assert FAILS indexOfProxy !== -1 for name ' + name);
    }
    if (name === 'console' && obj === window)
      return console;

    if (obj === window && this.exclusions.indexOf(name) !== -1) {
      if (expando_debug) console.log('found exclusion ' + name);
      return {value: window[name]};
    }

    var expandos = this._expandoProperties[indexOfProxy];
    if (expandos && expandos.hasOwnProperty(name)) {
      var value = obj[name];
      if (expando_debug)
        console.log('found expando property ' + name + ' own: ', Object.getOwnPropertyNames(value));
      console.log('found expando property its getPrototypeOf ', Object.getOwnPropertyNames(Object.getPrototypeOf(value)));
      console.log('found expando property its proto ', Object.getOwnPropertyNames(value.__proto__));
      return {value: value};
    }

    if (this.shouldBeExpando(obj, name, indexOfProxy)) {
      this.registerExpando(obj, name);
      return {value: obj[name]};
    }
    if (expando_debug)
      console.log(name +' not expando, was in list of originalProperties[' + indexOfProxy + '], mark access');
    this._markAccess(indexOfProxy, name);
  },

  _markAccess: function(indexOfProxy, name) {
    // The DOM property 'name' was used by the app.
    var obj = this._proxiedObjects[indexOfProxy];
    var indexOfRefedObject = this._objectsReferenced.indexOf(obj);

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

  _getFromPropertyDescriptor: function(obj, target, name, receiver, descriptor, ownsName, path) {
    var result;
    if (!descriptor) {
      result = this._wrapReturnValue(undefined, undefined, path + '.' + name);
      if (get_set_debug)
        console.log('_getFromPropertyDescriptor ' + name + ': undefined ' + path);
    } else if (descriptor.get) {
      this.stopRecording(path);
      var value = Reflect.get(ownsName, name, obj);
      this.startRecording(path);
      result = this._wrapCallResult(value, ownsName, path + '.' + name);
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
    } else {
      // Wrap the value and return it.
      result = this._wrapPropertyDescriptor(target, name, descriptor, ownsName, path).value;
      if (get_set_debug)
        console.log('_getFromPropertyDescriptor from defineProperty: ' + name + ' {' + typeof descriptor.value + '} at ' + path);
    }
    return result;
  },

  _preSet: function(obj, name, value) {
    // In set/defineProperty we don't want to wrap the value, just
    // record that it was set in case JS code later reads it.
    var indexOfProxy = this._proxiedObjects.indexOf(obj);
    if (indexOfProxy === -1)
      throw new Error('set: No proxy for object at ' + path);

    // Force the name to become an expando
    var isExpando = this.getExpandoProperty(obj, name);
    if (isExpando) {
      if (expando_debug)
        console.log('set found expando, set ' + name + ' to ' + typeof(value));
      if (obj === window) {
        this._setExpandoGlobals.push(name);
        if (expando_debug)
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
      shadow = function(){};
    else
      throw new Error('Cannot make proxy for ' + typeof obj);

    if (fakeMaker.isAProxy(obj))
      throw new Error('_createProxyObject on proxy object ' + path);

    var proxyImpl = {  // close over 'obj' and 'path'

      // target[name] or getter
      get: function(target, name, receiver) { // target is bound to the shadow object
        if (typeof obj === 'function' && name === 'name')
          throw new Error('get typeof function name === \'name\'');
        // Secret property name for debugging
        if (name === '__fakeMakerProxy')
          return true;

        if (fakeMaker.isAProxy(obj))
          throw new Error('get on proxy object');

        if (name === '__proto__') { // then we can't use getOwn* functions
          if (get_set_debug)
            console.log('get __proto__ at ' + path  + '.__proto__');
          var protoValue = Object.getPrototypeOf(obj);

          if (protoValue && fakeMaker.isAProxy(protoValue))
            console.log('__proto__ isAProxy yea baby')
          else
            console.log('__proto__ own properties ', Object.getOwnPropertyNames(protoValue));
          console.log('obj own ',  Object.getOwnPropertyNames(obj));

          if (protoValue)
            return fakeMaker._getOrCreateProxyObject(protoValue, obj, path, path + '.__proto__');
          else
            return fakeMaker._wrapReturnValue(protoValue, obj, path  + '.__proto__');
        }
        // Was this property written by JS onto obj?
        var result = fakeMaker.getExpandoProperty(obj, name);
        if (result)
          return result.value; // Yes, then player need not know about it.

        if (get_set_debug) {
          console.log('get ' + name + ' obj === window: ' + (obj === window),
            ' obj: ' + fakeMaker.classNameIfPossible(obj));
        }

        if (get_set_debug)
          console.log('get look for ownsName and descriptor ' + path + '.' + name);

        var descriptor;
        var ownsName;
        fakeMaker._someProtos(obj, function(proto) {
          ownsName = proto;
          return descriptor = Object.getOwnPropertyDescriptor(ownsName, name);
        }, path);

        if (get_set_debug) console.log('get descriptor ' + name, descriptor);

        var result = fakeMaker._getFromPropertyDescriptor(obj, target, name, receiver, descriptor, ownsName, path);

        // '.apply()' will need to process some functions for callbacks before they go into the DOM. But it does not
        // know the name of the function it will call. So we check the name here and mark the shadow/target for apply
        if(name in fakeMaker._DOMFunctionsThatCallback) {
          if (get_set_debug) {
            var indexOfResult = fakeMaker._proxiesOfObjects.indexOf(result);
            console.log(name + ' isA _DOMFunctionsThatCallback ' + path + ' pushing ' + (typeof result) + ' isAProxy ' + fakeMaker.isAProxy(result) + ' index ' + indexOfResult );
          }
          fakeMaker._functionProxiesThatTakeCallbackArgs.push(result);
          fakeMaker._callbackArgHandlers.push(fakeMaker._DOMFunctionsThatCallback[name].bind(fakeMaker));
        }

        return result;
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
        var result = fakeMaker.getExpandoProperty(obj, name);
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
        fakeMaker._preSet(obj, name, value);
        Reflect.set(obj, name, value);
        return true;
      },

      defineProperty: function(target, name, desc) {
        if (get_set_debug)
          console.log('defineProperty ' + name + ' at ' + path);
        fakeMaker._preSet(obj, name, desc.value);
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
        var deproxyArgs;
        var indexOfFunctionProxy = fakeMaker._proxiedObjects.indexOf(obj);
        var functionProxy = fakeMaker._proxiesOfObjects[indexOfFunctionProxy];
        var hasDOMCallbacks = fakeMaker._functionProxiesThatTakeCallbackArgs.indexOf(functionProxy);
        if (calls_debug) {
          console.log('apply: ' + path + ' proxy index  ', indexOfFunctionProxy + ' isA ' + (typeof functionProxy) + ' isAProxy ' + fakeMaker.isAProxy(functionProxy));
          console.log('apply: ' + path + ' __DOMFunctionsThatCallback ', hasDOMCallbacks);
        }
        if (hasDOMCallbacks !== -1)
          deproxiedArgs = fakeMaker._callbackArgHandlers[hasDOMCallbacks](args, path);
        else
          deproxiedArgs = fakeMaker.deproxyArgs(args, deproxiedthisArg, path);

        if (calls_debug) {
          console.log("apply with this: "+ typeof(deproxiedthisArg) + ' proxyIndex: ' + fakeMaker._proxiesOfObjects.indexOf(thisArg) + ", args " + deproxiedArgs.length + ' at ' + path + '()');
          console.log("apply thisArg === deproxiedthisArg: "+ (thisArg === deproxiedthisArg));
          deproxiedArgs.forEach(function(arg, index) {
            console.log('apply ['+index +']=',arg);
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
        var result = Reflect.getOwnPropertyNames(obj);
        if (recording_debug)
          console.log('getOwnPropertyNames ', result);
        // Mark these names as accessed so they are written on the object ref for playback.
        var indexOfProxy = fakeMaker._proxiedObjects.indexOf(obj);
        result.forEach(function(name) {
          fakeMaker._markAccess(indexOfProxy, name);
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
        fakeMaker._preSet(obj, '__proto__', newProto);
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
        var indexOfProxy = fakeMaker._proxiedObjects.indexOf(obj);
        result.forEach(function(name) {
          fakeMaker._markAccess(indexOfProxy, name);
        });
        return result;
      },
      preventExtensions: function(target) {
        // Forward only.
        var result = Reflect.preventExtensions(obj);
        return fakeMaker._lookupProxyObject(result, result, path);
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

    if (maker_debug)
      console.log('Accumulate originalProperties ' + path);
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

    fakeMaker._someProtos(obj, function(proto) {
      if (fakeMaker._expandoPrototypes.indexOf(proto) !== -1) {
        if (maker_debug)
          console.log('Do not add originalProperties found in  _expandoPrototypes ' + path + ', skipping ' + Object.getOwnPropertyNames(proto).join(','));
        return;
      }
      originalProperties = originalProperties.concat(Object.getOwnPropertyNames(proto));
    }, path);

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
      var indexOfContainerProxy = this._proxiedObjects.indexOf(obj);
      this._markAccess(indexOfContainerProxy, name);
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
