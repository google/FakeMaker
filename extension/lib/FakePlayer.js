/* Copyright 2013 Google. All rights reserved.
 *
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file or at
 * https://developers.google.com/open-source/licenses/bsd
*/

(function(global){

var debug_player = true;

function FakePlayer(json) {
  var fromJSON;
  if (typeof json === 'string')
    fromJSON = JSON.parse(json);
  else
    fromJSON = json;
  console.log('FakePlayer recording object ', fromJSON);
  // Start with the objects containing refs to functions and objects.
  this._recordedProxiesOfObjects = fromJSON.objects;
  this._setExpandoGlobals = fromJSON.expandoProperties;
  this._rebuildObjectGraph(this._recordedProxiesOfObjects);
  this._recording = fromJSON.recording;
  this._currentReplay = 0;
  this.callbacks = []; // this array is filled by JS calls like it is during recording.
}

FakePlayer.prototype = {
  initialize: function() {
    // Add the properties created on window by the app so they appear as globals,
    // but delay their access to the recording until the app calls for them.

    // Add built-ins to windowProxy forwarding to global.
    FakeCommon.chromeBuiltins.forEach(function(name) {
      windowProxy[name] = global[name];
    });
  },

  startingObject: function () {
    this._currentReplay = 0;
    return this.replay('');
  },

  endOfRecording: function() {
    return this._currentReplay === this._recording.length;
  },

  getRootExpandoNames: function() {
    return this._setExpandoGlobals;
  },

  replayCallback: function(reply) {
    var callbackIndex = reply._callback_;
    var callbackThisIndex = reply._callback_this;
    if (typeof callbackThisIndex === 'number')
      var theThis = this._rebuiltObjects[callbackThisIndex];
    // TODO: where is the event?
    return this.callbacks[callbackIndex].call(theThis);
  },

  createFunctionObject: function(refToFunctionObject, key, path) {
    var fakePlayer = this;
    if (typeof refToFunctionObject._callback_ === 'number')
      return this.replayCallback(propertyRep);

    var fnc = function () {
      fakePlayer.checkForCallback(key, arguments);
      return fakePlayer.replay();  // as a function, we replay
    }

    var fncProperties = this._recordedProxiesOfObjects[refToFunctionObject._fake_object_ref];
    if (fncProperties.name) {
      fnc = eval('(' +
        fnc.toString().replace('function', 'function ' + fncProperties.name) +
        ')')
    }
    Object.getOwnPropertyNames(fncProperties).forEach(function(prop) {
      if (prop === 'name') {
        // V8 has a bug which prevents us from reconfiguring the name.
        return;
      }
      if (prop === 'prototype') {
        // We can't reconfigure .prototype but we can over-write it.

        fnc.prototype = fakePlayer._rebuiltObjects[fncProperties.prototype._fake_object_ref];
        if (prop === 'HTMLElement') {
          // Save the HTMLElement.prototype for use in createCustomElement
          fakePlayer.HTMLElement_prototype = fnc.prototype;
        }
      } else {
        des = Object.getOwnPropertyDescriptor(fncProperties, prop);
        Object.defineProperty(fnc, prop, des);
      }
    });
    // update the rebuilt object into a function with properties.
    return this._rebuiltObjects[refToFunctionObject._fake_object_ref] = fnc;
  },

  replay: function(key) {
    var index = this._currentReplay;
    if (index >= this._recording.length)
      throw new Error('FakePlayer ran off the end of the recording');

    var reply = this._recording[this._currentReplay++];
    var path = this._recording[this._currentReplay++];

    var event = this.checkForEvent(reply, path);
    if (event)
      return event;

    if (debug_player)
      console.log('no event, check sync at ' + path);
    // Check for sync after event dispatch: if we had an sync event,
    // the sync for it would already have been checked in its replay call.
    this.checkSync(path);

    console.log('In sync at ' + path)

    if (reply && typeof reply === 'object' && !reply._fake_function_) {
      var obj = this._rebuiltObjects[reply._fake_object_ref];
      if (debug_player) {
        console.log(index + ': replay (' + path + ') returns object ' +
            reply._fake_object_ref, obj);;
      }
      return obj;
    } else if (reply && typeof reply === 'object' && reply._fake_function_) {
      var fnc = this._rebuiltObjects[reply._fake_object_ref];
      if (typeof fnc !== 'function') {
        // During recording we found a function-valued property. The function
        // may itself have properties. Overwrite the slot with a
        // function-with-properties object and return the result.
        // We only do this one time: if during recording the function-valued
        // property was over-written then it would be set operation and JS in
        // playback would also write the result.
        fnc = this.createFunctionObject(reply, key, path);
      }
      if (debug_player) {
        console.log(index + ': replay (' + path + ') returns ' + typeof fnc +
            ' ' + reply._fake_object_ref);
      }
      return fnc;
    } else {
      if (debug_player) {
        console.log(index + ': replay(' + key + ') (' + path + ') returns ' +
          typeof(reply), reply);
      }
      return reply;
    }
  },

  checkSync: function(path) {
    var traceIndex = parseInt(path.split(' ').pop(), 10);
    if (traceIndex < 0)
      return; // just testing or first object ('window')
    if (__F_.calls.length - 1 !== traceIndex) {
      var splits = path.split(' ');
      var encodedOffset = splits[splits.length - 2]
      var offset;
      var direction;
      switch (encodedOffset.indexOf('0x')) {
        case -1:
          var decimal = parseInt(encodedOffset, 10);
          if (decimal < 0) {
            direction = 'exit';
            offset = -decimal;
          } else {
            direction = 'enter';
            offset = decimal;
          }
          break;
        case 0:
          direction = 'src';
          offset = parseInt(encodedOffset, 16);
        case 1:
          direction = 'call';
          offset = -parseInt(encodedOffset, 16);
          break;
        default:
          break;
      }
      throw new Error('Out of sync, FakeMaker at ' + path + ' vs FakePlayer: ' + (__F_.calls.length - 1) + ' at ' + offset + '  ' + direction);
    }
  },

  checkForEvent: function(reply, path) {
    // The JS code may be eg Element.dispatchEvent(event),
    // so the synchronous callback may need to run before returning
    // the value of Element.dispatchEvent() from the record.
    var maybeEvent = reply;

    if (maybeEvent && typeof maybeEvent._callback_ === 'number') {
      var isAsync = !maybeEvent._callback_depth;
      if (debug_player)
        console.log('checkForEvent callback #' + maybeEvent._callback_ + ' is Async ' + isAsync + ' at ' + path);
      var fakePlayer = this;
      if (!isAsync) {
        var callback = fakePlayer.callbacks[maybeEvent._callback_];
        var theThis = fakePlayer._rebuiltObjects[maybeEvent._callback_this];
        if (debug_player)
          console.log('Calling at stack depth ' + (__F_.calls.length - 1) + ' with this ref ' + maybeEvent._callback_this, callback);
        callback.call(theThis);
        if (debug_player)
          console.log('Replay at stack depth ' + (__F_.calls.length - 1), callback);
        var eventResult = fakePlayer.replay(path);
        return eventResult;
      }
    } else {
      if (this._currentReplay >= this._recording.length)
        return;
      // For async events, the JS does not drive the replay, so we need force the callback on the next turn.
      maybeEvent = this._recording[this._currentReplay];
      path =  this._recording[this._currentReplay + 1];
      if (debug_player)
        console.log("check for async event " + path);
      if (maybeEvent && typeof maybeEvent._callback_ === 'number' && !maybeEvent._callback_depth) {
        var asyncEvent = maybeEvent;
        var fakePlayer = this;
        // We've found an async event. Move it from the replay queue to a setTimeout queue.
        if (debug_player)
          console.log('moving async event to setTimeout ' + path)
        this._currentReplay += 2;
        setTimeout(function() {
          if (debug_player)
            console.log('checkForEvent setTimeoutFired, callback #' + asyncEvent._callback_, asyncEvent, fakePlayer._recording[fakePlayer._currentReplay]);
          var callback = fakePlayer.callbacks[asyncEvent._callback_];
          var theThis = fakePlayer._rebuiltObjects[asyncEvent._callback_this];
          callback.call(theThis);
        });
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
      mark = Object.getPrototypeOf(mark);
    }
  },

  copyOwnProperties: function(from, to) {
      Object.getOwnPropertyNames(from).forEach(function(name) {
        var descriptor = Object.getOwnPropertyDescriptor(from, name);
        Object.defineProperty(to, name, descriptor);
      });
  },

  createFakeCustomElement: function(element, prototype) {
    var fakePlayer = this;
    // element has recording info, prototype has app-defined JS functions.
    // Our fake custom element needs the recording info.
    // As we walk the proto chain we should hit HTMLElement.prototype.
    var found = fakePlayer._someProtos(prototype, function(proto) {
      // Write the app-defined JS functions onto the recording object proto.
      fakePlayer.copyOwnProperties(proto, element.__proto__);
      return (proto === fakePlayer.HTMLElement_prototype);
    }, 'CustomElement');
    console.assert(found);
    element.__fakeCustomElement = true;
    return element;
  },

  getOrCreateFakeCustomElement: function(element, prototype) {
    if (element.__fakeCustomElement)
      return element;

    return this.createFakeCustomElement(element, prototype);
  },

  createLifeCycleWrapper: function(prototype, name) {
    var fakePlayer = this;
    return function lifeCycleWrapper()  {
      if (debug_player)
        console.log('lifeCycleWrapper prototype ' + Object.getOwnPropertyNames(prototype));
      var fakeCustomElement = fakePlayer.getOrCreateFakeCustomElement(this, prototype);
      // complete the callback using the newly faked CustomElement.
      prototype[name].apply(fakeCustomElement, []);
    }
  },

  checkForCallback: function(name, args) {
    var fakePlayer = this;
    if (name === 'registerElement') {
      if (debug_player)
        console.log('checkForCallback found ' + name);
      var options = args[1];  // a ref to an object created by JS
      if (options && options.prototype) { // then JS code provided some functions for registerElement.
        var createdCallback;
        FakeCommon.lifeCycleOperations.forEach(function(name) {
          if (name in options.prototype) {
            var lifeCycleWrapper = fakePlayer.createLifeCycleWrapper(options.prototype, name);
            // TODO This won't work unless the order of callbacks magically matches player.
            fakePlayer.callbacks.push(lifeCycleWrapper);
          }
        });
      }
    } else {
      for(var i = 0; i < args.length; i++) {
        if (typeof args[i] === 'function') {
          if (debug_player)
            console.log('checkForCallback found function at ' + i)
          this.callbacks.push(args[i]);
        }
      }
    }
  },

  _rebuildObjectGraph: function(objReps) {
    this._rebuiltObjects = objReps.map(function(objRep) {
      return this._buildShells(objRep);
    }.bind(this));
    // During _nameShells we re-write function objects to close over 'name'
    // needed for lifeCycleCallbacks.
    objReps.forEach(function (objRep, index) {
      this._nameShells(objRep, this._rebuiltObjects[index]);
    }.bind(this));
    objReps.forEach(function (objRep, index) {
      this._fillShells(objRep, this._rebuiltObjects[index], index);
    }.bind(this));
    if (debug_player)
      console.log('_rebuildObjectGraph _rebuiltObjects ', this._rebuiltObjects);
  },

  _buildShells: function(objRep) {
    var fakePlayer = this;
    var shell;
    if (objRep._fake_function_) {
      shell = function() {
        fakePlayer.checkForCallback('(root)', arguments);
        return fakePlayer.replay('(root)');
      }
    } else {
      shell = {};
    }
    return shell;
  },

  _nameShells: function(objRep, shell) {
    var fakePlayer = this;
    Object.getOwnPropertyNames(objRep).forEach(function (name) {
      var propertyRep = objRep[name];
      if (typeof propertyRep === 'object' && propertyRep._fake_function_) {
        // Write over the unnamed entry with a named version.
        var fnc = fakePlayer.createFunctionObject(propertyRep, name, '');
        fakePlayer._rebuiltObjects[propertyRep._fake_object_ref] = fnc;
      }
    });
  },

  _fillShells: function(objRep, shell, index) {
    var fakePlayer = this;
    Object.getOwnPropertyNames(objRep).forEach(function (name) {
      var propertyRep = objRep[name];
      if (typeof propertyRep === 'object') {
        if (propertyRep._do_not_proxy_function_) {
          shell[name] = eval(propertyRep._do_not_proxy_function_);
        }
        if (name === '_fake_proto_') {
          console.log('_fillShells _fake_proto_ setPrototypeOf ' + index + ' to ' + propertyRep._fake_object_ref )
          if (!propertyRep._fake_undefined)
            Object.setPrototypeOf(shell, fakePlayer._rebuiltObjects[propertyRep._fake_object_ref]);
        }
        if (propertyRep._fake_function_) {
          // Set the pointer.
          shell[name] = fakePlayer._rebuiltObjects[propertyRep._fake_object_ref];
        } else if (propertyRep._fake_object_ref) {
          shell[name] = fakePlayer._rebuiltObjects[propertyRep._fake_object_ref];
        }
      } else {
        console.log('_fillShells ' + index + ' ' + name);
        // values
        Object.defineProperty(shell, name, {
          get: function() {
            return fakePlayer.replay(name)
          },
          configurable: true
        });
      }
    });
  },

};

global.FakePlayer = FakePlayer;

}(this));
