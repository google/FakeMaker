// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2013 Google Inc. johnjbarton@google.com
import {AttachWindowProxyToGlobalsTransformer} from './AttachWindowProxyToGlobalsTransformer';
import {TraceFunctionsTransformer} from './TraceFunctionsTransformer';
import {SourceFile} from '../third_party/traceur-compiler/src/syntax/SourceFile';
import {fileNamer, fileRenamer} from './FileNamer';
import {ErrorReporter} from '../third_party/traceur-compiler/src/util/ErrorReporter';
import {Parser} from '../third_party/traceur-compiler/src/syntax/Parser';
import {ParseTree} from '../third_party/traceur-compiler/src/syntax/trees/ParseTree';
import {TreeWriter} from '../third_party/traceur-compiler/src/outputgeneration/TreeWriter';
import {ScopeAttacher} from './ScopeAttacher';
import {dumpeur} from './dumpeur';

window.transcode = function transcode(src, url, fncName) {
    url = fileNamer(src, url, fncName);
    if (!url)
      return;
    var file = new SourceFile(url, src);
    var tree = new Parser(file).parseScript(true);
    var global = window; // This is the preprocessor's window.
    var reporter = new ErrorReporter();
    var globalScope = ScopeAttacher.attachScopes(reporter, tree, global);
    var transformer = new AttachWindowProxyToGlobalsTransformer();
    var tracer = new TraceFunctionsTransformer(url);
    var resultTree = tracer.transformAny(transformer.transformAny(tree));
    var outURL = fileRenamer(url);
    var srcURL = '\n//# sourceURL=' + outURL + '\n';
    var result = TreeWriter.write(resultTree, {}) + srcURL;
    var resultFile = new SourceFile(outURL, result);
    //console.log('transcoded ' + url + ' to ' + outURL);
    return result;
}
