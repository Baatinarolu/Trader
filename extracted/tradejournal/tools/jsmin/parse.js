'use strict';
/**
 * parse.js — the parser. A hand-written recursive-descent / Pratt parser over the token array from
 * lexer.js, producing the plain-object AST in ast.js.
 *
 * Scope, stated because a compressor's guarantees depend on it: this parses ECMAScript 2020
 * *syntax*, and nothing in here assumes anything about types. Where the grammar is ambiguous it
 * resolves the ambiguity the way the spec's cover grammar does:
 *
 *   * `(` is tried as an arrow parameter list first and put back on failure, which is why the whole
 *     file is tokenized up front;
 *   * object literals are parsed as expressions and converted to patterns when an `=` or an arrow
 *     turns them into one (`toPattern`) — the same trick the spec uses;
 *   * `in` is disabled while parsing the head of a `for` statement, then re-enabled;
 *   * statement-level `{` is a block, expression-level `{` is an object, and the parser knows which
 *     side of the line it is on.
 *
 * Errors are `SyntaxError` with `line`, `column` and `offset`, thrown at the token that caused them.
 * Nothing here writes, logs, or reads a file: `parse(source)` is pure.
 */
const { tokenize } = require('./lexer');
const { SINGLE_STATEMENT_BODY } = require('./ast');

const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', '&&=', '||=', '??=']);
const BINARY_PRECEDENCE = {
  '??': 1, '||': 2, '&&': 3, '|': 4, '^': 5, '&': 6,
  '==': 7, '!=': 7, '===': 7, '!==': 7,
  '<': 8, '>': 8, '<=': 8, '>=': 8, 'instanceof': 8, 'in': 8,
  '<<': 9, '>>': 9, '>>>': 9, '+': 10, '-': 10, '*': 11, '/': 11, '%': 11, '**': 12,
};
const UNARY = new Set(['-', '+', '!', '~', 'typeof', 'void', 'delete']);
const ASSIGNMENT_TARGETS = new Set(['Identifier', 'MemberExpression', 'ArrayPattern', 'ObjectPattern', 'ArrayExpression', 'ObjectExpression', 'AssignmentPattern', 'RestElement', 'Property', 'ParenExpression']);
/** Property names that are keywords but legal identifiers in a member/`as` position. */
const isPropertyName = (t) => t && (t.type === 'name' || t.type === 'keyword' || t.type === 'private');

class Parser {
  constructor(source, options = {}) {
    const scanned = tokenize(source);
    this.source = source; this.tokens = scanned.tokens;
    this.sourceType = options.sourceType === 'module' ? 'module' : 'script';
    this.t = 0; this.depth = 0;
  }

  get cur() { return this.tokens[this.t]; }
  peek(ahead = 1) { return this.tokens[this.t + ahead] || this.tokens[this.tokens.length - 1]; }

  /** `line`/`column` are kept the way the source map wants them (1-based line, 0-based column); the
   * message shows the 1-based pair, which is what a person reading an editor's gutter expects. */
  error(message, token = this.cur) {
    const e = new SyntaxError(`${message} at ${token.line}:${token.column + 1}`);
    e.line = token.line; e.column = token.column; e.offset = token.start; e.name = 'SyntaxError';
    throw e;
  }

  /** Structural token test. The comparison is limited to tokens whose text IS their value: a
   * template chunk, a string or a number carries free text in `value`, so a template whose last
   * character is `.` must never satisfy `at('.')`. */
  at(value, type) {
    const t = this.cur;
    if (type) return t.type === type && t.value === value;
    if (t.type !== 'punct' && t.type !== 'keyword' && t.type !== 'name') return false;
    return t.value === value;
  }
  atPunct(value) { const t = this.cur; return t.type === 'punct' && t.value === value; }
  /** Is the NEXT token this punctuation? A string or a template chunk may carry the same text, so
   * the lookahead needs the type too. */
  peekPunct(value) { const t = this.peek(); return t.type === 'punct' && t.value === value; }
  atKeyword(value) { const t = this.cur; return t.type === 'keyword' && t.value === value; }
  atName(value) { const t = this.cur; return (t.type === 'name' || t.type === 'keyword') && t.value === value && (value === undefined || true); }

  next() { const t = this.cur; if (t.type !== 'eof') this.t++; return t; }
  eat(value, type) { if (this.at(value, type)) { this.next(); return true; } return false; }
  expect(value, type) { if (!this.eat(value, type)) this.error(`expected ${JSON.stringify(value)} but found ${JSON.stringify(this.cur.value)}`); return this.tokens[this.t - 1]; }
  expectType(type, what) { if (this.cur.type !== type) this.error(`expected ${what || type} but found ${JSON.stringify(this.cur.value)}`); return this.next(); }

  /** A source range from two things that carry positions — a token or a node. A node's own `loc` is
   * used when it has one: without that, `this.loc(nodeA, tokenB)` produced a range with no start line
   * and no start column, which then reached the source map as an undefined original position. */
  loc(from, to = this.tokens[Math.max(0, this.t - 1)]) {
    const a = from && from.loc ? from.loc : from;
    const b = to && to.loc ? to.loc : to;
    return { start: a.start, end: b.end, line: a.line, column: a.column, endLine: b.line, endColumn: b.column };
  }

  save() { return this.t; }
  restore(index) { this.t = index; }

  /** Statement terminator, with the automatic-semicolon rules and one honest limitation: the
   * restricted-production case (`return` followed by a newline) is handled by the statement parsers
   * themselves, not here. */
  semicolon() {
    if (this.eat(';')) return true;
    const t = this.cur;
    if (t.type === 'eof' || this.atPunct('}') || t.newlineBefore) return false;
    this.error(`expected ; but found ${JSON.stringify(t.value)}`);
  }

  // ------------------------------------------------------------------ program
  parseProgram() {
    const start = this.cur, body = [];
    while (this.cur.type !== 'eof') body.push(this.parseStatement());
    return { type: 'Program', sourceType: this.sourceType, body, loc: this.loc(start, this.tokens[this.tokens.length - 1]) };
  }

