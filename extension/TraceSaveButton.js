// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2014 Google Inc. johnjbarton@google.com


var TRACE_SAVED = 'trace-saved';
var TRACE_ACTIVE = 'trace-active';
var TRACE_SAVE_SELECTOR = 'div.save-trace-button';

// From FakeMakerDevtoolsPage

window.addEventListener('message', function(event) {
  var json = event.data;
  var messageObject = JSON.parse(json);
  if ('traceSaved' in messageObject) {
    var savedButton = document.querySelector(TRACE_SAVE_SELECTOR);
    savedButton.classList[(!!messageObject.traceSaved ?'add':'remove')](TRACE_SAVED);
    savedButton.messageTarget = event.source;
    savedButton.featureName = messageObject.featureName;
  }
  if ('runtimeActive' in messageObject) {
    var savedButton = document.querySelector(TRACE_SAVE_SELECTOR);
    savedButton.classList[(!!messageObject.runtimeActive ?'add':'remove')](TRACE_ACTIVE);
  }
});

// To FakeMakerDevtoolsPage

document.querySelector(TRACE_SAVE_SELECTOR).addEventListener('click', function(event) {
  var savedButton = document.querySelector(TRACE_SAVE_SELECTOR);
  if (savedButton.messageTarget) {
    var saved = savedButton.classList.contains(TRACE_SAVED);
    var messageObject = {
      saveTrace: !saved,
      featureName: savedButton.featureName
    };
    savedButton.messageTarget.postMessage(JSON.stringify(messageObject), '*');
  }
});
