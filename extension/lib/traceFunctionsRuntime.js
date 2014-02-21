// .noTranscode
// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2013 Google Inc. johnjbarton@google.com

/**
 * Function enter/exit tracing. Encoding Format:
 *    hexnumber (0xf): a new source file is current file.
 *    -hex (-0xf): callsite + 1
 *    + number: enter a function at offset 'number' of current file
 *    - number: exit a function at offset '-number' of current file.
 */
window.__F_ = {
  urls: [],
  calls: [],
  sourceF: function(sourceId) {
    var sourceIndex = __F_.urls.indexOf(sourceId);
    if (sourceIndex !== __F_.currentSourceIndex) {
      if (sourceIndex === -1) {
        sourceIndex = __F_.urls.length;
        __F_.urls.push(sourceId);
         __F_.currentSourceIndex = sourceIndex;
      }
      __F_.calls.push('0x' + sourceIndex.toString(16));
    }
  },
  enterF: function enterF(sourceId, offset) {
    __F_.sourceF(sourceId);
    __F_.calls.push(offset);
  },
  exitF: function exitF(offset) {
    __F_.calls.push(-offset);
  },
  callF: function callF(sourceId, offset) {
    __F_.sourceF(sourceId);
    __F_.calls.push('-0x' + (offset + 1).toString(16));
  }
};
