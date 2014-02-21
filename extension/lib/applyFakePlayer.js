// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2014 Google Inc. johnjbarton@google.com

function applyFakePlayer() {
  var fakePlayer = new FakePlayer(window.__fakeMakerRecord);
  window.windowProxy = fakePlayer.startingObject();
  fakePlayer.initialize();
}