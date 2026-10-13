'use strict';
/**
 * emit.js — the printer and the source map writer, in one place on purpose.
 *
 * A source map is only as honest as the thing that writes the characters, so this file is the only
 * producer of output text: every character reaches the output through `write(text, node)`, and when
 * a node came from the source, the mapping for it is recorded at that exact generated position.
 * There is no second pass that "adds" mappings afterwards and no mapping can claim a position this
 * file did not write.
 *
 * Parentheses are re-derived from a precedence table (`precedenceOf`) rather than remembered, so
 * `a-(b-c)` keeps its pair and `(a)+b` loses one; the parenthesised nodes the parser kept are
 * transparent and are emitted through the same rule. Three quirks the rules exist for:
 *
 *   * adjacency: `a + +b`, `- -a`, `1 .toString()`, `a in b` and `typeof x` need a space or a pair;
 *   * automatic semicolons: `}` followed by `(`/`[`/`+`/`-`/`/`/`` ` ``/`.` would continue the
 *     previous statement, so a `;` is written even though the next statement looks independent;
 *   * bare bodies: a lexical declaration is not a legal bare body, and an `if` with no `else`
 *     inside an `if` that has one would steal the `else` — both keep their braces.
 */
const sourcemap = require('./sourcemap');
const { KEYS, children } = require('./ast');

const BINARY_ORDER = { '??': 4, '||': 5, '&&': 6, '|': 7, '^': 8, '&': 9, '==': 10, '!=': 10, '===': 10, '!==': 10, '<': 11, '>': 11, '<=': 11, '>=': 11, instanceof: 11, in: 11, '<<': 12, '>>': 12, '>>>': 12, '+': 13, '-': 13, '*': 14, '/': 14, '%': 14, '**': 15 };
const RIGHT_ASSOC = new Set(['**']);
/** `??` may not sit directly beside `&&` or `||` — the grammar forbids the mixture without
 * parentheses, so the printer adds them rather than printing a program V8 will refuse. */
const mixingNullish = (operator, child, depth = 0) => {
  if (!child || depth > 8) return false;
  if (child.type === 'ParenExpression') return mixingNullish(operator, child.expression, depth + 1);
  return (child.type === 'BinaryExpression' || child.type === 'LogicalExpression')
    && ((operator === '??' && (child.operator === '&&' || child.operator === '||'))
      || ((operator === '&&' || operator === '||') && child.operator === '??'));
};
const MEMBER_PREC = 18, CALL_PREC = 17, UNARY_PREC = 15, PRIMARY_PREC = 20;
const HAZARD_START = new Set(['(', '[', '+', '-', '/', '`', '.', '*', ',', '%', '&', '|', '^', '<', '>', '=', '!', '~', '?', ':']);

/** Precedence of an expression node, computed from the tree rather than remembered while printing. */
function precedenceOf(node) {
  switch (node.type) {
    case 'SequenceExpression': return 1;
    case 'AssignmentExpression': case 'ArrowFunctionExpression': case 'YieldExpression': return 2;
    case 'ConditionalExpression': return 3;
    case 'LogicalExpression': case 'BinaryExpression': return BINARY_ORDER[node.operator] ?? 4;
    case 'UnaryExpression': case 'AwaitExpression': return UNARY_PREC;
    case 'UpdateExpression': return node.prefix ? 16 : CALL_PREC;
    case 'NewExpression': return node.arguments && node.arguments.length ? MEMBER_PREC : CALL_PREC;
    case 'CallExpression': return CALL_PREC;
    case 'MemberExpression': case 'TaggedTemplateExpression': return MEMBER_PREC;
    case 'ParenExpression': return precedenceOf(node.expression);
    default: return PRIMARY_PREC;
  }
}

