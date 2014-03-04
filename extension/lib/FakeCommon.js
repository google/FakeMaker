/* Copyright 2014 Google. All rights reserved.
 *
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file or at
 * https://developers.google.com/open-source/licenses/bsd
*/

var FakeCommon = {
  // The list of chrome built-ins created by using this script in node.js:
  //    console.log(Object.getOwnPropertyNames(global));
  // and finding the common values with a similar script running in a Worker.

  chromeBuiltins: ['Error', 'Date', 'parseInt', 'Math', 'Int8Array', 'Int16Array', 'Array', 'encodeURI',
  'EvalError', 'Object', 'Int32Array', 'SyntaxError', 'decodeURI', 'DataView', 'unescape',
  'decodeURIComponent', 'Infinity', 'isNaN', 'escape', 'isFinite', 'ArrayBuffer', 'Uint32Array',
  'undefined', 'parseFloat', 'TypeError', 'RangeError', 'Uint8Array', 'Number', 'URIError', 'Float32Array',
  'Uint8ClampedArray', 'JSON', 'RegExp', 'Function', 'Float64Array', 'NaN', 'encodeURIComponent',
  'Uint16Array', 'ReferenceError', 'String', 'eval', 'Boolean', 'console', 'Map'],

  // window functions that we don't want to record.
  nonDOM: ['addEventListener', 'setTimeout'],

  //  Wrap the callback functions passed into the DOM functions but de-proxy other args.
  lifeCycleOperations: ['createdCallback', 'enteredViewCallback', 'leftViewCallback', 'attributeChangedCallback'],
};