  // --------------------------------------------------------------- statements
  parseStatement() {
    const t = this.cur;
    if (t.type === 'keyword') {
      switch (t.value) {
        case 'var': case 'let': case 'const': {
          if (t.value === 'let') { const after = this.peek(); if (!isBindingStart(after)) break; }
          const node = this.parseVariableDeclaration(); this.semicolon(); return node;
        }
        case 'function': if (this.peek().type === 'name' || this.peekPunct('(') || this.peekPunct('*')) return this.parseFunction(true);
          break;
        case 'class': return this.parseClass(true);
        case 'if': return this.parseIf();
        case 'for': return this.parseFor();
        case 'while': return this.parseWhile();
        case 'do': return this.parseDoWhile();
        case 'switch': return this.parseSwitch();
        case 'try': return this.parseTry();
        case 'throw': return this.parseThrow();
        case 'return': return this.parseReturn();
        case 'break': case 'continue': return this.parseBreakContinue(t.value);
        case 'debugger': { const s = this.next(); this.semicolon(); return { type: 'DebuggerStatement', loc: this.loc(s) }; }
        case 'with': return this.parseWith();
        case 'import': if (this.sourceType === 'module' || this.peek().value === '(' || this.peek().value === '.') return this.parseImportStatement(); break;
        case 'export': if (this.sourceType === 'module') return this.parseExportStatement(); break;
        default: break;
      }
    }
    if (this.atPunct('{')) return this.parseBlock();
    if (this.atPunct(';')) { const s = this.next(); return { type: 'EmptyStatement', loc: this.loc(s) }; }
    if (t.type === 'name' && t.value === 'async' && this.peek().type === 'keyword' && this.peek().value === 'function' && !this.peek().newlineBefore) {
      const kw = this.next(), first = this.next(), generator = this.eat('*');
      let id = null;
      if (this.cur.type === 'name') id = this.parseIdentifier();
      const { params, body } = this.parseParamsAndBody();
      if (!body) this.error('an async function declaration needs a body', this.cur);
      return { type: 'FunctionDeclaration', id, params, body, async: true, generator, loc: this.loc(kw, this.tokens[this.t - 1]) };
    }
    if (t.type === 'name' && this.peek().type === 'punct' && this.peek().value === ':') {
      const label = this.parseIdentifier(), colon = this.expect(':');
      if (this.at('function')) this.error('a labelled function declaration is not allowed in strict mode', this.cur);
      return { type: 'LabeledStatement', label, body: this.parseStatement(), loc: this.loc(label, this.tokens[this.t - 1]) };
    }
    if (this.isDirective()) return this.parseDirective();
    const expression = this.parseExpression();
    this.semicolon();
    return { type: 'ExpressionStatement', expression, loc: this.loc(expression, this.tokens[this.t - 1]) };
  }

  isDirective() {
    const t = this.cur;
    if (t.type !== 'str') return false;
    const next = this.peek();
    return next.type === 'punct' && (next.value === ';' || next.value === '}') || next.type === 'eof' || next.newlineBefore;
  }

  parseDirective() {
    const t = this.next();
    const literal = { type: 'Literal', kind: 'string', value: t.value, raw: t.raw, loc: this.loc(t) };
    // A prologue's spelling is part of its meaning: `"use strict"` is a directive and `'use strict'`
    // is one too, but `"use\\x20strict"` is not, so the node remembers that it may not be reprinted —
    // by the emitter (which writes `raw` verbatim) or by a pass that would shorten it.
    Object.defineProperty(literal, '__directive', { value: true, enumerable: false });
    const node = { type: 'ExpressionStatement', expression: literal, directive: t.raw, loc: this.loc(t) };
    Object.defineProperty(node, '__directive', { value: true, enumerable: false });
    this.semicolon();
    return node;
  }

  parseBlock() {
    const open = this.expect('{'), body = [];
    while (!this.at('}') && this.cur.type !== 'eof') body.push(this.parseStatement());
    const close = this.expect('}');
    return { type: 'BlockStatement', body, loc: this.loc(open, close) };
  }

  parseVariableDeclaration(noSemicolon = false) {
    const kind = this.next();
    const declarations = [];
    for (;;) {
      const id = this.parseBindingTarget(false);
      let init = null;
      if (this.eat('=')) init = this.parseAssignment();
      declarations.push({ type: 'VariableDeclarator', id, init, loc: this.loc(id, this.tokens[this.t - 1]) });
      if (!this.eat(',')) break;
      if (noSemicolon === 'noIn' && (this.at('of') || this.at('in'))) break;
    }
    return { type: 'VariableDeclaration', kind: kind.value, declarations, loc: this.loc(kind, this.tokens[this.t - 1]) };
  }

  parseIf() {
    const kw = this.next(); this.expect('('); const test = this.parseExpression(); this.expect(')');
    const consequent = this.parseStatement();
    let alternate = null;
    if (this.eat('else')) alternate = this.parseStatement();
    return { type: 'IfStatement', test, consequent, alternate, loc: this.loc(kw, this.tokens[this.t - 1]) };
  }