/** The leftmost character the printer will produce for a node — the semicolon-hazard input. */
function firstCharOf(node) {
  if (!node) return '';
  switch (node.type) {
    case 'Identifier': return (node.__renamed || node.name)[0];
    case 'Literal': return node.kind === 'number' ? String(node.value)[0] : node.kind === 'string' ? node.raw[0] : node.raw[0];
    case 'TemplateLiteral': return '`';
    case 'ArrayExpression': case 'ArrayPattern': return '[';
    case 'ObjectExpression': case 'ObjectPattern': return '{';
    case 'ParenExpression': return firstCharOf(node.expression);
    case 'UnaryExpression': case 'UpdateExpression': return node.operator[0];
    case 'AwaitExpression': return 'a';
    case 'YieldExpression': return 'y';
    case 'MemberExpression': return firstCharOf(node.object);
    case 'CallExpression': return firstCharOf(node.callee);
    case 'NewExpression': return 'n';
    case 'TaggedTemplateExpression': return firstCharOf(node.tag);
    case 'FunctionExpression': return 'f';
    case 'ClassExpression': return 'c';
    case 'AssignmentExpression': return firstCharOf(node.left);
    case 'BinaryExpression': case 'LogicalExpression': return firstCharOf(node.left);
    case 'ConditionalExpression': return firstCharOf(node.test);
    case 'SequenceExpression': return firstCharOf(node.expressions[0]);
    default: break;
  }
  if (KEYS[node.type]) { const kids = children(node); return kids.length ? firstCharOf(kids[0].node) : ''; }
  return '';
}

class Emitter {
  constructor(options = {}) {
    this.source = options.source || '';
    this.file = options.file || 'input.js';
    this.sourceMapFile = options.sourceMapFile || null;
    this.includeContent = options.includeContent !== false;
    this.shorten = !!options.shorten;
    this.code = '';
    this.line = 0; this.column = 0;
    this.mappings = [[]];
    // Counted, not hidden: a node whose position is unknown is not mapped, and the number of those is
    // reported so a caller can tell "this file is fully mapped" from "this file is mostly mapped".
    this.unmapped = 0;
    this.names = []; this.nameIndex = new Map();
    this.warnings = [];
    this.lastStatement = null;
  }

