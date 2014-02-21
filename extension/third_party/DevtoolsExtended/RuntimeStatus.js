// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2013 Google Inc. johnjbarton@google.com

// Sources sidebar pane with a button to report/control runtime status.

(function(global){
  'use strict';

  var debug = DebugLogger.register('RuntimeStatus', function(flag){
    return debug = (typeof flag === 'boolean') ? flag : debug;
  });

  function RuntimeStatus(featureName, injectedScript, preprocessingScript) {
    this._featureName = featureName;
    this._runtimeModifier = new DevtoolsExtended.RuntimeModifier(injectedScript, preprocessingScript);
    DevtoolsExtended.mixinPropertyEvent(this, 'onActivationWillChange');
    this._createUI(featureName);
  }

  RuntimeStatus.prototype = {

    // For derived class overrides
    get pageURL() {
      return "DevtoolsExtended/RuntimeStatusPage.html";
    },

    get pageHeight() {
      return "26px";
    },

    get runtimeModifier() {
      return this._runtimeModifier;
    },

    get featureName() {
      return this._featureName;
    },

    // Called when the UI requests activation.
    obeyActivationRequest: function(shouldBeActive) {
      if (this._runtimeModifier.active !== shouldBeActive) {
        this.onActivationWillChange.fireListeners(shouldBeActive);
      }
      if (shouldBeActive)
        this._activate();
      else
        this._deactivate();
    },

    _createUI: function(featureName) {
      chrome.devtools.panels.sources.createSidebarPane(featureName,
        this._onSidebarPaneCreated.bind(this)
      );
    },

    _onSidebarPaneCreated: function(extensionPane) {
      extensionPane.setPage(this.pageURL);
      extensionPane.setHeight(this.pageHeight);
      extensionPane.onShown.addListener(this._onExtensionPaneShown.bind(this));
    },

    _onExtensionPaneShown: function(win) {
      window.addEventListener('message', this._receiveActivationRequest.bind(this, win));
      var runtimeStatus = this;
      this._sendActivationStatus = function(runtimeActive) {
        var messageObject = {runtimeActive: !!runtimeActive};
        win.postMessage(JSON.stringify(messageObject), '*');
      };
      this._runtimeModifier.onActivationChanged.addListener(this._sendActivationStatus);

      this._sendActivationStatus(false);
    },

    _receiveActivationRequest: function(win, event) {
      if (win !== event.source)
        return;
      var json = event.data;
      var messageObject = JSON.parse(json);
      if ('activateRuntime' in messageObject) {
        var shouldBeActive = messageObject.activateRuntime;
        this.obeyActivationRequest(shouldBeActive);
      }
    },

    _activate: function() {
      this._runtimeModifier.activate();
    },

    _deactivate: function() {
      this._runtimeModifier.deactivate();
    },
  };

  global.DevtoolsExtended = global.DevtoolsExtended || {};
  DevtoolsExtended.RuntimeStatus = RuntimeStatus;

}(this));