  parseFor() {
    const kw = this.next();
    let awaitFlag = false;
    if (this.atKeyword('await')) { awaitFlag = true; this.next(); }
    this.expect('(');
    if (this.at(';')) { // for (;;)
      this.next();
      const test = this.at(';') ? null : this.parseExpression();
      this.expect(';');
      const update = this.at(')') ? null : this.parseExpression();
      this.expect(')');
      return { type: 'ForStatement', init: null, test, update, body: this.parseStatement(), loc: this.loc(kw, this.tokens[this.t - 1]) };
    }
    let init;
    if (this.atKeyword('var') || this.atKeyword('const') || (this.atKeyword('let') && isBindingStart(this.peek()))) {
      init = this.parseVariableDeclaration('noIn');
      if (this.at('of') || this.atKeyword('of')) { this.next(); const right = this.parseAssignment(); this.expect(')'); return { type: 'ForOfStatement', await: awaitFlag, left: init, right, body: this.parseStatement(), loc: this.loc(kw, this.tokens[this.t - 1]) }; }
      if (this.atKeyword('in')) { this.next(); const right = this.parseExpression(); this.expect(')'); return { type: 'ForInStatement', left: init, right, body: this.parseStatement(), loc: this.loc(kw, this.tokens[this.t - 1]) }; }
      this.expect(';');
      const test = this.at(';') ? null : this.parseExpression(); this.expect(';');
      const update = this.at(')') ? null : this.parseExpression(); this.expect(')');
      return { type: 'ForStatement', init, test, update, body: this.parseStatement(), loc: this.loc(kw, this.tokens[this.t - 1]) };
    }
    init = this.parseExpression(false);
    if (this.atKeyword('in') || this.atName('of')) {
      const isOf = this.atName('of') && !this.atKeyword('in');
      this.next();
      const right = isOf ? this.parseAssignment() : this.parseExpression();
      this.expect(')');
      const left = this.toPattern(init, true);
      return { type: isOf ? 'ForOfStatement' : 'ForInStatement', await: awaitFlag, left, right, body: this.parseStatement(), loc: this.loc(kw, this.tokens[this.t - 1]) };
    }
    this.expect(';');
    const test = this.at(';') ? null : this.parseExpression(); this.expect(';');
    const update = this.at(')') ? null : this.parseExpression(); this.expect(')');
    return { type: 'ForStatement', init, test, update, body: this.parseStatement(), loc: this.loc(kw, this.tokens[this.t - 1]) };
  }

  parseWhile() {
    const kw = this.next(); this.expect('('); const test = this.parseExpression(); this.expect(')');
    return { type: 'WhileStatement', test, body: this.parseStatement(), loc: this.loc(kw, this.tokens[this.t - 1]) };
  }

  parseDoWhile() {
    const kw = this.next(); const body = this.parseStatement(); this.expect('while'); this.expect('(');
    const test = this.parseExpression(); this.expect(')'); this.eat(';');
    return { type: 'DoWhileStatement', test, body, loc: this.loc(kw, this.tokens[this.t - 1]) };
  }

  parseSwitch() {
    const kw = this.next(); this.expect('('); const discriminant = this.parseExpression(); this.expect(')'); this.expect('{');
    const cases = [];
    while (!this.at('}') && this.cur.type !== 'eof') {
      const start = this.cur;
      let test = null;
      if (this.eat('case')) test = this.parseExpression(); else this.expect('default');
      this.expect(':');
      const consequent = [];
      while (!this.at('}') && !this.at('case') && !this.atKeyword('default') && this.cur.type !== 'eof') consequent.push(this.parseStatement());
      cases.push({ type: 'SwitchCase', test, consequent, loc: this.loc(start, this.tokens[this.t - 1]) });
    }
    const close = this.expect('}');
    return { type: 'SwitchStatement', discriminant, cases, loc: this.loc(kw, close) };
  }

  parseTry() {
    const kw = this.next(); const block = this.parseBlock();
    let handler = null, finalizer = null;
    if (this.atKeyword('catch')) {
      const c = this.next(); let param = null;
      if (this.eat('(')) { param = this.parseBindingTarget(false); this.expect(')'); }
      const body = this.parseBlock();
      handler = { type: 'CatchClause', param, body, loc: this.loc(c, this.tokens[this.t - 1]) };
    }
    if (this.eat('finally')) finalizer = this.parseBlock();
    if (!handler && !finalizer) this.error('a try statement needs a catch or a finally');
    return { type: 'TryStatement', block, handler, finalizer, loc: this.loc(kw, this.tokens[this.t - 1]) };
  }

  parseThrow() {
    const kw = this.next();
    if (this.cur.newlineBefore) this.error('illegal newline after throw', this.cur);
    const argument = this.parseExpression(); this.semicolon();
    return { type: 'ThrowStatement', argument, loc: this.loc(kw, this.tokens[this.t - 1]) };
  }

  parseReturn() {
    const kw = this.next();
    let argument = null;
    if (!this.at(';') && !this.at('}') && this.cur.type !== 'eof' && !this.cur.newlineBefore) argument = this.parseExpression();
    this.semicolon();
    return { type: 'ReturnStatement', argument, loc: this.loc(kw, this.tokens[this.t - 1]) };
  }

  parseBreakContinue(kind) {
    const kw = this.next();
    let label = null;
    if (this.cur.type === 'name' && !this.cur.newlineBefore) label = this.parseIdentifier();
    this.semicolon();
    return { type: kind === 'break' ? 'BreakStatement' : 'ContinueStatement', label, loc: this.loc(kw, this.tokens[this.t - 1]) };
  }

  parseWith() {
    const kw = this.next(); this.expect('('); const object = this.parseExpression(); this.expect(')');
    return { type: 'WithStatement', object, body: this.parseStatement(), loc: this.loc(kw, this.tokens[this.t - 1]) };
  }

  parseImportStatement() {
    const kw = this.next();
    const source = this.source, specifiers = [];
    // import 'x'; | import a from 'x'; | import * as a from 'x'; | import {a, b as c} from 'x';
    if (this.cur.type === 'str') {
      const s = this.next(); this.semicolon();
      return { type: 'ImportDeclaration', specifiers, source: { type: 'Literal', kind: 'string', value: s.value, raw: s.raw, loc: this.loc(s) }, loc: this.loc(kw, this.tokens[this.t - 1]) };
    }
    if (this.cur.type === 'name') {
      const local = this.parseIdentifier();
      specifiers.push({ type: 'ImportDefaultSpecifier', local, loc: local.loc });
      this.eat(',');
    }
    if (this.eat('*')) {
      this.expect('as'); const local = this.parseIdentifier();
      specifiers.push({ type: 'ImportNamespaceSpecifier', local, loc: local.loc });
    } else if (this.at('{')) {
      this.next();
      while (!this.at('}')) {
        const imported = this.parseIdentifierName();
        const local = this.eat('as') ? this.parseIdentifier() : cloneIdentifier(imported);
        specifiers.push({ type: 'ImportSpecifier', imported, local, loc: imported.loc });
        if (!this.eat(',')) break;
      }
      this.expect('}');
    }
    this.expect('from');
    const s = this.expectType('str', 'module specifier');
    this.semicolon();
    void source;
    return { type: 'ImportDeclaration', specifiers, source: { type: 'Literal', kind: 'string', value: s.value, raw: s.raw, loc: this.loc(s) }, loc: this.loc(kw, this.tokens[this.t - 1]) };
  }