  write(text, node) {
    if (text === '' || text === undefined) return;
    if (node && node.loc) this.record(node.loc);
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      this.code += ch;
      if (ch === '\n') { this.line++; this.column = 0; this.mappings.push([]); }
      else this.column++;
    }
  }

  record(loc) {
    if (!this.sourceMapFile) return;
    if (!loc || typeof loc.line !== 'number' || typeof loc.column !== 'number') { this.unmapped++; return; }
    const line = this.mappings[this.line];
    const last = line[line.length - 1];
    if (last && last[0] > this.column) return;
    if (last && last[0] === this.column) { last[2] = loc.line - 1; last[3] = loc.column; return; }
    line.push([this.column, 0, loc.line - 1, loc.column]);
  }

  recordName(loc, name) {
    if (!this.sourceMapFile) return;
    if (!loc || typeof loc.line !== 'number' || typeof loc.column !== 'number') { this.unmapped++; return; }
    let index = this.nameIndex.get(name);
    if (index === undefined) { index = this.names.length; this.names.push(name); this.nameIndex.set(name, index); }
    const line = this.mappings[this.line];
    const last = line[line.length - 1];
    if (last && last[0] > this.column) return;
    if (last && last[0] === this.column) { last[2] = loc.line - 1; last[3] = loc.column; last[4] = index; return; }
    line.push([this.column, 0, loc.line - 1, loc.column, index]);
  }

  get lastChar() { return this.code[this.code.length - 1] || ''; }

  /** Emit an expression, parenthesising it when its own precedence is below the context's. */
  emit(node, minPrec = 1) {
    if (!node) return;
    if (precedenceOf(node) < minPrec) { this.write('('); this.emitRaw(node); this.write(')'); return; }
    this.emitRaw(node);
  }

  /** Emit without a precedence check — the entry point for a node already known to be safe. */
  emitRaw(node) {
    switch (node.type) {
      case 'Identifier': return this.identifier(node);
      case 'PrivateName': this.write('#', node); return this.write(node.id.name, node.id);
      case 'Literal': return this.literal(node);
      case 'ParenExpression': {
        const inner = unparen(node.expression);
        if (inner.type === 'ObjectExpression' || inner.type === 'FunctionExpression' || inner.type === 'ClassExpression') { this.write('('); this.emitRaw(inner); this.write(')'); return; }
        return this.emit(node.expression, 1);
      }
      case 'MetaProperty': return this.write(node.meta + '.' + node.property, node);
      case 'TemplateLiteral': return this.templateLiteral(node);
      case 'TaggedTemplateExpression': this.emit(node.tag, MEMBER_PREC); return this.templateLiteral(node.quasi);
      case 'ArrayExpression': return this.array(node);
      case 'ObjectExpression': return this.object(node);
      case 'FunctionExpression': case 'ArrowFunctionExpression': case 'ClassExpression': return this.functionOrClass(node);
      case 'CallExpression': return this.call(node);
      case 'NewExpression': return this.newExpression(node);
      case 'MemberExpression': return this.member(node);
      case 'UnaryExpression': return this.unary(node);
      case 'UpdateExpression': return this.update(node);
      case 'AwaitExpression': this.write('await ', node); return this.emit(node.argument, UNARY_PREC);
      case 'YieldExpression': {
        this.write(node.delegate ? 'yield* ' : 'yield ', node);
        if (node.argument) this.emit(node.argument, 2);
        return;
      }
      case 'BinaryExpression': case 'LogicalExpression': return this.binary(node);
      case 'AssignmentExpression': return this.assignment(node);
      case 'ConditionalExpression': {
        this.emit(node.test, BINARY_ORDER['||']);
        this.write('?', node);
        this.emit(node.consequent, 2);
        this.write(':');
        this.emit(node.alternate, 2);
        return;
      }
      case 'SequenceExpression': {
        node.expressions.forEach((e, i) => { if (i) this.write(','); this.emit(e, 2); });
        return;
      }
      default: throw new Error('emit: unhandled expression node ' + node.type);
    }
  }

  identifier(node) {
    if (node.__renamed === false) { /* kept name, still mapped */ }
    if (this.sourceMapFile && node.loc) this.recordName(node.loc, node.name);
    this.write(node.__renamed || node.name);
  }

  literal(node) {
    if (node.kind === 'string') return this.write(printString(node, this.shorten), node);
    if (node.kind === 'number') return this.write(printNumber(node, this.shorten), node);
    if (node.kind === 'boolean') return this.write(node.value ? 'true' : 'false', node);
    return this.write(node.raw || String(node.value), node);
  }

  templateLiteral(node) {
    this.write('`', node);
    node.quasis.forEach((q, i) => {
      this.write(q.raw === undefined ? escapeTemplateChunk(String(q.value)) : q.raw);
      if (i < node.expressions.length) { this.write('${'); this.emit(node.expressions[i], 1); this.write('}'); }
    });
    this.write('`');
  }

  array(node) {
    this.write('[', node);
    node.elements.forEach((el, i) => {
      if (i) this.write(',');
      if (!el) { if (i === node.elements.length - 1) this.write(','); return; }
      if (el.type === 'SpreadElement') { this.write('...'); this.emit(el.argument, 2); return; }
      this.emit(el, 2);
    });
    this.write(']');
  }

  object(node) {
    this.write('{', node);
    node.properties.forEach((prop, i) => { if (i) this.write(','); this.property(prop); });
    this.write('}');
  }

  property(prop) {
    if (prop.type === 'SpreadElement') { this.write('...'); this.emit(prop.argument, 2); return; }
    if (prop.method) {
      if (prop.kind === 'get' || prop.kind === 'set') this.write(prop.kind + ' ');
      if (prop.value.async) this.write('async ');
      if (prop.value.generator) this.write('*');
      this.propertyKey(prop);
      return this.functionTail(prop.value);
    }
    if (prop.kind === 'get' || prop.kind === 'set') { this.write(prop.kind + ' '); this.propertyKey(prop); return this.functionTail(prop.value, true); }
    if (prop.shorthand && prop.value.type === 'Identifier' && !prop.value.__renamed && prop.value.name === keyName(prop.key)) return this.write(keyName(prop.key), prop.key);
    if (prop.shorthand && prop.value.type === 'AssignmentPattern' && !prop.value.left.__renamed && prop.value.left.name === keyName(prop.key)) {
      this.write(keyName(prop.key), prop.key); this.write('='); return this.emit(prop.value.right, 2);
    }
    this.propertyKey(prop);
    this.write(':');
    this.emit(prop.value, 2);
  }

  propertyKey(prop) {
    const key = prop.key;
    if (prop.computed) { this.write('['); this.emit(key, 1); this.write(']'); return; }
    if (key.type === 'PrivateName') { this.write('#'); this.write(key.id.name, key.id); return; }
    if (key.type === 'Literal') return this.literal(key);
    this.write(key.name, key);
  }

  member(node) {
    this.emit(node.object, MEMBER_PREC);
    if (node.computed) { this.write(node.optional ? '?.[' : '['); this.emit(node.property, 1); this.write(']'); return; }
    this.write(node.optional ? '?.' : '.');
    if (node.property.type === 'PrivateName') { this.write('#'); this.write(node.property.id.name, node.property.id); return; }
    this.write(node.property.name, node.property);
  }

  call(node) {
    this.emit(node.callee, CALL_PREC);
    if (node.optional) this.write('?.');
    this.arguments(node.arguments);
  }

  newExpression(node) {
    this.write('new ', node);
    this.emit(node.callee, MEMBER_PREC);
    this.arguments(node.arguments);
  }

  arguments(args) {
    this.write('(');
    args.forEach((a, i) => {
      if (i) this.write(',');
      if (a.type === 'SpreadElement') { this.write('...'); this.emit(a.argument, 2); return; }
      this.emit(a, 2);
    });
    this.write(')');
  }

  unary(node) {
    const op = node.operator;
    const word = op === 'typeof' || op === 'void' || op === 'delete';
    this.write(word ? op + ' ' : op, node);
    const argument = node.argument;
    const same = (op === '+' || op === '-') && firstCharOf(argument) === op;
    if (same) { this.write('('); this.emitRaw(argument); this.write(')'); return; }
    if (word) { this.emit(argument, UNARY_PREC); return; }
    if (precedenceOf(argument) < UNARY_PREC) { this.write('('); this.emitRaw(argument); this.write(')'); return; }
    this.emitRaw(argument);
  }

  update(node) {
    if (node.prefix) { this.write(node.operator, node); return this.emit(node.argument, UNARY_PREC); }
    this.emit(node.argument, CALL_PREC);
    this.write(node.operator, node);
  }

  binary(node) {
    const prec = BINARY_ORDER[node.operator] ?? 4;
    const leftMin = RIGHT_ASSOC.has(node.operator) ? prec + 1 : prec;
    const rightMin = RIGHT_ASSOC.has(node.operator) ? prec : prec + 1;
    this.emit(node.left, mixingNullish(node.operator, node.left) ? prec + 20 : leftMin);
    const word = node.operator === 'in' || node.operator === 'instanceof';
    this.write(word ? ' ' + node.operator + ' ' : node.operator, node);
    // `a + +b`, `a - -b` and `a / /re/`: when the right operand starts with the same character the
    // operator ends with, the two characters run together — and `//` starts a comment, so the division
    // case is not cosmetic. The parenthesis keeps them apart without changing the arithmetic.
    if (!word && node.operator.length === 1 && '/+-'.includes(node.operator) && firstCharOf(node.right) === node.operator) {
      this.write('('); this.emitRaw(node.right); this.write(')'); return;
    }
    this.emit(node.right, mixingNullish(node.operator, node.right) ? prec + 20 : rightMin);
  }

  assignment(node) {
    this.target(node.left);
    this.write(node.operator, node);
    this.emit(node.right, 2);
  }

  /** The left-hand side of an assignment, which may be an expression or a destructuring pattern. */
  target(node) {
    switch (node.type) {
      case 'ArrayPattern': case 'ObjectPattern': case 'AssignmentPattern': case 'RestElement': return this.pattern(node);
      default: return this.emit(node, 2);
    }
  }

  pattern(node) {
    switch (node.type) {
      case 'Identifier': return this.identifier(node);
      case 'ParenExpression': return this.pattern(node.expression);
      case 'ArrayPattern': {
        this.write('[', node);
        node.elements.forEach((el, i) => { if (i) this.write(','); if (el) this.pattern(el); });
        this.write(']'); return;
      }
      case 'ObjectPattern': {
        this.write('{', node);
        node.properties.forEach((prop, i) => {
          if (i) this.write(',');
          if (prop.type === 'RestElement') { this.write('...'); return this.pattern(prop.argument); }
          if (prop.value.type === 'Identifier' && !prop.value.__renamed && prop.value.name === keyName(prop.key)) return this.write(keyName(prop.key), prop.key);
          if (prop.value.type === 'AssignmentPattern' && !prop.value.left.__renamed && prop.value.left.name === keyName(prop.key)) {
            this.write(keyName(prop.key), prop.key); this.write('='); return this.emit(prop.value.right, 2);
          }
          this.propertyKey(prop); this.write(':'); this.pattern(prop.value);
        });
        this.write('}'); return;
      }
      case 'AssignmentPattern': this.pattern(node.left); this.write('='); return this.emit(node.right, 2);
      case 'RestElement': this.write('...'); return this.pattern(node.argument);
      case 'MemberExpression': return this.member(node);
      default: throw new Error('emit: unhandled pattern node ' + node.type);
    }
  }

  params(params) {
    this.write('(');
    params.forEach((p, i) => { if (i) this.write(','); this.pattern(p); });
    this.write(')');
  }

  functionTail(node) {
    this.params(node.params);
    this.write('{');
    this.statements(node.body.body);
    this.write('}');
  }

  functionOrClass(node) {
    if (node.type === 'ArrowFunctionExpression') {
      if (node.async) this.write('async ', node);
      if (node.params.length === 1 && node.params[0].type === 'Identifier') this.identifier(node.params[0]);
      else this.params(node.params);
      this.write('=>');
      if (node.body.type === 'BlockStatement') {
        this.write('{');
        this.statements(node.body.body);
        this.write('}');
      } else {
        // `() => ({a:1})` is not `() => {a:1}`: an object literal or a comma expression needs its
        // own pair of parentheses, and the parentheses the source had are transparent here.
        const inner = unparen(node.body);
        if (inner.type === 'ObjectExpression' || inner.type === 'SequenceExpression' || firstCharOf(inner) === '{') { this.write('('); this.emitRaw(node.body); this.write(')'); }
        else this.emit(node.body, 2);
      }
      return;
    }
    if (node.type === 'FunctionExpression') {
      // An async function EXPRESSION needs its `async` as much as an async function declaration does:
      // leaving it out turned `const load = async function () { await x }` into a SyntaxError that V8
      // caught before any test did.
      this.write(node.async ? 'async function' : 'function', node);
      if (node.generator) this.write('*');
      if (node.id) { this.write(' '); this.identifier(node.id); }
      return this.functionTail(node);
    }
    this.write('class', node);
    if (node.id) { this.write(' '); this.identifier(node.id); }
    if (node.superClass) { this.write(' extends '); this.emit(node.superClass, CALL_PREC); }
    this.write('{');
    for (const member of node.body.body) { this.classMember(member); if (member.type === 'PropertyDefinition') this.write(';'); }
    this.write('}');
  }

  classMember(member) {
    if (member.type === 'EmptyStatement') return;
    if (member.type === 'StaticBlock') { this.write('static{'); this.statements(member.body); this.write('}'); return; }
    if (member.type === 'PropertyDefinition') {
      if (member.static) this.write('static ');
      this.propertyKey(member);
      if (member.value) { this.write('='); this.emit(member.value, 2); }
      return;
    }
    if (member.static) this.write('static ');
    if (member.kind === 'get' || member.kind === 'set') this.write(member.kind + ' ');
    else { if (member.value.async) this.write('async '); if (member.value.generator) this.write('*'); }
    this.propertyKey(member);
    this.functionTail(member.value);
  }

  /** A prologue is a statement like any other here: `statement()` writes a directive's own `raw`, so
   * no path — program, function body, block — can lose `"use strict"` on the way through. */
  statements(body) {
    const list = body.filter((s) => s && s.type !== 'EmptyStatement');
    let previous = null;
    for (const stmt of list) {
      if (previous) this.separator(previous, stmt);
      this.statement(stmt);
      previous = stmt;
    }
    this.lastStatement = previous;
  }

  /** Between two statements a `;` is written unless the previous statement both ends in a brace and
   * is a statement the grammar terminates by itself — a block, an `if` with a braced body, a
   * function/class declaration. Everything else (an assignment, a call, a `return`, a flattened
   * body, `do … while`) needs its own terminator, because without it the next statement's first
   * character decides what the previous one means. */
  separator(previous, next) {
    if (this.lastChar === ';') return;
    if (this.lastChar === '}' && GRAMMAR_TERMINATED.has(previous.type)) return;
    if (!next) return;
    this.write(';');
  }

  statement(node) {
    switch (node.type) {
      case 'ExpressionStatement': {
        if (node.directive) { this.write(node.expression.raw, node); return; }
        const e = node.expression;
        if (e.type === 'ObjectExpression' || e.type === 'FunctionExpression' || e.type === 'ClassExpression' || firstCharOf(e) === '{') {
          this.write('('); this.emitRaw(e); this.write(')'); return;
        }
        this.emit(e, 1); return;
      }
      case 'BlockStatement': {
        this.write('{', node);
        this.statements(node.body);
        this.write('}'); return;
      }
      case 'EmptyStatement': return;
      case 'VariableDeclaration': {
        this.write(node.kind + ' ', node);
        node.declarations.forEach((d, i) => {
          if (i) this.write(',');
          this.pattern(d.id);
          if (d.init) { this.write('='); this.emit(d.init, 2); }
        });
        return;
      }
      case 'FunctionDeclaration': {
        this.write(node.async ? 'async function' : 'function', node);
        if (node.generator) this.write('*');
        if (node.id) { this.write(' '); this.identifier(node.id); }
        this.functionTail(node); return;
      }
      case 'ClassDeclaration': return this.functionOrClass(node);
      case 'ReturnStatement': this.write('return', node); if (node.argument) { this.write(' '); this.emit(node.argument, 2); } return;
      case 'ThrowStatement': this.write('throw ', node); this.emit(node.argument, 1); return;
      case 'BreakStatement': this.write('break', node); if (node.label) { this.write(' '); this.identifier(node.label); } return;
      case 'ContinueStatement': this.write('continue', node); if (node.label) { this.write(' '); this.identifier(node.label); } return;
      case 'IfStatement': {
        this.write('if(', node); this.emit(node.test, 1); this.write(')');
        this.body(node.consequent, node.alternate ? 'if-else' : null);
        if (node.alternate) {
          this.write('else ');
          this.statement(node.alternate);
        }
        return;
      }
      case 'ForStatement': {
        this.write('for(', node);
        if (node.init) { if (node.init.type === 'VariableDeclaration') this.statement(node.init); else this.emit(node.init, 1); }
        this.write(';');
        if (node.test) this.emit(node.test, 1);
        this.write(';');
        if (node.update) this.emit(node.update, 1);
        this.write(')'); this.body(node.body, null); return;
      }
      case 'ForInStatement': case 'ForOfStatement': {
        this.write(node.type === 'ForOfStatement' ? (node.await ? 'for await(' : 'for(') : 'for(', node);
        if (node.left.type === 'VariableDeclaration') this.statement(node.left); else this.target(node.left);
        this.write(node.type === 'ForOfStatement' ? ' of ' : ' in ');
        this.emit(node.right, node.type === 'ForOfStatement' ? 2 : 1);
        this.write(')'); this.body(node.body, null); return;
      }
      case 'WhileStatement': this.write('while(', node); this.emit(node.test, 1); this.write(')'); this.body(node.body, null); return;
      case 'DoWhileStatement': this.write('do', node); this.body(node.body, 'do-while'); this.write('while('); this.emit(node.test, 1); this.write(')'); return;
      case 'SwitchStatement': {
        this.write('switch(', node); this.emit(node.discriminant, 1); this.write('){');
        for (const c of node.cases) {
          if (this.lastStatement) this.terminateIfNeeded(this.lastStatement);
          else if (this.lastChar && this.lastChar !== '{') this.write(';');
          if (c.test) { this.write('case '); this.emit(c.test, 1); this.write(':'); } else this.write('default:');
          this.statements(c.consequent);
        }
        this.write('}'); return;
      }
      case 'TryStatement': {
        this.write('try', node);
        this.write('{'); this.statements(node.block.body); this.write('}');
        this.lastStatement = null;
        if (node.handler) { this.write('catch'); if (node.handler.param) { this.write('('); this.pattern(node.handler.param); this.write(')'); } this.write('{'); this.statements(node.handler.body.body); this.write('}'); }
        if (node.finalizer) { this.write('finally{'); this.statements(node.finalizer.body); this.write('}'); }
        return;
      }
      case 'LabeledStatement': this.identifier(node.label); this.write(':'); this.statement(node.body); return;
      case 'WithStatement': this.write('with(', node); this.emit(node.object, 1); this.write(')'); this.body(node.body, null); return;
      case 'DebuggerStatement': this.write('debugger', node); return;
      case 'ImportDeclaration': return this.importDeclaration(node);
      case 'ExportNamedDeclaration': {
        if (node.declaration) { this.write('export ', node); this.statement(node.declaration); return; }
        this.write('export{', node);
        node.specifiers.forEach((s, i) => { if (i) this.write(','); this.identifier(s.local); if (s.exported && s.exported.name !== s.local.name) { this.write(' as '); this.identifier(s.exported); } });
        this.write('}');
        if (node.source) { this.write(' from '); this.literal(node.source); }
        return;
      }
      case 'ExportDefaultDeclaration': {
        this.write('export default ', node);
        const d = node.declaration;
        if (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') this.statement(d);
        else this.emit(d, 2);
        return;
      }
      case 'ExportAllDeclaration': {
        this.write('export*', node);
        if (node.exported) this.write(' as ' + node.exported);
        this.write(' from ');
        this.literal(node.source);
        return;
      }
      default: throw new Error('emit: unhandled statement node ' + node.type);
    }
  }

  importDeclaration(node) {
    this.write('import', node);
    if (!node.specifiers.length) { this.write(' '); this.literal(node.source); return; }
    const def = node.specifiers.find((s) => s.type === 'ImportDefaultSpecifier');
    const ns = node.specifiers.find((s) => s.type === 'ImportNamespaceSpecifier');
    const named = node.specifiers.filter((s) => s.type === 'ImportSpecifier');
    let wrote = false;
    if (def) { this.write(' '); this.identifier(def.local); wrote = true; }
    if (ns) { if (wrote) this.write(','); this.write('* as '); this.identifier(ns.local); wrote = true; }
    if (named.length) {
      if (wrote) this.write(',');
      this.write('{');
      named.forEach((s, i) => { if (i) this.write(','); this.identifier(s.imported); if (s.local.name !== s.imported.name) { this.write(' as '); this.identifier(s.local); } });
      this.write('}');
    }
    this.write(' from ');
    this.literal(node.source);
  }

  /** A body position: flatten a single-statement block only when that cannot change the meaning. */
  body(node, parentKind) {
    if (node.type === 'BlockStatement') {
      const body = node.body.filter((s) => s && s.type !== 'EmptyStatement');
      if (body.length === 0) { this.write(';'); return; }
      if (body.length === 1 && flattenable(body[0])) {
        // An `if` inside an `if` that has its own `else` would take the `else` with it, and after a
        // flattened body the `else`/`while` keywords are not legal until the statement is terminated.
        if (parentKind === 'if-else' && body[0].type === 'IfStatement') { this.write('{'); this.statement(body[0]); this.write('}'); return; }
        this.write(' '); this.statement(body[0]);
        this.terminateIfNeeded(body[0]);
        return;
      }
      this.write('{'); this.statements(node.body); this.write('}'); return;
    }
    if (node.type === 'EmptyStatement') { this.write(';'); return; }
    this.write(' '); this.statement(node);
    this.terminateIfNeeded(node);
  }

  /** End the statement just written unless the grammar already ends it: a statement whose text does
   * not end in `}` or `;` would change meaning if the next one continued it. */
  terminateIfNeeded(stmt) {
    if (this.lastChar === ';' || this.lastChar === '{') return;
    if (this.lastChar === '}' && GRAMMAR_TERMINATED.has(stmt.type)) return;
    this.write(';');
  }
}

