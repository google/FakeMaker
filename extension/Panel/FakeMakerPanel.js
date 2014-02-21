// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2013 Google Inc. johnjbarton@google.com

(function(){
  function FakeMakerPanelSidebar() {
    this.selectIds();
    this.connect();
  }

  FakeMakerPanelSidebar.prototype = {
    selectIds: function() {
      this._sidebar = document.querySelector('#FakeMakerPanelSidebar');
      this._playButton = this._sidebar.querySelector('#play');
      this._exportButton = this._sidebar.querySelector('#export');
    },
    connect: function() {

    }
  };

  function onLoad() {
    new FakeMakerPanelSidebar();
  }

  window.addEventListener('load', onLoad);
})();