  parseExportStatement() {
    const kw = this.next();
    if (this.eat('*')) {
      let exported = null;
      if (this.eat('as')) exported = this.parseIdentifierName().name;
      this.expect('from');
      const s = this.expectType('str', 'module specifier'); this.semicolon();
      return { type: 'ExportAllDeclaration', exported, source: { type: 'Literal', kind: 'string', value: s.value, raw: s.raw, loc: this.loc(s) }, loc: this.loc(kw, this.tokens[this.t - 1]) };
    }
    if (this.atKeyword('default')) {
      this.next();
      const declaration = (this.atKeyword('function') || this.atKeyword('class')) ? this.parseStatement() : (() => { const expression = this.parseAssignment(); this.semicolon(); return expression; })();
      return { type: 'ExportDefaultDeclaration', declaration, loc: this.loc(kw, this.tokens[this.t - 1]) };
    }
    if (this.at('{')) {
      this.next(); const specifiers = [];
      while (!this.at('}')) {
        const local = this.parseIdentifierName();
        const exported = this.eat('as') ? this.parseIdentifierName() : cloneIdentifier(local);
        specifiers.push({ type: 'ExportSpecifier', local, exported, loc: local.loc });
        if (!this.eat(',')) break;
      }
      this.expect('}');
      let source = null;
      if (this.eat('from')) { const s = this.expectType('str', 'module specifier'); source = { type: 'Literal', kind: 'string', value: s.value, raw: s.raw, loc: this.loc(s) }; }
      this.semicolon();
      return { type: 'ExportNamedDeclaration', declaration: null, specifiers, source, loc: this.loc(kw, this.tokens[this.t - 1]) };
    }
    const declaration = this.parseStatement();
    return { type: 'ExportNamedDeclaration', declaration, specifiers: [], source: null, loc: this.loc(kw, this.tokens[this.t - 1]) };
  }

  // -------------------------------------------------------------- expressions
  parseExpression(allowIn = true) {
    const first = this.parseAssignment(allowIn);
    if (!this.at(',')) return first;
    const expressions = [first];
    while (this.eat(',')) expressions.push(this.parseAssignment(allowIn));
    return { type: 'SequenceExpression', expressions, loc: this.loc(first, this.tokens[this.t - 1]) };
  }

  parseAssignment(allowIn = true) {
    const t = this.cur;
    if (t.type === 'keyword' && t.value === 'yield') return this.parseYield();
    const arrow = this.tryParseArrowFunction(t);
    if (arrow) return arrow;
    const left = this.parseConditional(allowIn);
    if (this.cur.type === 'punct' && ASSIGN_OPS.has(this.cur.value)) {
      const op = this.next();
      const right = this.parseAssignment(allowIn);
      const target = this.toPattern(left, op.value === '=');
      return { type: 'AssignmentExpression', operator: op.value, left: target, right, loc: this.loc(left, this.tokens[this.t - 1]) };
    }
    return left;
  }

  /** `x => …`, `(a, b) => …`, `async x => …`, `async (a) => …` — tried, and put back if it is not one. */
  tryParseArrowFunction(t) {
    const start = this.save();
    const peekPunct = (value) => this.peek().type === 'punct' && this.peek().value === value;
    let async = false;
    if (t.type === 'name' && t.value === 'async' && !this.peek().newlineBefore && (this.peek().type === 'name' || peekPunct('('))) {
      if (this.peek().value !== 'async' || !(this.peek(2).type === 'punct' && this.peek(2).value === '=>')) { async = true; this.next(); }
    }
    const head = this.cur;
    let params = null;
    if (head.type === 'name' || (head.type === 'keyword' && !['this', 'super', 'true', 'false', 'null', 'new', 'typeof', 'void', 'delete', 'yield', 'await'].includes(head.value))) {
      if (!peekPunct('=>') || this.peek().newlineBefore) { this.restore(start); return null; }
      params = [this.parseBindingTarget()];
    } else if (this.atPunct('(')) {
      const attempt = this.tryParseParams();
      if (!attempt) { this.restore(start); return null; }
      params = attempt;
    } else { this.restore(start); return null; }
    if (!this.atPunct('=>') || this.cur.newlineBefore) { this.restore(start); return null; }
    this.next();
    const bodyStart = this.tokens[this.t > 0 ? this.t - 1 : 0];
    const body = this.at('{') ? this.parseBlock() : this.parseAssignment();
    const node = { type: 'ArrowFunctionExpression', params, body, async, generator: false, expression: body.type !== 'BlockStatement', loc: this.loc(async ? this.tokens[start] : head, this.tokens[this.t - 1]) };
    if (body.type !== 'BlockStatement') node.loc = this.loc(head, this.tokens[this.t - 1]);
    void bodyStart;
    return node;
  }

  tryParseParams() {
    const start = this.save();
    const params = [];
    try {
      this.expect('(');
      let sawRest = false;
      while (!this.at(')')) {
        if (this.at('...')) { const dots = this.next(); const argument = this.parseBindingTarget(); params.push({ type: 'RestElement', argument, loc: this.loc(dots, this.tokens[this.t - 1]) }); sawRest = true; }
        else params.push(this.parseBindingTarget());
        if (!this.eat(',')) break;
        if (sawRest) break;
      }
      if (!this.at(')')) { this.restore(start); return null; }
      this.next();
    } catch (e) { this.restore(start); return null; }
    if (!this.at('=>')) { this.restore(start); return null; }
    return params;
  }

  parseYield() {
    const kw = this.next();
    if (this.cur.newlineBefore || this.at(')') || this.at(']') || this.at('}') || this.at(',') || this.at(';') || this.cur.type === 'eof') {
      return { type: 'YieldExpression', delegate: false, argument: null, loc: this.loc(kw) };
    }
    const delegate = this.eat('*');
    const argument = this.parseAssignment();
    return { type: 'YieldExpression', delegate, argument, loc: this.loc(kw, this.tokens[this.t - 1]) };
  }

