// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2014 Google Inc. johnjbarton@google.com

var noTranscode = '// .noTranscode';
window.evalish = 0;

export function fileNamer(src, url, fncName) {
  if (src.slice(0, noTranscode.length) === noTranscode)
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
  return url.replace(/\.js$/, '.ps').replace(/\.html$/, '.ps');
}