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
            console.warn('fakePlayer ignores set call for ' + name);
          }
        });
        console.log('FakePlayer.initialize: add forwarding getter for ' + name);
      }
    });
    // Add built-ins to windowProxy forwarding to window.
    FakeCommon.chromeBuiltins.forEach(function(name) {
      window.windowProxy[name] = window[name];
    });
    if (debug_player)
      console.log('nonDOM ' + FakeCommon.nonDOM.join(','))
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
    // oops where is the event?
    return this.callbacks[callbackIndex]();
  },

  replayFunction: function(reply) {
    var fakePlayer = this;
    if (typeof reply._callback_ === 'number')
      return this.replayCallback(reply);

    var fnc = function () {
      fakePlayer.checkForCallback(arguments);
      return fakePlayer.replay();  // as a function, we replay
    }

    var obj = this._rebuiltObjects[reply._fake_object_ref];
    Object.getOwnPropertyNames(obj).forEach(function(prop) {
      if (fnc.hasOwnProperty(prop)) {
        console.error('Overlap with function property ' + prop);
      } else {
        des = Object.getOwnPropertyDescriptor(obj, prop);
        Object.defineProperty(fnc, prop, des);
      }
    });
    return fnc;
  },

  replay: function(key) {
    var index = this._currentReplay;
    var reply = this._recording[this._currentReplay++];
    var path = this._recording[this._currentReplay++];
    this.checkForEvent();
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

  checkForEvent: function() {
    var maybeEvent = this._recording[this._currentReplay];

    if (maybeEvent && typeof maybeEvent._callback_ === 'number') {
      // We know the next recorded operation is a callback, but we don't know
      // if some function currently on the stack will trigger the callback or not.
      // So we wait until the end of the turn and recheck it.
      console.log('checkForEvent callback #' + maybeEvent._callback_);
      var fakePlayer = this;
      setTimeout(function() {
        if (maybeEvent === fakePlayer._recording[fakePlayer._currentReplay]) {
          var callback = fakePlayer.callbacks[maybeEvent._callback_];
          callback.call();
        }
      });
    }
  },

  checkForCallback: function(args) {
    for(var i = 0; i < args.length; i++) {
      if (typeof args[i] === 'function')
        this.callbacks.push(args[i]);
    }
  },

  _rebuildObjectGraph: function(objReps) {
    this._rebuiltObjects = objReps.map(function(objRep) {
      return this._buildShells(objRep);
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
        fakePlayer.checkForCallback(arguments);
        return fakePlayer.replay('(root)');
      }
    } else {
      shell = {};
    }
    return shell;
  },

  _fillShells: function(objRep, shell) {
    var fakePlayer = this;
    Object.getOwnPropertyNames(objRep).forEach(function (name) {
      var valueRep = objRep[name];
      if (valueRep._do_not_proxy_function_) {
        shell[name] = eval(valueRep._do_not_proxy_function_);
        return;
      }
      if (valueRep._fake_object_ref) {
        shell[name] = fakePlayer._rebuiltObjects[valueRep._fake_object_ref];
        return;
      }
      Object.defineProperty(shell, name, {
        get: function() {
          fakePlayer.checkForCallback(arguments);
          return fakePlayer.replay(name)
        }
      });
    });
  },

};

global.FakePlayer = FakePlayer;

}(this));