  parseConditional(allowIn = true) {
    const test = this.parseBinary(0, allowIn);
    if (!this.at('?')) return test;
    this.next();
    const consequent = this.parseAssignment(true);
    this.expect(':');
    const alternate = this.parseAssignment(allowIn);
    return { type: 'ConditionalExpression', test, consequent, alternate, loc: this.loc(test, this.tokens[this.t - 1]) };
  }

  binaryOperator(allowIn) {
    const t = this.cur;
    if (t.type === 'punct' && BINARY_PRECEDENCE[t.value] !== undefined) return t.value;
    if (t.type === 'keyword' && t.value === 'instanceof') return 'instanceof';
    if (t.type === 'keyword' && t.value === 'in' && allowIn) return 'in';
    return null;
  }

  parseBinary(minPrecedence, allowIn) {
    let left = this.parseUnary();
    for (;;) {
      const op = this.binaryOperator(allowIn);
      if (!op) break;
      const precedence = BINARY_PRECEDENCE[op];
      if (precedence < minPrecedence) break;
      // `??` cannot be mixed with `&&`/`||` without parentheses; the parenthesised form is a
      // ParenExpression, so reaching here unparenthesised is the syntax error the spec names.
      if (op === '??' && hasLogical(left)) this.error('?? cannot be mixed with && or || without parentheses', this.cur);
      this.next();
      const right = this.parseBinary(op === '**' ? precedence : precedence + 1, allowIn);
      if ((op === '&&' || op === '||') && right.type === 'BinaryExpression' && right.operator === '??') this.error('?? cannot be mixed with && or || without parentheses', this.cur);
      left = { type: (op === '&&' || op === '||' || op === '??') ? 'LogicalExpression' : 'BinaryExpression', operator: op, left, right, loc: this.loc(left, this.tokens[this.t - 1]) };
    }
    return left;
  }

  parseUnary() {
    const t = this.cur;
    if (t.type === 'punct' && (t.value === '+' || t.value === '-' || t.value === '!' || t.value === '~')) {
      const op = this.next(); const argument = this.parseUnary();
      return { type: 'UnaryExpression', operator: op.value, prefix: true, argument, loc: this.loc(op, this.tokens[this.t - 1]) };
    }
    if (t.type === 'keyword' && (UNARY.has(t.value))) {
      const op = this.next(); const argument = this.parseUnary();
      return { type: 'UnaryExpression', operator: op.value, prefix: true, argument, loc: this.loc(op, this.tokens[this.t - 1]) };
    }
    if (t.type === 'keyword' && t.value === 'await') {
      const op = this.next(); const argument = this.parseUnary();
      return { type: 'AwaitExpression', argument, loc: this.loc(op, this.tokens[this.t - 1]) };
    }
    if (this.atPunct('++') || this.atPunct('--')) {
      const op = this.next(); const argument = this.parseUnary();
      return { type: 'UpdateExpression', operator: op.value, prefix: true, argument, loc: this.loc(op, this.tokens[this.t - 1]) };
    }
    if (t.type === 'keyword' && t.value === 'new') return this.parseNew();
    return this.parsePostfix();
  }

  parseNew() { return this.parseTail(this.parseNewRaw()); }

  /** `new` and its own arguments, with the member chain a callee may carry but no calls: the
   * trailing accesses (and any call on the result) are attached by `parseTail`, so
   * `new Date(x).toLocaleDateString(locale, opts)` is a CallExpression on a NewExpression and not a
   * NewExpression whose callee ends in a call. */
  parseNewRaw() {
    const kw = this.next();
    if (this.at('.')) { this.next(); const prop = this.parseIdentifierName(); return { type: 'MetaProperty', meta: 'new', property: prop.name, loc: this.loc(kw, prop) }; }
    const callee = this.parseMemberOnly();
    const args = this.at('(') ? this.parseArguments() : [];
    return { type: 'NewExpression', callee, arguments: args, loc: this.loc(kw, this.tokens[this.t - 1]) };
  }

  /** A member chain with no calls — the `new` callee, so `new a.b()` is not `new (a.b())`. */
  parseMemberOnly() {
    let node = (this.cur.type === 'keyword' && this.cur.value === 'new') ? this.parseNewRaw() : this.parsePrimary();
    for (;;) {
      if (this.at('.')) { this.next(); const property = this.parseMemberName(); node = { type: 'MemberExpression', object: node, property, computed: false, optional: false, loc: this.loc(node, property) }; continue; }
      if (this.at('[')) { this.next(); const property = this.parseExpression(); const close = this.expect(']'); node = { type: 'MemberExpression', object: node, property, computed: true, optional: false, loc: this.loc(node, close) }; continue; }
      break;
    }
    return node;
  }

  /** Everything that may follow a primary or a `new`: member accesses, calls, `?.` and tagged
   * templates, in any order and any number. */
  parseTail(node) {
    for (;;) {
      if (this.at('.')) {
        this.next(); const property = this.parseMemberName();
        node = { type: 'MemberExpression', object: node, property, computed: false, optional: false, loc: this.loc(node, property) }; continue;
      }
      if (this.at('?.')) {
        this.next();
        if (this.at('(')) { const args = this.parseArguments(); node = { type: 'CallExpression', callee: node, arguments: args, optional: true, loc: this.loc(node, this.tokens[this.t - 1]) }; continue; }
        if (this.at('[')) { this.next(); const property = this.parseExpression(); const close = this.expect(']'); node = { type: 'MemberExpression', object: node, property, computed: true, optional: true, loc: this.loc(node, close) }; continue; }
        const property = this.parseMemberName();
        node = { type: 'MemberExpression', object: node, property, computed: false, optional: true, loc: this.loc(node, property) }; continue;
      }
      if (this.at('[')) {
        this.next(); const property = this.parseExpression(); const close = this.expect(']');
        node = { type: 'MemberExpression', object: node, property, computed: true, optional: false, loc: this.loc(node, close) }; continue;
      }
      if (this.at('(')) { const args = this.parseArguments(); node = { type: 'CallExpression', callee: node, arguments: args, optional: false, loc: this.loc(node, this.tokens[this.t - 1]) }; continue; }
      if (this.cur.type === 'template' || this.cur.type === 'template_head') { const quasi = this.parseTemplateLiteral(); node = { type: 'TaggedTemplateExpression', tag: node, quasi, loc: this.loc(node, this.tokens[this.t - 1]) }; continue; }
      break;
    }
    return node;
  }

