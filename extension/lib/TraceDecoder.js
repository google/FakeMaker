// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2014 Google Inc. johnjbarton@google.com

function lineTextContainingOffset(source, offset) {
  var eol = source.indexOf('\n', offset);
  var bol = source.lastIndexOf('\n', offset);
  return source.slice(bol + 1, eol);
}

function linesContainingOffsetRange(source, enter, exit) {
  var eol = source.indexOf('\n', exit);
  var bol = source.lastIndexOf('\n', enter);
  return source.slice(bol + 1, eol);
}

function decodeTrace(calls, sources) {
  console.log('decodeTrace')
  var currentSource;
  var depth = ['>'];
  var trace = [];
  var enterOffset = -1;
  var numberOfCalls = calls.length;
  calls.forEach(function(entry, index) {
    if (index && !(index%1000))
      console.log('decoding ' + index + '/' + numberOfCalls);
    if (typeof entry === 'string') {
      var hex = parseInt(entry, 16);
      if (hex >= 0) {
        currentSource = sources[hex];
      } else {               // call
        var callOffset = -hex - 1;
        trace.push(depth.join('>'));
        if (enterOffset >= 0)
          trace.push(linesContainingOffsetRange(currentSource, enterOffset, callOffset) + ' ' + index);
        enterOffset = callOffset;
      }
    } else if (entry > 0) {  // enter
      depth.push('');
      enterOffset = entry;
    } else {                 // exit
      var exitOffset = -entry;
      if (enterOffset >= 0)
        trace.push(linesContainingOffsetRange(currentSource, enterOffset, exitOffset));
      enterOffset = -1;
      depth.pop();
    }
  });
  return trace.join('\n');
}

function generateLineTables(source) {
  var lines = source.split('\n');
  var offset = 0;
  var table = lines.reduce(function(offsetOfLine, line, index) {
    offsetOfLine[index] = offset;
    offset += line.length + 1;
    return offsetOfLine;
  }, []);
  return table;
}

function linesNumbersContainingOffsetRange(urlIndex, lineTable, enterOffset, callOffset) {
  return urlIndex + ': ' + enterOffset + ', ' + callOffset;
  function delta(offset, elt) {
    return offset - elt;
  }
  var enterLine = lineTable.indexOf(search(enterOffset, lineTable, delta)) + 1;
  var callLine = lineTable.indexOf(search(callOffset, lineTable, delta)) + 1;
  return urlIndex + ': ' + enterLine + ', ' + callLine;
}

function decodeTraceToLineNumbers(calls, urls, sources) {
  var numberOfCalls = calls.length;
  console.log('decodeTrace ' + numberOfCalls + ' calls');
  var currentSourceIndex;
  var lineTables = sources.map(generateLineTables);
  var trace = urls.map(function(url, index) {
    return index + ': ' + url;
  });
  var stack = [0]; // The outer functions have not enter calls.

  calls.forEach(function(entry, index) {
    if (index && !(index%1000))
      console.log('decoding ' + index + '/' + numberOfCalls);
    if (typeof entry === 'string') {
      var hex = parseInt(entry, 16);
      if (hex >= 0) {
        currentSourceIndex = hex;
      } else {               // call
        var callOffset = -hex - 1;
        var enterOffset = stack[stack.length - 1];
        if (lineTables[currentSourceIndex])
          trace.push(linesNumbersContainingOffsetRange(currentSourceIndex, lineTables[currentSourceIndex], enterOffset, callOffset) + ' > ' + index);
      }
    } else if (entry > 0) {  // enter
      stack.push(entry);
    } else {                 // exit
      var exitOffset = -entry;
      var enterOffset = stack.pop();
      if (enterOffset >= 0 && lineTables[currentSourceIndex])
        trace.push(linesNumbersContainingOffsetRange(currentSourceIndex, lineTables[currentSourceIndex], enterOffset, exitOffset) + ' <');
    }
  });
  return trace.join('\n');
}

function loadSources(calls, urls, callback) {
  var resources = DevtoolsExtended.InspectedWindow.resources;
  var resourceByURL = Object.create(null);
  resources.forEach(function(resource) {
    resourceByURL[resource.url] = resource;
  });
  console.log('urls', urls);
  var remaining = urls.length;
  var sources = [];
  urls.forEach(function(url, index) {
    var resource = resourceByURL[url];
    if (resource) {
      resource.getContent(function(content) {
        sources[index] = content;
        if (!--remaining)
          callback(calls, sources);
      });
    } else {
      if (!--remaining)
        callback(calls, sources);
    }
  });
}

if (window.DevtoolsExtended)
  DevtoolsExtended.InspectedWindow.monitorResources();
// Else testing

function getEncodedTrace(callback, errback) {
  function onEval(result, isException) {
    if (isException) {
      errback('getTrace failed: ', isException.value);
      return;
    }
    callback(result);
  }
  chrome.devtools.inspectedWindow.eval('__F_', onEval);
}

// API

function getTrace(callback, errback) {
  getEncodedTrace(function(encodedTrace) {
    loadSources(encodedTrace.calls, encodedTrace.urls, function(calls, sources) {
      callback(decodeTraceToLineNumbers(calls, encodedTrace.urls, sources));
    });
  }, errback);
}
