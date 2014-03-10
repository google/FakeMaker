// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2014 Google Inc. johnjbarton@google.com

var noTranscode = '// .noTranscode  ';
window.evalish = 0;
window.__unique_transcoding_urls = {};

export function fileNamer(src, url, fncName) {
  // While checking for noTranscode allow a IIFE prefix
  if (src.slice(0, noTranscode.length + 80).indexOf('noTranscode') !== -1)
        return;
  if (url.lastIndexOf('/') === url.length - 1)
    url += 'index.html';
  return url;  // TODO
  url = url || fnc || 'probably_evalish_' + (window.evalish++) + '.js';
  if (url.lastIndexOf('/') === (url.length - 1))
    url += 'index_' + window.evalish++ + '.js';
  return url;
}

export function fileRenamer(url) {
  var transcodingURL = url.replace(/\.js$/, '.ps').replace(/\.html$/, '.ps');
  if (window.__unique_transcoding_urls[transcodingURL]) {
    transcodingURL = transcodingURL.replace(/\.ps$/, '.' + (window.evalish++) + '.ps');
  }
  window.__unique_transcoding_urls[transcodingURL] = true;
  return transcodingURL;
}