  parsePostfix() {
    let node = this.parseCallMember();
    if ((this.at('++') || this.at('--')) && !this.cur.newlineBefore) {
      const op = this.next();
      node = { type: 'UpdateExpression', operator: op.value, prefix: false, argument: node, loc: this.loc(node, op) };
    }
    return node;
  }

  parseCallMember() { return this.parseTail(this.parsePrimary()); }

  parseArguments() {
    this.expect('(');
    const args = [];
    while (!this.at(')')) {
      if (this.at('...')) { const dots = this.next(); const argument = this.parseAssignment(); args.push({ type: 'SpreadElement', argument, loc: this.loc(dots, this.tokens[this.t - 1]) }); }
      else args.push(this.parseAssignment());
      if (!this.eat(',')) break;
    }
    this.expect(')');
    return args;
  }

  parsePrimary() {
    const t = this.cur;
    switch (t.type) {
      case 'num': this.next(); return { type: 'Literal', kind: t.bigint ? 'bigint' : 'number', value: t.value, raw: t.raw, loc: this.loc(t) };
      case 'str': this.next(); return { type: 'Literal', kind: 'string', value: t.value, raw: t.raw, loc: this.loc(t) };
      case 'regex': this.next(); return { type: 'Literal', kind: 'regex', value: { body: t.value.body, flags: t.value.flags }, raw: t.raw, loc: this.loc(t) };
      case 'template': case 'template_head': return this.parseTemplateLiteral();
      case 'private': {
        this.next();
        // `#p in obj` is the one place a private name stands on its own; anywhere else it is an error
        // and not a value — a stray `#p` used to become an expression statement and print back out.
        if (!this.atKeyword('in')) this.error('a private name can only follow a `.` or stand directly before `in`', t);
        return { type: 'PrivateName', id: { type: 'Identifier', name: t.value, loc: this.loc(t) }, loc: this.loc(t) };
      }
      case 'name':
        if (t.value === 'async' && this.peek().type === 'keyword' && this.peek().value === 'function' && !this.peek().newlineBefore) {
          this.next(); const fn = this.parseFunction(false); fn.async = true; return fn;
        }
        return this.parseIdentifier();
      case 'keyword': {
        if (t.value === 'this') { this.next(); return { type: 'Identifier', name: 'this', loc: this.loc(t) }; }
        if (t.value === 'super') { this.next(); return { type: 'Identifier', name: 'super', loc: this.loc(t) }; }
        if (t.value === 'true' || t.value === 'false') { this.next(); return { type: 'Literal', kind: 'boolean', value: t.value === 'true', raw: t.value, loc: this.loc(t) }; }
        if (t.value === 'null') { this.next(); return { type: 'Literal', kind: 'null', value: null, raw: 'null', loc: this.loc(t) }; }
        if (t.value === 'function') return this.parseFunction(false);
        if (t.value === 'class') return this.parseClass(false);
        if (t.value === 'import' && this.at('.', undefined) === false && this.peek().value === '.') { this.next(); this.next(); const prop = this.parseIdentifierName(); return { type: 'MetaProperty', meta: 'import', property: prop.name, loc: this.loc(t, prop) }; }
        break;
      }
      default: break;
    }
    if (t.value === '(') {
      const open = this.next();
      const expression = this.parseExpression();
      const close = this.expect(')');
      void open;
      return { type: 'ParenExpression', expression, loc: this.loc(t, close) };
    }
    if (t.value === '[') return this.parseArrayLiteral();
    if (t.value === '{') return this.parseObjectLiteral();
    if (t.value === 'function') return this.parseFunction(false);
    if (t.value === 'class') return this.parseClass(false);
    this.error(`unexpected ${JSON.stringify(t.value)}`);
  }

  parseTemplateLiteral() {
    const start = this.cur;
    const quasis = [], expressions = [];
    if (this.cur.type === 'template') {
      const t = this.next();
      quasis.push({ type: 'TemplateElement', value: t.value, raw: t.raw.slice(1, -1), tail: true, loc: this.loc(t) });
      return { type: 'TemplateLiteral', quasis, expressions, loc: this.loc(t) };
    }
    let head = this.next();
    quasis.push({ type: 'TemplateElement', value: head.value, raw: head.raw.slice(1, -2), tail: false, loc: this.loc(head) });
    for (;;) {
      expressions.push(this.parseExpression());
      const chunk = this.cur;
      if (chunk.type !== 'template_middle' && chunk.type !== 'template_tail') this.error('expected a template continuation', chunk);
      this.next();
      if (chunk.type === 'template_tail') { quasis.push({ type: 'TemplateElement', value: chunk.value, raw: chunk.raw.slice(1, -1), tail: true, loc: this.loc(chunk) }); break; }
      quasis.push({ type: 'TemplateElement', value: chunk.value, raw: chunk.raw.slice(1, -2), tail: false, loc: this.loc(chunk) });
    }
    return { type: 'TemplateLiteral', quasis, expressions, loc: this.loc(start, this.tokens[this.t - 1]) };
  }

  parseArrayLiteral() {
    const open = this.expect('[');
    const elements = [];
    while (!this.at(']')) {
      if (this.at(',')) { this.next(); elements.push(null); continue; }
      if (this.at('...')) { const dots = this.next(); const argument = this.parseAssignment(); elements.push({ type: 'SpreadElement', argument, loc: this.loc(dots, this.tokens[this.t - 1]) }); }
      else elements.push(this.parseAssignment());
      if (!this.eat(',')) break;
    }
    const close = this.expect(']');
    return { type: 'ArrayExpression', elements, loc: this.loc(open, close) };
  }

  parseObjectLiteral() {
    const open = this.expect('{');
    const properties = [];
    while (!this.at('}')) {
      properties.push(this.parseProperty());
      if (!this.eat(',')) break;
    }
    const close = this.expect('}');
    return { type: 'ObjectExpression', properties, loc: this.loc(open, close) };
  }

