'use strict';
/**
 * ast.js — node shapes, the child table every traversal uses, and a range-based walker.
 *
 * Nodes are plain objects: `{ type, …fields, loc }` where `loc` is `{ start, end, line, column }`
 * taken from the tokens that produced the node (offsets into the original source, 1-based line).
 * Every node carries its own original range, so from any node in the tree it is possible to say
 * where in the file it came from — which is what an elimination report needs, and what a source map
 * needs at the moment a name is rewritten.
 *
 * `KEYS` is the single place that knows the children of each node type; `walk`, `count` and the
 * renamer all read it, so a new node type cannot be added to the parser and silently invisible to
 * the analyser.
 */
const KEYS = {
  Program: ['body'], ExpressionStatement: ['expression'], BlockStatement: ['body'], EmptyStatement: [],
  VariableDeclaration: ['declarations'], VariableDeclarator: ['id', 'init'],
  FunctionDeclaration: ['id', 'params', 'body'], FunctionExpression: ['id', 'params', 'body'],
  ArrowFunctionExpression: ['params', 'body'],
  ClassDeclaration: ['id', 'superClass', 'body'], ClassExpression: ['id', 'superClass', 'body'],
  ClassBody: ['body'], MethodDefinition: ['key', 'value'], PropertyDefinition: ['key', 'value'],
  StaticBlock: ['body'],
  ReturnStatement: ['argument'], ThrowStatement: ['argument'], BreakStatement: ['label'], ContinueStatement: ['label'],
  IfStatement: ['test', 'consequent', 'alternate'], ForStatement: ['init', 'test', 'update', 'body'],
  ForInStatement: ['left', 'right', 'body'], ForOfStatement: ['left', 'right', 'body'],
  WhileStatement: ['test', 'body'], DoWhileStatement: ['test', 'body'],
  SwitchStatement: ['discriminant', 'cases'], SwitchCase: ['test', 'consequent'],
  TryStatement: ['block', 'handler', 'finalizer'], CatchClause: ['param', 'body'],
  LabeledStatement: ['label', 'body'], WithStatement: ['object', 'body'], DebuggerStatement: [],
  Identifier: [], PrivateName: ['id'], Literal: [], TemplateLiteral: ['quasis', 'expressions'],
  TemplateElement: [], TaggedTemplateExpression: ['tag', 'quasi'],
  ArrayExpression: ['elements'], ObjectExpression: ['properties'], Property: ['key', 'value'],
  SpreadElement: ['argument'], RestElement: ['argument'], AssignmentPattern: ['left', 'right'],
  ArrayPattern: ['elements'], ObjectPattern: ['properties'],
  CallExpression: ['callee', 'arguments'], NewExpression: ['callee', 'arguments'],
  MemberExpression: ['object', 'property'], UnaryExpression: ['argument'], UpdateExpression: ['argument'],
  BinaryExpression: ['left', 'right'], LogicalExpression: ['left', 'right'], AssignmentExpression: ['left', 'right'],
  ConditionalExpression: ['test', 'consequent', 'alternate'], SequenceExpression: ['expressions'],
  YieldExpression: ['argument'], AwaitExpression: ['argument'], MetaProperty: [],
  ChainExpression: ['expression'], ParenExpression: ['expression'],
  ImportDeclaration: ['specifiers'], ImportSpecifier: ['imported', 'local'], ImportDefaultSpecifier: ['local'],
  ImportNamespaceSpecifier: ['local'], ExportNamedDeclaration: ['declaration', 'specifiers'], ExportSpecifier: ['local', 'exported'],
  ExportDefaultDeclaration: ['declaration'], ExportAllDeclaration: ['source'],
};

const STATEMENTS = new Set(['ExpressionStatement', 'BlockStatement', 'EmptyStatement', 'VariableDeclaration', 'FunctionDeclaration', 'ClassDeclaration', 'ReturnStatement', 'ThrowStatement', 'BreakStatement', 'ContinueStatement', 'IfStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement', 'SwitchStatement', 'TryStatement', 'LabeledStatement', 'WithStatement', 'DebuggerStatement', 'ImportDeclaration', 'ExportNamedDeclaration', 'ExportDefaultDeclaration', 'ExportAllDeclaration']);
/** A function in the AST is a scope and a `this` boundary; the two are not always the same set. */
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
/** Nodes that accept one statement, so a block may be flattened into them when it is safe. */
const SINGLE_STATEMENT_BODY = new Set(['IfStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement', 'LabeledStatement', 'WithStatement']);

const isStatement = (n) => !!n && STATEMENTS.has(n.type);
const isFunction = (n) => !!n && FUNCTIONS.has(n.type);
const isPattern = (n) => !!n && ['Identifier', 'ArrayPattern', 'ObjectPattern', 'RestElement', 'AssignmentPattern', 'MemberExpression', 'Property'].includes(n.type);

/** Depth-first pre-order walk. `visitors` maps a node type to `(node, parent)`. */
function walk(node, visitors, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  const visit = visitors[node.type];
  if (visit) visit(node, parent, visitors);
  for (const key of KEYS[node.type] || []) {
    const child = node[key];
    if (Array.isArray(child)) { for (const c of child) if (c) walk(c, visitors, node); }
    else if (child) walk(child, visitors, node);
  }
}

/** Pre-order walk over a list of statements/nodes. */
function walkAll(nodes, visitors) { for (const n of nodes || []) walk(n, visitors, null); }

/** Every node, in pre-order: `collect(program, 'Identifier')` — used by the probes. */
function collect(node, type) {
  const out = [];
  walk(node, { [type]: (n) => out.push(n) });
  return out;
}

/** The child keys of a node, resolved: `[{ key, node }]` for scalars and array members alike. */
function children(node) {
  const out = [];
  for (const key of KEYS[node.type] || []) {
    const child = node[key];
    if (Array.isArray(child)) child.forEach((c, index) => { if (c) out.push({ key, index, node: c }); });
    else if (child) out.push({ key, node: child });
  }
  return out;
}

/** Replace a child in place (arrays and scalars alike); returns the parent for chaining. */
function replaceChild(parent, key, index, replacement) {
  if (index === undefined) parent[key] = replacement;
  else parent[key][index] = replacement;
  return parent;
}

module.exports = { KEYS, STATEMENTS, FUNCTIONS, SINGLE_STATEMENT_BODY, isStatement, isFunction, isPattern, walk, walkAll, collect, children, replaceChild };
