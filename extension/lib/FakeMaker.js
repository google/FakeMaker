// .noTranscode
/* Copyright 2013 Google. All rights reserved.
 *
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file or at
 * https://developers.google.com/open-source/licenses/bsd
*/

(function(){

var _debug = false;
var maker_debug = _debug;
var expando_debug = _debug;
var accesses_debug = _debug;
var get_set_debug = _debug;
var calls_debug = _debug;
var recording_debug = _debug;

function FakeObjectRef(index) {
  this._fake_object_ref = index;
}

var proxyDepth = 0;

function FakeMaker() {
  // Co-indexed
  this._proxiedObjects = [];
  this._proxiesOfObjects = [];
  this._proxiedObjectRecievers = [];
  this._propertiesAccessedOnProxies = [];
  this._expandoProperties = [];
  this._originalProperties = []; // object keys when proxy first created.
  this._setExpandoGlobals = [];

  this._callbacks = [];

  this._objectsReferenced = [];
  this._objectReferences = [];

  this._recording = []; // Number, String, Boolean. Objects are refs to _objectsReferenced

  this._proxyPropertyNamePath = [];
  this.exclusions = FakeCommon.chromeBuiltins.concat([
    'Proxy', 'Reflect', 'FakeMaker', 'FakePlayer', 'location', 'webkitStorageInfo', '__F_',
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

  this.nonDOM = {
    addEventListener: function(fakeMaker, name, callback, capturing) {
      // This function is called with the apply for eg dispatchEvent
      function wrappedCallback(event) {
        var path = name + '-event';
        console.log('addEventListener wrappedCallback ' + path);
        var eventProxy = fakeMaker._wrapReturnValue(event, event, path);
        fakeMaker.startRecording(path);
        fakeMaker._record(fakeMaker._getOrCreateObjectRef(event, path), path);
        callback(eventProxy);
        fakeMaker.stopRecording(path);
      }
      return this.addEventListener(name, wrappedCallback, capturing);
    },
    setTimeout: function(callback, delay) {
      function wrappedCallback(event) {
        var path = 'setTimeout-event';
        var eventProxy = fakeMaker._wrapReturnValue(event, event, path);
        fakeMaker.startRecording(path);
        fakeMaker._record(fakeMaker._getOrCreateObjectRef(event, path), path);
        callback(eventProxy);
        fakeMaker.stopRecording(path);
      }
      return this.setTimeout(wrappedCallback, delay);
    }
  }
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
    this.stopRecording('');
    this.startRecording = function() {}
    // The object graph is encoded as an array of objects with properties that are
    // 1) references into the array (for objects or functions), or
    // 2) empty objects meaning value-returning properties recorded in 'recording'
    var jsonableProxiesOfObjects = [];
    // The number of _objectsReferenced increases as we prepare them.
    for (var i = 0; i < this._objectsReferenced.length; i++) {
      var obj = this._objectsReferenced[i];
      var index = this._proxiedObjects.indexOf(obj);
      if (index === -1) {
        // Perhaps we recorded a proxy, eg a window.prop we created in makeFakeWindow();
        index = this._proxiesOfObjects.indexOf(obj);
        if (index === -1) {
          throw new Error('Recorded object not proxied and not a proxy');
        } else {
          obj = this._proxiedObjects[index];
        }
      }
      var accessedProperties = this._propertiesAccessedOnProxies[index];

      if (accesses_debug) {
        if (accessedProperties)
          console.log('accessedProperties: ' + Object.keys(accessedProperties).join(','));
        else
          console.log('no accessedProperties on recorded object ' + i);
      }

      var objectReference = this._objectReferences[i];
      jsonableProxiesOfObjects.push(this._preparePropertiesForJSON(objectReference, obj, accessedProperties || []));
    }

    var fullRecord = {
      objects: jsonableProxiesOfObjects,
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
            this._proxyObject(window[name], window[name], 'window.'+name);
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
    } else if (typeof value === 'string') {
      return value.replace(/\"/, '\'');
    } else {
      return value;
    }
  },

  // Objects map uniquely to a proxy: create map entry.
  _registerProxyObject: function(obj, theThis, proxy) {
    this._proxiedObjects.push(obj);
    this._proxiedObjectRecievers.push(theThis);
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
    if (index !== -1) {// The object is a proxy.
      console.log('_lookupProxyObject found a proxy at ' + path)
      return obj;
    }

    if (maker_debug)
      console.log('_lookupProxyObject no find for object typeof ' + typeof obj);
  },

  isAProxy: function(obj) {
    return (this._proxiesOfObjects.indexOf(obj) !== -1);
  },

  _getOrCreateObjectRef: function(obj, path) {
    if (!(obj))
      throw new Error('null object passed to _getOrCreateObjectRef');

    var index = this._objectsReferenced.indexOf(obj);
    var ref;
    if (index !== -1) {
      ref = this._objectReferences[index];
    } else {
      ref = new FakeObjectRef(this._objectsReferenced.length);
      this._objectReferences.push(ref);
      this._objectsReferenced.push(obj);
    }

    if (recording_debug) {
      var message;
      if (index === -1) {
        message =  'create ' + (this._objectsReferenced.length - 1);
      }  else {
        message = 'get ' + index;
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
      if (!value._fake_object_ref)
        throw new Error('Attempt to record an object');
      this._recording.push(value);
    } else if (typeof value === 'undefined') {
      // we cannot JSON.stringify undefined.
      this._recording.push({'_fake_undefined': undefined});
    } else if (typeof value === 'function') {
      throw new Error('Attempt to record a function');
    } else {
      this._recording.push(value);
    }
    if (recording_debug)
      console.log("_record " + (this._recording.length - 1) + '@' + path, typeof value);

    this._recording.push(path + ' ' + (__F_.calls.length - 1));
    return value;
  },

  _proxyObject: function(obj, theThis, path) {
    if (!obj)
      return obj; // typeof null === 'object'
    return this._lookupProxyObject(obj, theThis, path) ||
        this._createProxyObject(obj, theThis, path);
  },

  _wrapReturnValue: function(value, theThis, path) {
    if (get_set_debug || calls_debug)
      console.log('_wrapReturnValue ' + path + ' type:', typeof(value));

    switch (typeof value ) {
      case 'object':
      case 'xml':
        if (!value) // Don't record null as object
          return this._record(value, path);
        // Compound values are set into the object graph.
        // The player will re-constitute the object graph to support
        // accesses to these values.
        this._getOrCreateObjectRef(value, path);
        break;
      case 'function':
        this._getOrCreateFunctionObjectRef(value, path);
        break;
      default:
        // Simple values are recorded. The player will replay these values
        // using getters set into object properties.
        return this._record(value, path);
    }
    // Compound values are tracked recursively.
    return this._proxyObject(value, theThis, path);
  },

  // helper for proxy apply and construct
  _wrapCallResult: function(obj, path, callback) {
      var returnValue = callback();
      var result = this._wrapReturnValue(returnValue, obj, path);
      if (this.isAProxy(result)) { // Then we did not record the return value, record its ref.
          this._record(this._getOrCreateObjectRef(returnValue, path), path);
      }
      return result;
  },

  _proxyACallback: function(callback, theThis, path) {
    if (calls_debug)
     console.log('_proxyACallback ' + path);

    var fakeMaker = this;
    fakeMaker._callbacks.push(callback);  // Assign a number to each callback.
    if (fakeMaker.isAProxy(callback))
      throw new Error('_proxyACallback sees a proxy');
    if (fakeMaker.isAProxy(theThis))
      throw new Error('_proxyACallback sees theThis as a proxy');

    return function() {
      if (calls_debug)
        console.log('_proxyACallback callback called ' + path + ' with depth ' + __F_.depth);
      var fncProxy = fakeMaker._wrapReturnValue(callback, theThis, path);
      var ref = fakeMaker._getOrCreateFunctionObjectRef(callback, path);
      ref._callback_ = fakeMaker._callbacks.indexOf(callback);
      ref._callback_depth = __F_.depth;
      fakeMaker._record(ref, path + '-callback');
      Reflect.apply(callback, theThis, arguments);
    }
  },

  deproxyArgs: function(args, theThis, path) {
    var fakeMaker = this;
    return args.map(function(argMaybeProxy, index) {
      if (typeof argMaybeProxy === 'function')
        return fakeMaker._proxyACallback(argMaybeProxy, theThis, path);

      var proxyIndex = fakeMaker._proxiesOfObjects.indexOf(argMaybeProxy);
      if (calls_debug)
        console.log('arg ' + index + ' is proxy at ' + proxyIndex);

      if (proxyIndex === -1)
       return argMaybeProxy;
      else
        return fakeMaker._proxiedObjects[proxyIndex];
    });
  },

  // Expandos are values added to DOM globals by JS.
  // We don't want to record or proxy them.
  registerExpando: function(obj, name) {
      var indexOfProxy = this._proxiedObjects.indexOf(obj);
      if (!(indexOfProxy !== -1))
        throw new Error('registerExpando Assert FAILS indexOfProxy !== -1')

      var expandos = this._expandoProperties[indexOfProxy] =
          this._expandoProperties[indexOfProxy] || {};

      expandos[name] = true;
      if (expando_debug) {
        console.log('registered expando property ' + name +
          ' of ' + Object.keys(expandos).length);
      }
  },

  getExpandoProperty: function(obj, name) {
    if (expando_debug) console.log('looking for expando ' + name);

    var indexOfProxy = this._proxiedObjects.indexOf(obj);
    if (!(indexOfProxy !== -1)) {
      console.log('getExpandoProperty typeof obj: ' + (obj ? typeof(obj) : 'null') + ' name ' + name);
      console.log('getExpandoProperty constructor name : ' + obj.constructor.name);
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
      if (expando_debug)
        console.log('found expando property ' + name + ' of ' + typeof(obj[name]));
      return {value: obj[name]};
    }

    if (expando_debug)
      console.log('no existing expando ' + name + ' next look in original');

    var isElementId = (obj === window) && this.isElementId(name);

    if (this._originalProperties[indexOfProxy].indexOf(name) === -1) {
      // Not on the object when we created the proxy.
      if (!isElementId) {
        // Not a special case of an element id
        this.registerExpando(obj, name);
        return {value: obj[name]};
      }
    }
    if (expando_debug)
      console.log('expando ' + name +' was in list of originalProperties, mark access');
    this._markAccess(indexOfProxy, name);
  },

  _markAccess: function(indexOfProxy, name) {
    var accessed = this._propertiesAccessedOnProxies[indexOfProxy] =
        this._propertiesAccessedOnProxies[indexOfProxy] || Object.create(null);
    accessed[name] = accessed[name] ? (++accessed[name]) : 1;

    if (accesses_debug) {
      var obj = this._proxiedObjects[indexOfProxy];
      var indexOfRef = this._objectsReferenced.indexOf(obj);
      var ref;
      if (indexOfRef !== -1) {
        ref = this._objectReferences[indexOfRef];
      }
      console.log('Counted access to ' + name + ' = ' + accessed[name] +
            (ref ?  ', ref ' + ref._fake_object_ref : ', not refed <<<!!??'));
    }

    if (typeof accessed[name] !== 'number')
      throw new Error('Access count must be a number ' + (typeof accessed[name]));

    if (name === '__proto__' && this._propertiesAccessedOnProxies[indexOfProxy][name] > 9)
      throw new Error("infinite __proto__ recursion?");
  },

  _getPropertyDescriptor: function(target, name) {
    var descriptor = Reflect.getOwnPropertyDescriptor(target, name);
    if (!descriptor) {
      var proto = Reflect.getPrototypeOf(target);
      if (proto)
        return this._getPropertyDescriptor(proto, name);
    }
    return descriptor;
  },

  toObject: function(maybeProxy) {
    var index = this._proxiesOfObjects.indexOf(maybeProxy);
    if (index !== -1)
      return this._proxiedObjects[index];
    return maybeProxy;
  },

  classNameIfPossible: function(obj) {
    var ctor = this.toObject(this.toObject(obj).constructor);
    if (ctor) {
      return this.toObject(ctor.name)
    }
  },

  _createProxyObject: function(obj, theThis, path) {
    if (proxyDepth++ > 10)
      throw new Error("we are in too deep....");
    if (obj === null)
      throw new Error('Do not proxy null');
    var fakeMaker = this;
    var shadow;
    if (typeof obj === 'object')
      shadow = {};
    else if (typeof obj === 'function')
      shadow = function(){};
    else
      throw new Error('Cannot make proxy for ' + typeof obj);

    if (fakeMaker.isAProxy(obj))
      throw new Error('_createProxyObject on proxy object ' + path);

    var proxy = Proxy(shadow, {

      // target[name] or getter
      get: function(target, name, receiver) { // target is bound to the shadow object

        // Is this a DOM operation needed for JS to work correctly?
        var dontProxy = fakeMaker._dontProxy(path, obj, name);
        if (dontProxy)
          return dontProxy;  // Yes, just let the player call it.

        // Was this property written by JS onto obj?
        var result = fakeMaker.getExpandoProperty(obj, name);
        if (result)
          return result.value; // Yes, then player need not know about it.

        if (fakeMaker.isAProxy(obj))
          throw new Error('get on proxy object');

        if (get_set_debug) {
          console.log('get ' + name + ' obj === window: ' + (obj === window),
            ' obj: ' + fakeMaker.classNameIfPossible(obj));
        }

        var descriptor;
        var protoPath = '';
        var ownsName = obj;
        while(ownsName) {
          descriptor = Object.getOwnPropertyDescriptor(ownsName, name);
          if (descriptor)
            break;
          ownsName = Reflect.getPrototypeOf(ownsName);
          protoPath += '.__proto__';
          if (get_set_debug)
            console.log('proto climbing ' + protoPath + '.' + name + ', ownsName: ', ownsName);
        }

        if (get_set_debug) console.log('get descriptor ', descriptor);

        if (!descriptor) {
          result = fakeMaker._wrapReturnValue(undefined, undefined, path + '.' + name);
          if (get_set_debug)
            console.log('get ' + name + ': undefined ' + path);
          return result;
        }

        if (descriptor.get) {
          fakeMaker.stopRecording(path);
          var value = Reflect.get(ownsName, name, receiver);
          fakeMaker.startRecording(path);
          result = fakeMaker._wrapReturnValue(value, obj, path + '.' + name);
          if (get_set_debug)
            console.log('get from getter ' + name+ ' {' + typeof result + '}' + path);
        } else {
          if (!fakeMaker.isAProxy(descriptor.value)) {
            descriptor.value = fakeMaker._wrapReturnValue(descriptor.value, obj, path + '.' + name);
            Object.defineProperty(target, name, descriptor);
             if (get_set_debug)
              console.log('get from defineProperty: ' + name + ' {' + typeof descriptor.value + '} at ' + path);
          }  else {
            // else we know the property is an object or function
            // (because it has a proxy) so the object graph will handle this, ref it.
            var indexOfObj = fakeMaker._proxiesOfObjects.indexOf(descriptor.value);
            var getTargetObj = fakeMaker._proxiedObjects[indexOfObj];
            if (typeof getTargetObj === 'object')
              fakeMaker._getOrCreateObjectRef(getTargetObj, path);
            else if (typeof getTargetObj === 'function')
              fakeMaker._getOrCreateFunctionObjectRef(getTargetObj, path);
            else
              throw new Error('Proxy get for proxy is not an object or function');

            if (get_set_debug)
              console.log('get returns existing proxy for : ' + name + ' {' + typeof getTargetObj + '} at ' + path);
          }
          result = descriptor.value;
        }
        return result;
      },

      set: function(target, name, value, receiver) {
        // target is now bound to the shadowWindow
        var returnValue;
        var indexOfProxy = fakeMaker._proxiedObjects.indexOf(obj);
        if (fakeMaker._originalProperties[indexOfProxy].indexOf(name) === -1) {
          // Not on the object when we created the proxy.
          var isExpando = fakeMaker.getExpandoProperty(obj, name);
          if (isExpando) {
            if (expando_debug)
              console.log('set found expando, set ' + name + ' to ' + typeof(value));
            obj[name] = value;
            if (obj === window) {
              fakeMaker._setExpandoGlobals.push(name);
              if (expando_debug)
                console.log('set found window expando ' + name, value)
            }
          } else {
            fakeMaker.registerExpando(obj, name);
          }
          return obj[name];
        }

        if (expando_debug)
          console.log('Not an expando ' + name + ' obj[name] set');

        if (get_set_debug) {
          var descriptor = fakeMaker._getPropertyDescriptor(obj, name);
          console.log('set before ' + name + ' ' + (typeof value) + ' descriptor:', descriptor);
        }

        obj[name] = value;

        if (get_set_debug) {
          var descriptor = fakeMaker._getPropertyDescriptor(obj, name);
          console.log('set after ' + name + ' ' + (typeof value) + ' descriptor:', descriptor);
        }
        return true;
      },

      // target.apply(thisArg, args)
      apply: function(target, thisArg, args) {
        try {
          if (calls_debug) {
            console.log('apply: theThis === window: ' + (theThis === window));
            console.log('apply: thisArg === window: ' + (thisArg === window));
            console.log('apply: obj === window: ' + (obj === window));
          }
          return fakeMaker._wrapCallResult(obj, path + '()', function() {
            // If we now call a DOM function it could operate on the proxy and cause
            // records to be created; In the player there will be no DOM function and
            // these records will not be replayed. So we pass original objects except
            // for callback functions.
            var deproxiedTheThis = fakeMaker.toObject(theThis);
            var deproxiedArgs = fakeMaker.deproxyArgs(args, deproxiedTheThis, path);

            if (calls_debug) {
              console.log("apply with this: "+ fakeMaker.classNameIfPossible(deproxiedTheThis) +", args " + deproxiedArgs.length);
              deproxiedArgs.forEach(function(arg, index) {
                console.log('apply ['+index +']=' + typeof(arg));
              });
            }
            return Reflect.apply(obj, deproxiedTheThis, deproxiedArgs);
          });
        } catch(e) {
          console.log('_proxyFunction.apply FAILS ' + e, e.stack);
          console.log('_proxyFunction.apply ' + path + ' obj:' + obj.constructor.toString() + ' theThis:' + fakeMaker.classNameIfPossible(theThis));
        }
      },

      // new target(args)
      construct: function(target, args) {
        return fakeMaker._wrapCallResult(obj, path + '.new()', function() {
          var deproxiedArgs = fakeMaker.deproxyArgs(args, obj, path);
          if (calls_debug) {
            console.log("construct args " + args.length);
            args.forEach(function(arg, index) {
              console.log('construct args ['+index +'] ' + typeof(arg));
            });
          }
          var returnValue = new obj(deproxiedArgs[0], deproxiedArgs[1], deproxiedArgs[2], deproxiedArgs[3]);
          if (calls_debug) console.log("construct result " + typeof(returnValue));
          return returnValue;
        });
      },

    });
    var indexOfProxy = this._registerProxyObject(obj, theThis, proxy);
    if (fakeMaker._proxiedObjects.indexOf(obj) === -1)
      throw new Error("No proxy for object at "+path);

    if (!(proxy))
      throw new Error('Assert FAILS proxy');

    var originalProperties = [];
    var mark = obj;
    while (mark) {
      originalProperties = originalProperties.concat(Object.getOwnPropertyNames(mark));
      mark = mark.__proto__;
    }

    this._originalProperties[indexOfProxy] = originalProperties;

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
      return obj[name].bind(obj);
    }
  },

  functionProperties : ["length", "name", "arguments", "caller", "prototype"],

  _preparePropertiesForJSON: function(objectReference, obj, accessedProperties) {
    // The entry in the array representing each object in the graph encodes its type.
    var jsonable = objectReference._fake_function_ ? {_fake_function_: true} : {};

    Object.keys(accessedProperties).forEach(function(key) {
      if (accesses_debug) {
        console.log('_preparePropertiesForJSON ' + key +
          ' with ' + accessedProperties[key] + ' accesses');
      }

      jsonable[key] = this._replaceObjectsAndFunctions(obj, key);
    }.bind(this));

    return jsonable;
  },

  // Given an obj and a propertyName we know was accessed, return value so
  // FakePlayer can reconstitute the property.

  _replaceObjectsAndFunctions: function(obj, propertyName) {
    var jsonablePropertyRep = {};
    var descriptor = this._getPropertyDescriptor(obj, propertyName);

    if (descriptor && descriptor.get)
      jsonablePropertyRep._fake_getter_ = true;

    if (descriptor && descriptor.set)
      jsonablePropertyRep._fake_setter_ = true;

    if (descriptor && !descriptor.get && !descriptor.set) {
      var value = descriptor.value;
      if (typeof value !== 'object' && typeof value !== 'function') {
         jsonablePropertyRep = 1; // a value, use getter to recording.
       } else {
        var index = this._objectsReferenced.indexOf(value);
        if (index === -1) {
          if (this.isAProxy(descriptor.value)) {
            if (recording_debug)
             console.log('_replaceObjectsAndFunctions descriptor.value isAProxy ' + propertyName);

            var indexOfProxy = this._proxiesOfObjects.indexOf(descriptor.value);
            var objProxied = this._proxiedObjects[indexOfProxy];
            index = this._objectsReferenced.indexOf(objProxied);

            if (recording_debug) {
              console.log('_replaceObjectsAndFunctions '+ propertyName
                  +' found proxy, returning ref ', this._objectReferences[index]);
            }
          } else {
            throw new Error('_replaceObjectsAndFunctions did not find object in _objectsReferenced ' + propertyName);
          }
        }
        jsonablePropertyRep = this._objectReferences[index];
      }
    }
    if (recording_debug)
      console.log('_replaceObjectsAndFunctions ' + propertyName, jsonablePropertyRep);
    return jsonablePropertyRep;
  },

};

window.FakeMaker = FakeMaker;

}());