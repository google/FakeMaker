// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2013 Google Inc. johnjbarton@google.com

import {
  ParseTreeTransformer,
} from '../third_party/traceur-compiler/src/codegeneration/ParseTreeTransformer';

import {
  createArgumentList,
  createBinaryOperator,
  createCallExpression,
  createConditionalExpression,
  createIdentifierExpression,
  createIdentifierToken,
  createMemberExpression,
  createOperatorToken,
  createStringLiteral
} from '../third_party/traceur-compiler/src/codegeneration/ParseTreeFactory';
import {
  ParenExpression
} from '../third_party/traceur-compiler/src/syntax/trees/ParseTrees';
import {
  IN
} from '../third_party/traceur-compiler/src/syntax/TokenType';
import {dumpeur} from './dumpeur';
/**
 * Wrap new-ed objects for runtime post-processing.
 * Assumes we have called ScopeAttacher
 */
export class AttachWindowProxyToGlobalsTransformer extends ParseTreeTransformer {
  pushScope(tree) {
    if (tree.scope)
      this.scope_ = tree.scope;
    else
      console.warn('Tree has no scope: ', dumpeur(tree));
  }
  popScope() {
    this.scope_ = this.scope_.parent;
  }
  transformScript(tree) {
    this.pushScope(tree);
    this.globalScope_ = tree.scope;
    tree = super(tree);
    this.popScope();
    return tree;
  }
  transformWithScope_(tree, superFunction) {
    this.pushScope(tree);
    tree = superFunction(tree);
    this.popScope();
    return tree;
  }
  transformFunctionDeclaration(tree) {
    return this.transformWithScope_(tree, (tree) =>
      super.transformFunctionDeclaration(tree));
  }
  transformFunctionExpression(tree) {
    return this.transformWithScope_(tree, (tree) =>
      super.transformFunctionExpression(tree));
  }
  transformArrowFunctionExpression(tree) {
    return this.transformWithScope_(tree, (tree) =>
      super.transformArrowFunctionExpression(tree));
  }
  transformGetAccessor(tree) {
    return this.transformWithScope_(tree, (tree) =>
      super.transformGetAccessor(tree));
  }
  transformSetAccessor(tree) {
    return this.transformWithScope_(tree, (tree) =>
      super.transformSetAccessor(tree));
  }
  transformCatch(tree) {
    return this.transformWithScope_(tree, (tree) =>
      super.transformCatch(tree));
  }

  transformIdentifierExpression(tree) {
    var name = tree.identifierToken.value;
    if (name === 'window')  {
      return createIdentifierExpression(
          createIdentifierToken('windowProxy'),
      );
    }

    if (tree.scope) {
        // console.log('scope for ' + name);
    } else if (name in this.globalScope_.declarations) {
        tree.scope = this.globalScope_;
    } else {
        console.warn('No scope for identifier expression \'' + name + '\' at ' + dumpeur(tree.location));
    }

    if (tree.scope === this.globalScope_) {
      return createMemberExpression(
        createIdentifierExpression(
          createIdentifierToken('windowProxy'),
        ),
        tree.identifierToken
      );
    } else {
      return tree;
    }
  }

}