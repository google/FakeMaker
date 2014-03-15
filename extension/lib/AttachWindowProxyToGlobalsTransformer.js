// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2013 Google Inc. johnjbarton@google.com

import {
  ParseTreeTransformer,
} from '../third_party/traceur-compiler/src/codegeneration/ParseTreeTransformer';

import {
  createArgumentList,
  createAssignmentStatement,
  createBinaryOperator,
  createCallExpression,
  createCommaExpression,
  createConditionalExpression,
  createExpressionStatement,
  createIdentifierExpression,
  createIdentifierToken,
  createMemberExpression,
  createOperatorToken,
  createStringLiteral,
  createUndefinedExpression
} from '../third_party/traceur-compiler/src/codegeneration/ParseTreeFactory';

import {
  ParenExpression
} from '../third_party/traceur-compiler/src/syntax/trees/ParseTrees';
import {IN} from '../third_party/traceur-compiler/src/syntax/TokenType';
import {dumpeur} from './dumpeur';

function nameToWindowProxyProperty(tree) {
  var name = tree.identifierToken + '';
  if (name === 'console')
    return tree;
  else {
    return createMemberExpression(
      createIdentifierExpression(
        createIdentifierToken('windowProxy')
      ),
      name
    );
  }
}

/**
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
    tree = this.transformWithScope_(tree, (tree) =>
      super.transformFunctionDeclaration(tree));

    if (this.scope_ === this.globalScope_) {
      var name = this.transformAny(tree.name);
      var lhs = nameToWindowProxyProperty(name);
      tree =  createAssignmentStatement(lhs, tree);
    }
    return tree;
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

  transformThisExpression(tree) {
    if (this.scope_ !== this.globalScope_)
      return tree;
    // Re-write global 'this.' as 'windowProxy'
    return createIdentifierExpression(
          createIdentifierToken('windowProxy')
      );
  }

  transformVariableDeclarationList(tree) {
    if (this.scope_ === this.globalScope_) {
      // At global scope we convert var lists to windowProxy.prop initializations
      var declarations = tree.declarations;
      // list of declarations to expression list....
      var assignments = this.transformList(declarations);
      return createExpressionStatement(
        createCommaExpression(assignments)
      );
    } else {
      return super(tree);
    }
  }

  transformVariableDeclaration(tree) {
    if (this.scope_ === this.globalScope_) {
      // At global scope convert a var decl to a window.prop initialization.
      var lvalue = this.transformAny(tree.lvalue);
      var lhs = nameToWindowProxyProperty(lvalue);
      var rhs;
      if (tree.initialiser)
        rhs = this.transformAny(tree.initialiser);
      else
        rhs = createUndefinedExpression();
      return createAssignmentStatement(lhs, rhs);
    } else {
      return super(tree);
    }
  }

  transformIdentifierExpression(tree) {
    var name = tree.identifierToken.value;
    if (name === 'window')  {
      return createIdentifierExpression(
          createIdentifierToken('windowProxy')
      );
    }
    tree.scope = this.scope_.scopeOf(name);

    // The identifier may be global but it may be also be
    // a ref to a global that was added dynamically.
    if (tree.scope === this.globalScope_ || !tree.scope) {
      return nameToWindowProxyProperty(tree);
    } else {
      return tree;
    }
  }

}