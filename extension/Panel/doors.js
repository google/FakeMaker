// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2014 Google Inc. johnjbarton@google.com

var doors = document.querySelector('.doors');

var initialContent = "function p() {\n}\n";

var editor = CodeMirror(doors, {
  value: initialContent,
  mode: "javascript",
  lineNumbers: true,
});

// API

function updateTrace(trace) {
    editor.setValue(trace);
}
