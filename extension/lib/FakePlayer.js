/* Copyright 2013 Google. All rights reserved.
 *
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file or at
 * https://developers.google.com/open-source/licenses/bsd
*/

(function(global){

var debug_player = false;

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
    this.getRootExpandoNames().forEach(function(name) {
      if (debug_player) {
        console.log('applyFakePlayer checking ' + name +
          ' in window: ' + (name in windowProxy))
      }
      if (!(name in window)) {
        Object.defineProperty(window, name, {
            configurable: true,
          get: function() {
            return window.windowProxy[name];
          },
          set: function(value) {
            if (debug_player)
              console.warn('fakePlayer ignores set call for ' + name);
          }
        });
        if (debug_player)
          console.log('FakePlayer.initialize: add forwarding getter for ' + name);
      }
    });

    // Add built-ins to windowProxy forwarding to window.
    FakeCommon.chromeBuiltins.forEach(function(name) {
      window.windowProxy[name] = window[name];
    });
  },

  startingObject: function () {
    this._currentReplay = 0;
    return this._rebuiltObjects[0];
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

  replayFunction: function(reply) {
    var fakePlayer = this;
    if (typeof reply._callback_ === 'number')
      return this.replayCallback(reply);

    var fnc = function () {
      fakePlayer.checkForCallback(name, arguments);
      return fakePlayer.replay();  // as a function, we replay
    }

    var obj = this._rebuiltObjects[reply._fake_object_ref];
    Object.getOwnPropertyNames(obj).forEach(function(prop) {
      if (!fnc.hasOwnProperty(prop)) {  // TODO check for these when ?
        des = Object.getOwnPropertyDescriptor(obj, prop);
        Object.defineProperty(fnc, prop, des);
      }
    });
    return fnc;
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
    // Check for sync after event dispatch: if we had an sync event,
    // the sync for it would already have been checked in its replay call.
    this.checkSync(path);
    if (reply && typeof reply === 'object' && !reply._fake_function_) {
      var obj = this._rebuiltObjects[reply._fake_object_ref];
      if (debug_player) {
        console.log(index + ': replay (' + path + ') returns object ' +
            reply._fake_object_ref, obj);;
      }
      return obj;
    } else if (reply && typeof reply === 'object' && reply._fake_function_) {
      var fnc = this.replayFunction(reply);
      if (debug_player) {
        console.log(index + ': replay (' + path + ') returns function ' +
              reply._fake_object_ref);
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
    if (__F_.calls.length - 1 !== traceIndex)
      throw new Error('FakePlayer out of sync with FakeMaker at ' + path + ' vs ' + (__F_.calls.length - 1));
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

  checkForCallback: function(name, args) {
    if (name === 'registerElement') {
      if (debug_player)
        console.log('checkForCallback found ' + name);
      var options = args[1];
      if (options && options.prototype) {
        FakeCommon.lifeCycleOperations.forEach(function(key) {
          if (options.prototype[key]) {
            function lifeCycleWrapper() {
              // The 'this' incoming has getters for DOM operations
              var extendedThis = Object.create(this)
              Object.getOwnPropertyNames(options.prototype).forEach(function(name) {
                extendedThis[name] = options.prototype[name];
              });

              options.prototype[key].apply(extendedThis, arguments);
            }
            this.callbacks.push(lifeCycleWrapper);
            if (debug_player)
              console.log('checkForCallback found ' + key + ' under ' + name + ' and stored it a ' + (this.callbacks.length -1), options.prototype[key]);
          }
        }.bind(this));
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
      this._fillShells(objRep, this._rebuiltObjects[index]);
    }.bind(this));
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
      if (propertyRep._fake_function_) {
        // Write over the unnamed entry with a named version.
        fakePlayer._rebuiltObjects[propertyRep._fake_object_ref] = function() {
          fakePlayer.checkForCallback(name, arguments);
          return fakePlayer.replay(name);
        }
      }
    });
  },

  _fillShells: function(objRep, shell) {
    var fakePlayer = this;
    Object.getOwnPropertyNames(objRep).forEach(function (name) {
      var propertyRep = objRep[name];
      if (propertyRep._do_not_proxy_function_) {
        shell[name] = eval(propertyRep._do_not_proxy_function_);
        return;
      }
      if (name === '_fake_proto_') {
        Object.setPrototypeOf(shell, fakePlayer._rebuiltObjects[propertyRep._fake_object_ref]);
        return;
      }
      if (propertyRep._fake_function_) {
        // Set the pointer.
        shell[name] = fakePlayer._rebuiltObjects[propertyRep._fake_object_ref];
        return;
      } else if (propertyRep._fake_object_ref) {
        shell[name] = fakePlayer._rebuiltObjects[propertyRep._fake_object_ref];
        return;
      } else {
        // values
        Object.defineProperty(shell, name, {
          get: function() {
            fakePlayer.checkForCallback(name, arguments);
            return fakePlayer.replay(name)
          }
        });
      }
    });
  },

};

global.FakePlayer = FakePlayer;

}(this));