/**
 * Statements the grammar terminates without a semicolon — but only when they end in a brace. An
 * import/export declaration is deliberately NOT in this set: the printer writes one line, and on one
 * line the module grammar's automatic semicolon insertion does not apply, so `export default
 * function f(){}` is followed by its own `;` rather than by whatever comes next.
 */
const GRAMMAR_TERMINATED = new Set(['BlockStatement', 'IfStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'SwitchStatement', 'TryStatement', 'FunctionDeclaration', 'ClassDeclaration', 'WithStatement']);
/** The node behind a transparent parenthesis wrapper. */
function unparen(node) { return node && node.type === 'ParenExpression' ? unparen(node.expression) : node; }

const isDirective = (stmt) => !!stmt && stmt.type === 'ExpressionStatement' && !!stmt.directive;

/** A single statement is a legal bare body only if it is not a declaration. */
function flattenable(stmt) {
  if (!stmt) return false;
  if (stmt.type === 'FunctionDeclaration' || stmt.type === 'ClassDeclaration' || stmt.type === 'LabeledStatement') return false;
  if (stmt.type === 'VariableDeclaration' && stmt.kind !== 'var') return false;
  return true;
}

function keyName(key) { return key.type === 'Identifier' ? key.name : key.type === 'Literal' ? String(key.value) : null; }

function escapeTemplateChunk(text) {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function printString(node, shorten) {
  const raw = node.raw;
  if (!shorten) return raw || JSON.stringify(node.value);
  const single = "'" + node.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + "'";
  const double = JSON.stringify(node.value);
  const best = single.length <= double.length ? single : double;
  return best.length < raw.length ? best : raw;
}

/** The shortest printed form of a numeric literal that evaluates to the same number. */
function printNumber(node, shorten) {
  const raw = node.raw, value = node.value;
  if (typeof value !== 'number' || !raw) return raw === undefined ? String(value) : raw;
  const candidates = [raw];
  const push = (text) => { if (text && !candidates.includes(text) && Number(text) === value) candidates.push(text); };
  if (shorten) {
    push(String(value));
    if (value > 0 && value < 1) push(String(value).replace(/^0\./, '.'));
    if (Number.isInteger(value) && Math.abs(value) >= 1000) push(value.toExponential().replace(/e\+?/, 'e'));
    if (/^0[xXbBoO]/.test(raw)) push(String(value));
  }
  let best = candidates[0];
  for (const c of candidates) if (c.length < best.length) best = c;
  return best;
}

/** Minify an AST to text plus a Source Map v3 object (or null when no map was asked for). */
function emit(program, options = {}) {
  const emitter = new Emitter(options);
  if (program.type === 'Program') emitter.statements(program.body);
  else emitter.emit(program, 1);
  const map = options.sourceMapFile
    ? {
      version: 3,
      file: options.sourceMapFile,
      sources: [options.file || 'input.js'],
      sourcesContent: emitter.includeContent ? [emitter.source] : [],
      names: emitter.names,
      mappings: sourcemap.encode(emitter.mappings),
    }
    : null;
  if (emitter.unmapped) emitter.warnings.push(`${emitter.unmapped} node(s) had no usable source position and were not mapped`);
  return { code: emitter.code, map, warnings: emitter.warnings, mappings: emitter.mappings, names: emitter.names, unmapped: emitter.unmapped };
}

module.exports = { emit, Emitter, precedenceOf, firstCharOf, printNumber, printString, flattenable, BINARY_ORDER, HAZARD_START };
