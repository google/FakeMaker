// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2014 Google Inc. johnjbarton@google.com

function testGenerateLineTables(source) {
  var table = generateLineTables(source);
  console.log('testGenerateLineTables', table);
  if (table[0]  !== 0)
    throw new Error('First entry should be zero');
  if (table[3] !== source.length)
    throw new Error('Last entry should be length');
}

var source = 'Line 1\nLine2\nLine3\n';
testGenerateLineTables(source);

function testLineNumbers(source) {
  var lineTable = generateLineTables(source);
  for(var offset = 0; offset <= source.length + 2; offset++) {
    var result = linesNumbersContainingOffsetRange(1, lineTable, offset - 1, offset+1);
    console.log('offset ' + offset + ': ' + result);
  }
}

testLineNumbers(source);

window.addEventListener('load', function() {
  var scripts = document.querySelectorAll('script[type="text/transcode"]');
  for(var i = 0; i < scripts.length; i++) {
    var src = scripts[i].textContent;
    var transcoded = transcode(src, 'foo.js');
    eval(transcoded);
    console.log('__F_', __F_);
    var encodedTrace = __F_;
    var result = decodeTraceToLineNumbers(encodedTrace.calls, encodedTrace.urls, [src]);
    console.log('and the result is \n' + result);
    var resultLines = result.split('\n');
    if (resultLines[0] !== '0: foo.js' || resultLines[1] !== '0: 1, 5' || resultLines[2] !== '0: 2, 3')
      throw new Error('decodeTraceToLineNumbers fails');
  }
});