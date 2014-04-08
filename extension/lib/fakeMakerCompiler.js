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
    try {
        url = fileNamer(src, url, fncName);
        if (!url)
          return;
        var file = new SourceFile(url, src);
        var tree = new Parser(file).parseScript(true);
        var global = window; // This is the preprocessor's window.
        var reporter = new ErrorReporter();
        var globalScope = ScopeAttacher.attachScopes(reporter, tree, global);
        var prefixGlobalsWithWindowProxy = new AttachWindowProxyToGlobalsTransformer();
        var resultTree = prefixGlobalsWithWindowProxy.transformAny(tree);
        if (!window.transcode.noTracing) {
            var tracer = new TraceFunctionsTransformer(url);
            resultTree = tracer.transformAny(resultTree);
        }
        var outURL = fileRenamer(url);
        var encodedSrc = '';
        if (!window.transcode.noEncodeSource) {
            encodedSrc += 'window.__F_srcs = window.__F_srcs || [];';
            encodedSrc += 'window.__F_srcs.push({url: \"' + url + '\", src: \"' +window.btoa(src) + '\"});\n';
        }
        var optionsInfo = '//';
        optionsInfo += ' noTracing: ' + window.transcode.noTracing;
        optionsInfo += ' noEncodeSource: ' + window.transcode.noEncodeSource;
        optionsInfo += ' noSourceURL: ' + window.transcode.noSourceURL;
        var srcURL = '';
        if (!window.transcode.noSourceURL) {
            srcURL += '\n//# sourceURL=' + outURL + '\n';
        }
        var result = TreeWriter.write(resultTree, {}) + encodedSrc + optionsInfo + srcURL;
        return result;
    } catch (ex) {
        console.log('transcode fails, sending original source for ' + url);
        return src;
    }
}
