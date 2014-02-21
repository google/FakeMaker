// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2013 Google Inc. johnjbarton@google.com

/**
 * overview: Function enter/leave tracing
 */


import {
  ParseTreeTransformer,
} from '../third_party/traceur-compiler/src/codegeneration/ParseTreeTransformer';

import {
  CallExpression,
  CommaExpression,
  FunctionBody,
  ParenExpression,
  ReturnStatement
} from '../third_party/traceur-compiler/src/syntax/trees/ParseTrees';
import {
  parseExpression,
  parseStatement
} from '../third_party/traceur-compiler/src/codegeneration/PlaceholderParser';
import {
  RETURN_STATEMENT
} from '../third_party/traceur-compiler/src/syntax/trees/ParseTreeType';

import {dumpeur} from './dumpeur';

export class TraceFunctionsTransformer extends ParseTreeTransformer {

  constructor(sourceId) {
    this.sourceId = sourceId;
  }
  enterStatement(tree) {
    var offset = tree.location.start.offset;
    return parseStatement `__F_.enterF(${this.sourceId}, ${offset});`;
  }
  exitExpression(tree) {
    var offset = tree.location.end.offset;
    return parseExpression `__F_.exitF(${offset})`;
  }
  callExpression(tree) {
    var offset = tree.location.end.offset;
    return parseExpression `__F_.callF(${this.sourceId}, ${offset})`;
  }
  transformCallExpression(tree) {
    var operand = this.transformAny(tree.operand);
    var args = this.transformAny(tree.args);
    return new ParenExpression(tree.location, 
        new CommaExpression(tree.location, [
            this.callExpression(tree), 
            new CallExpression(tree.location, operand, args)
          ])
        );
  }
  transformFunctionBody(tree) {
    var statements = this.transformList(tree.statements);
    statements.unshift(this.enterStatement(tree));
    if (statements[statements.length - 1].type !== RETURN_STATEMENT) {
      statements.push(new ReturnStatement(tree.location, this.exitExpression(tree)));
    }
    return new FunctionBody(tree.location, statements);
  }
  transformReturnStatement(tree) {
    var expression = this.transformAny(tree.expression);
    // return $__exitF('name'), expression
    var exitExpression = this.exitExpression(tree);
    if (expression)
      expression = new CommaExpression(tree.location, [exitExpression, expression]);
    else
      expression = exitExpression;
    return new ReturnStatement(tree.location, expression);
  }
}