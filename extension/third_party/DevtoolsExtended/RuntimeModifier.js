// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2013 Google Inc. johnjbarton@google.com

// Maintain a modified runtime via preprocessor and injected scripts.
//
// Setup: provide JS source for preprocessing and initial runtime.
// Activate: reload with new runtime features. Fire onActivationChanged.
//   maintain the activation state across reloads.
// Deactive: reload w/o runtime scripts. Fire onActivationChanged.

(function(global){
  'use strict';

  var debug = DebugLogger.register('RuntimeModifier', function(flag){
    return debug = (typeof flag === 'boolean') ? flag : debug;
  });

  var activeRuntimeModfier;

  function RuntimeModifier(injectedScript, preprocessingScript) {
    this._injectedScript = injectedScript;
    this._preprocessingScript = preprocessingScript;
    DevtoolsExtended.mixinPropertyEvent(this, 'onActivationChanged');
    this._onRuntimeChanged = this._onRuntimeChanged.bind(this);
  }

  RuntimeModifier.prototype = {
    get active() {
      return this._active;
    },

    activate: function() {
      if (!this._active)
        this._activate();
    },

    deactivate: function() {
      if (this._active)
        this._deactivate();
    },

    set injectedScript(scriptString) {
      console.assert(typeof scriptString === 'string');
      this._injectedScript = scriptString;
    },

    set preprocessingScript(scriptString) {
      console.assert(typeof scriptString === 'string');
      this._preprocessingScript = scriptString;
    },

    _activate: function() {
      if (!this._injectedScript && !this._preprocessingScript)
        throw new Error("No runtime injectedScript or preprocessingScript defined.");

      if (activeRuntimeModfier) {
        activeRuntimeModfier._forceDeactivated();
      }

      DevtoolsExtended.InspectedWindow.injectedScript = this._injectedScript;
      DevtoolsExtended.InspectedWindow.preprocessingScript = this._preprocessingScript;

      this._activating = true;
      DevtoolsExtended.InspectedWindow.onRuntimeChanged.addListener(this._onRuntimeChanged);

      DevtoolsExtended.InspectedWindow.reload();
    },

    _deactivate: function() {
      DevtoolsExtended.InspectedWindow.injectedScript = "";
      DevtoolsExtended.InspectedWindow.preprocessingScript = "";
      DevtoolsExtended.InspectedWindow.reload();
    },

    _forceDeactivated: function() {
      this._active = false;
      this.onActivationChanged.fireListeners(this._active);
    },

    _onRuntimeChanged: function(injectedScript, preprocessingScript) {
      var active = this._active;
      if (this._activating) {
        delete this._activating;
        activeRuntimeModfier = this;
        this._active = true;
      } else {
        if (injectedScript !== this._injectedScript || preprocessingScript !== this._preprocessingScript) {
          this._active = false;
          DevtoolsExtended.InspectedWindow.onRuntimeChanged.removeListener(this._onRuntimeChanged);      
        }  // else we are still in charge
      }
      if (this._active !== active)
        this.onActivationChanged.fireListeners(this._active);
    }
  };

  global.DevtoolsExtended = global.DevtoolsExtended || {};
  DevtoolsExtended.RuntimeModifier = RuntimeModifier;

}(this));
