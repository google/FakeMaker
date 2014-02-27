// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2013 Google Inc. johnjbarton@google.com

import {BindingIdentifier} from '../third_party/traceur-compiler/src/syntax/trees/ParseTrees';
import {
  FreeVariableChecker,
  getVariableName
} from '../third_party/traceur-compiler/src/semantics/FreeVariableChecker';
import {IdentifierExpression} from  '../third_party/traceur-compiler/src/syntax/trees/ParseTrees';
import {IdentifierToken} from '../third_party/traceur-compiler/src/syntax/IdentifierToken';
import {dumpeur} from './dumpeur';

class  Scope {
  constructor(parent, tree) {
    this.parent = parent;
    this.children = [];
    if (parent)
      parent.children.push(this);
    this.tree = tree;
    this.references = Object.create(null);
    this.declarations = Object.create(null);
  }

  reference(name, location) {
    var references = this.references[name] || [];
    references.push(location);
  }

  declare(name, location) {
    if (name in this.declarations)
      console.warn('Multiple declarations of ' + name + ' at ' + dumpeur(location));
    this.declarations[name] = location;
  }

  scopeOf(name) {
    if (name in this.declarations)
      return this;
    if (this.parent)
      return this.parent.scopeOf(name);
  }
}

/**
 * Attachs a scope to each variable declaration tree
 */
export class ScopeAttacher extends FreeVariableChecker {

  /**
     * @param {ErrorReporter} reporter
  */
  constructor (reporter, global) {
    super(reporter);
    this.global_ = global;
  }

  declareGlobals(global) {
    // Declare variables from the global scope.
    var object = global;
    while (object) {
      Object.getOwnPropertyNames(object).forEach( (name) => {
        if (! (name in this.scope_.declarations) )
          this.scope_.declare(name, 'global');
      });
      object = Object.getPrototypeOf(object);
    }
    this.globalScope_ = this.scope_;
  }

  visitScript(tree) {
    var scope = this.pushScope_(tree);
    this.declareGlobals(this.global_);

    this.visitList(tree.scriptItemList);
    tree.scope = scope;
    this.pop_(scope);
  }

  visitFunctionDeclaration(tree) {
    this.currentTree_ = tree;
    return super(tree);
  }

  visitFunctionExpression(tree) {
    this.currentTree_ = tree;
    return super(tree);
  }

  visitArrowFunctionExpression(tree) {
    this.currentTree_ = tree;
    return super(tree);
  }

  visitCatch(tree) {
    this.currentTree_ = tree;
    return super(tree);
  }

  visitGetAccessor(tree) {
    this.currentTree_ = tree;
    return super(tree);
  }

  visitSetAccessor(tree) {
    this.currentTree_ = tree;
    return super(tree);
  }

  declareVariable_(tree) {
    var name = getVariableName(tree);
    if (name) {
      var scope = this.scope_;
      scope.declare(name, tree.location);
      tree.scope = scope;
    }
  }

  pushScope_(tree) {
    tree = tree || this.currentTree_;
    if (!tree)
      throw new Error('No tree!')
    this.scope_ = new Scope(this.scope_, tree);
    return tree.scope = this.scope_;
  }

  visitIdentifierExpression(tree) {
    var name = getVariableName(tree);
    var scope = this.scope_;
    if (!(name in scope.references))
      scope.reference(name, tree.location);
    tree.scope = scope;
  }

  visitUnaryExpression(tree) {
    // FreeVariableChecker has a heuristic that we don't want to use.
    this.visitAny(tree.operand);
  }

  visitReferences(onUnresolvedReference) {
    var scope = this.scope_;
    for (var name in scope.references) {
      if (!(name in scope.declarations)) {
        var location = scope.references[name][0];
        if (!scope.parent) {
          onUnresolvedReference(name, location);
        } else if (!(name in scope.parent.references)) {
          scope.parent.reference(name, location);
        }
      }
    }
  }

  validateScope_() {
    // Promote any unresolved references to the parent scope.
    var errors = [];
    this.visitReferences((name, location) => {
      if (!location) {
        // If location is null, it means we're getting errors from code we
        // generated. This is an internal error.
        throw new Error(`generated variable ${name} is not defined`);
      }
      // If we're at the top level scope, mark it as global
      this.globalScope_.declarations[name] = location;
    })

    if (errors.length) {
      // Issue errors in source order.
      errors.sort((x, y) => x[0].offset - y[0].offset);
      errors.forEach((e) => {
        this.reportError_(...e);
      });
    }
  }

  /**
   * Build scopes and attach them to variables in the tree.
   *
   * @param {ErrorReporter} reporter
   * @param {Program} tree
   */
  static attachScopes(reporter, tree, global) {
    new ScopeAttacher(reporter, global).visitAny(tree);
    return tree.scope;
  }

}