  parseProperty() {
    const start = this.cur;
    if (this.at('...')) { const dots = this.next(); const argument = this.parseAssignment(); return { type: 'SpreadElement', argument, loc: this.loc(dots, this.tokens[this.t - 1]) }; }
    let async = false, generator = false, kind = 'init';
    if (this.atName('async') && !this.peek().newlineBefore && ![':', ',', '}', '('].some((p) => this.peekPunct(p))) { async = true; this.next(); }
    if (this.at('*')) { generator = true; this.next(); }
    if ((this.atName('get') || this.atName('set')) && ![':', ',', '}', '(', '='].some((p) => this.peekPunct(p))) {
      kind = this.atName('get') ? 'get' : 'set'; this.next();
    }
    let computed = false, key;
    if (this.at('[')) { this.next(); computed = true; key = this.parseAssignment(); this.expect(']'); }
    else key = this.parsePropertyKey();
    if (this.at('(')) {
      const value = this.parseMethodFunction(async, generator);
      return { type: 'Property', key, value, kind, computed, shorthand: false, method: true, loc: this.loc(start, this.tokens[this.t - 1]) };
    }
    if (this.at(':')) {
      this.next();
      const value = this.parseAssignment();
      return { type: 'Property', key, value, kind, computed, shorthand: false, method: false, loc: this.loc(start, this.tokens[this.t - 1]) };
    }
    if (this.eat('=')) {
      const right = this.parseAssignment();
      const value = { type: 'AssignmentPattern', left: key, right, loc: this.loc(key, this.tokens[this.t - 1]) };
      return { type: 'Property', key, value, kind: 'init', computed, shorthand: true, method: false, loc: this.loc(start, this.tokens[this.t - 1]) };
    }
    if (kind === 'get' || kind === 'set') this.error(`${kind} needs a method body`, this.cur);
    return { type: 'Property', key, value: cloneIdentifier(key), kind: 'init', computed, shorthand: true, method: false, loc: this.loc(start, this.tokens[this.t - 1]) };
  }

  parsePropertyKey() {
    const t = this.cur;
    if (t.type === 'str' || t.type === 'num') { this.next(); return { type: 'Literal', kind: t.type === 'str' ? 'string' : 'number', value: t.value, raw: t.raw, loc: this.loc(t) }; }
    if (t.type === 'private') { this.next(); return { type: 'PrivateName', id: { type: 'Identifier', name: t.value, loc: this.loc(t) }, loc: this.loc(t) }; }
    if (t.type === 'name' || t.type === 'keyword') return this.parseIdentifierName();
    this.error('expected a property name', t);
  }

  parseMethodFunction(async, generator) {
    const start = this.tokens[this.t - 1];
    const { params, body } = this.parseParamsAndBody();
    return { type: 'FunctionExpression', id: null, params, body, async, generator, loc: this.loc(start, this.tokens[this.t - 1]) };
  }

  parseParamsAndBody() {
    this.expect('(');
    const params = [];
    let sawRest = false;
    while (!this.at(')')) {
      if (this.at('...')) { const dots = this.next(); const argument = this.parseBindingTarget(); params.push({ type: 'RestElement', argument, loc: this.loc(dots, this.tokens[this.t - 1]) }); sawRest = true; }
      else params.push(this.parseBindingTarget());
      if (!this.eat(',')) break;
      if (sawRest) this.error('a rest parameter must be last', this.cur);
    }
    this.expect(')');
    return { params, body: this.at('{') ? this.parseBlock() : null };
  }

  parseFunction(isDeclaration) {
    const kw = this.expect('function');
    const generator = this.eat('*');
    let id = null;
    if (this.cur.type === 'name') id = this.parseIdentifier();
    const { params, body } = this.parseParamsAndBody();
    if (!body) this.error('a function declaration needs a body', this.cur);
    return { type: isDeclaration ? 'FunctionDeclaration' : 'FunctionExpression', id, params, body, async: false, generator, loc: this.loc(kw, this.tokens[this.t - 1]) };
  }

  parseClass(isDeclaration) {
    const kw = this.expect('class');
    let id = null;
    if (this.cur.type === 'name' && !this.at('extends')) id = this.parseIdentifier();
    let superClass = null;
    if (this.eat('extends')) superClass = this.parseCallMember();
    const open = this.expect('{');
    const body = [];
    while (!this.at('}') && this.cur.type !== 'eof') body.push(this.parseClassMember());
    const close = this.expect('}');
    return { type: isDeclaration ? 'ClassDeclaration' : 'ClassExpression', id, superClass, body: { type: 'ClassBody', body, loc: this.loc(open, close) }, loc: this.loc(kw, close) };
  }

  parseClassMember() {
    const start = this.cur;
    if (this.eat(';')) return { type: 'EmptyStatement', loc: this.loc(start) };
    let isStatic = false, async = false, generator = false, kind = 'method';
    if (this.atName('static') && !['(', '=', ';', '}'].some((p) => this.peekPunct(p))) { isStatic = true; this.next(); }
    if (this.at('{') && isStatic) { const open = this.next(); const body = []; while (!this.at('}') && this.cur.type !== 'eof') body.push(this.parseStatement()); const close = this.expect('}'); return { type: 'StaticBlock', body, loc: this.loc(start, close) }; }
    if (this.atName('async') && !this.peek().newlineBefore && !['(', '=', ';', '}'].some((p) => this.peekPunct(p))) { async = true; this.next(); }
    if (this.at('*')) { generator = true; this.next(); }
    if ((this.atName('get') || this.atName('set')) && !['(', '=', ';', '}'].some((p) => this.peekPunct(p))) { kind = this.atName('get') ? 'get' : 'set'; this.next(); }
    let computed = false, key;
    if (this.at('[')) { this.next(); computed = true; key = this.parseAssignment(); this.expect(']'); }
    else key = this.parsePropertyKey();
    if (this.at('(')) {
      const value = this.parseMethodFunction(async, generator);
      value.loc = this.loc(start, this.tokens[this.t - 1]);
      return { type: 'MethodDefinition', key, value, kind, computed, static: isStatic, loc: value.loc };
    }
    // A class field: `x = init;` — and `static x;` too. A field may not be a getter/setter.
    if (kind !== 'method') this.error(`${kind} needs a method body`, this.cur);
    let value = null;
    if (this.eat('=')) value = this.parseAssignment();
    this.semicolon();
    return { type: 'PropertyDefinition', key, value, computed, static: isStatic, loc: this.loc(start, this.tokens[this.t - 1]) };
  }

