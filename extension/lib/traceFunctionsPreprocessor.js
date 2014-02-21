// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2013 Google Inc. johnjbarton@google.com

import {fileNamer, fileRenamer} from './FileNamer';
import {TraceFunctionsTransformer} from './TraceFunctionsTransformer';
import {SourceFile} from '../third_party/traceur-compiler/src/syntax/SourceFile';
import {ErrorReporter} from '../third_party/traceur-compiler/src/util/ErrorReporter';
import {Parser} from '../third_party/traceur-compiler/src/syntax/Parser';
import {TreeWriter} from '../third_party/traceur-compiler/src/outputgeneration/TreeWriter';
import {dumpeur} from './dumpeur';

window.transcode = function transcode(src, url, fncName) {
  try {
    url = fileNamer(src, url, fncName);
    if (!url)
      return;
    console.log('tracerCompiler Transcode ' + url + ' fncName: ' + fncName, '*');
    var file = new SourceFile(url, src);
    var reporter = new ErrorReporter();
    var tree = new Parser(file).parseScript(true);
    var tracer = new TraceFunctionsTransformer(url);
    var resultTree = tracer.transformAny(tree);
    var outURL = fileRenamer(url);
    var srcURL = '\n//# sourceURL=' + outURL + '\n';
    var result =  TreeWriter.write(resultTree, {}) + srcURL;
    console.log('transcoded ' + url + ' to ' + outURL);
    return result;
  } catch (e) {
    console.error(e, e.stack);
    return "";
  }
}
