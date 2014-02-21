// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2013 Google Inc. johnjbarton@google.com

function applyFakeMaker() {
  var fakeMaker = new FakeMaker();
  window.windowProxy = fakeMaker.makeFakeWindow();
  window.__fakeMaker = fakeMaker;
}