  /** `allowDefault` is true where `=` starts a default of the binding itself (a parameter) and false
   * where the caller owns the `=` (a declarator's initialiser, a catch parameter, a rest element) —
   * consuming it here in those places would turn `const x = 1` into a pattern with no initialiser. */
  parseBindingTarget(allowDefault = true) {
    const t = this.cur;
    if (t.value === '...') { const dots = this.next(); const argument = this.parseBindingTarget(false); return { type: 'RestElement', argument, loc: this.loc(dots) }; }
    const target = t.value === '[' ? this.toPattern(this.parseArrayLiteral(), true, true)
      : t.value === '{' ? this.toPattern(this.parseObjectLiteral(), true, true)
        : this.parseIdentifier();
    if (allowDefault && this.at('=')) { this.next(); const right = this.parseAssignment(); return { type: 'AssignmentPattern', left: target, right, loc: this.loc(t, this.tokens[this.t - 1]) }; }
    return target;
  }

  parseIdentifier() {
    const t = this.cur;
    if (t.type !== 'name' && !(t.type === 'keyword' && ['await', 'yield', 'let', 'async', 'of', 'get', 'set', 'static', 'as', 'from', 'target'].includes(t.value))) {
      this.error(`expected an identifier but found ${JSON.stringify(t.value)}`, t);
    }
    this.next();
    return { type: 'Identifier', name: t.value, loc: this.loc(t) };
  }

  /** A member name: an identifier, a keyword, or a private name (`this.#x`). */
  parseMemberName() {
    if (this.cur.type === 'private') { const t = this.next(); return { type: 'PrivateName', id: { type: 'Identifier', name: t.value, loc: this.loc(t) }, loc: this.loc(t) }; }
    return this.parseIdentifierName();
  }

  parseIdentifierName() {
    const t = this.cur;
    if (t.type !== 'name' && t.type !== 'keyword') this.error(`expected a name but found ${JSON.stringify(t.value)}`, t);
    this.next();
    return { type: 'Identifier', name: t.value, loc: this.loc(t) };
  }

  /** Expression → pattern, per the spec's cover grammar. `allowAssign` is false where `=` would be a
   * different production (a `for` head, a parameter default already handled by the caller). */
  toPattern(node, allowAssign, bindingOnly = false) {
    if (!node) return node;
    switch (node.type) {
      case 'Identifier':
        if (node.name === 'this') this.error('this is not a valid assignment target');
        return node;
      case 'MemberExpression': if (bindingOnly) this.error('a member expression is not a binding pattern'); return node;
      case 'ParenExpression': return this.toPattern(node.expression, allowAssign, bindingOnly);
      case 'ArrayExpression': case 'ArrayPattern': {
        node.type = 'ArrayPattern';
        node.elements = node.elements.map((el) => (el ? this.toPattern(el, allowAssign, bindingOnly) : null));
        return node;
      }
      case 'ObjectExpression': case 'ObjectPattern': {
        node.type = 'ObjectPattern';
        for (const prop of node.properties) {
          if (prop.type === 'SpreadElement') { prop.type = 'RestElement'; prop.argument = this.toPattern(prop.argument, true, true); continue; }
          if (prop.value && prop.value.type === 'AssignmentExpression' && prop.value.operator === '=') {
            prop.value = { type: 'AssignmentPattern', left: prop.value.left, right: prop.value.right, loc: prop.value.loc };
          }
          if (prop.value && prop.value.type === 'AssignmentPattern') { prop.value.left = this.toPattern(prop.value.left, true, bindingOnly); continue; }
          prop.value = this.toPattern(prop.value, true, bindingOnly);
        }
        return node;
      }
      case 'AssignmentExpression': case 'AssignmentPattern':
        if (!allowAssign) this.error('an assignment is not allowed here');
        if (node.type === 'AssignmentExpression') {
          node.type = 'AssignmentPattern'; delete node.operator;
          node.left = this.toPattern(node.left, true, bindingOnly);
        }
        return node;
      case 'RestElement': node.argument = this.toPattern(node.argument, false, bindingOnly); return node;
      case 'SpreadElement': node.type = 'RestElement'; node.argument = this.toPattern(node.argument, false, bindingOnly); return node;
      default: this.error(`invalid assignment target (${node.type})`);
    }
  }
}

const cloneIdentifier = (id) => ({ type: 'Identifier', name: id.name, loc: id.loc });

/** Property keys end the interesting part of an operator chain; `??` mixing is checked with this. */
function hasLogical(node) {
  if (!node || typeof node.type !== 'string') return false;
  if (node.type === 'ParenExpression') return false;
  if (node.type === 'LogicalExpression' && (node.operator === '&&' || node.operator === '||')) return true;
  if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') return hasLogical(node.left) || hasLogical(node.right);
  return false;
}

/** Can a `var`/`let`/`const` keyword here start a declaration rather than an identifier? */
function isBindingStart(token) {
  if (!token) return false;
  if (token.type === 'name') return true;
  return token.value === '{' || token.value === '[';
}

/** Parse `source` into a `Program`. Throws `SyntaxError` (with line/column/offset) on bad input. */
function parse(source, options = {}) {
  try {
    return new Parser(source, options).parseProgram();
  } catch (e) {
    // A recursive-descent parser's depth limit is V8's stack, not a number in this file. It is refused
    // in those words rather than escaping as a RangeError, so a caller can tell "this input is too deep
    // for the tool" from "this tool has a bug".
    if (e instanceof RangeError) {
      const err = new SyntaxError('input nests too deeply for this parser: ' + e.message);
      err.code = 'DEPTH_LIMIT';
      err.cause = e;
      throw err;
    }
    throw e;
  }
}

module.exports = { parse, Parser, ASSIGN_OPS, BINARY_PRECEDENCE, UNARY, ASSIGNMENT_TARGETS, SINGLE_STATEMENT_BODY };
