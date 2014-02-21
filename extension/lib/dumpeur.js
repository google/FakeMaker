// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2013 Google Inc. johnjbarton@google.com

import {
  TreeWriter,
} from '../third_party/traceur-compiler/src/outputgeneration/TreeWriter';
import {IdentifierExpression} from '../third_party/traceur-compiler/src/syntax/trees/ParseTrees';
import {ParseTree} from '../third_party/traceur-compiler/src/syntax/trees/ParseTree';
import {SourceRange} from '../third_party/traceur-compiler/src/util/SourceRange';

 function dumpTree(tree) {
  return TreeWriter.write(tree);
}

function dumpPosition(position) {
  return (position.line +1) + '.' + position.column;
}

function dumpSourceRange(location) {
  return location.start.source.name + '#' +
    dumpPosition(location.start) + '-' +
    dumpPosition(location.end);
}

export function dumpeur(obj) {
  if (obj instanceof ParseTree)
    return dumpTree(obj);
  else if (obj instanceof SourceRange)
    return dumpSourceRange(obj);
  else
    return obj.toString();
}

if (typeof window !== 'undefined')
  window.dumpeur = dumpeur;