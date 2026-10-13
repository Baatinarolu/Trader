'use strict';
/**
 * compress.js — the passes. Each one is a pure function of the AST plus the scope analysis, each one
 * reports what it changed and why, and each one is written so that a "no" is a real no: nothing here
 * removes a call, a read, a getter, a `new`, a tagged template or a mutation, because a compressor
 * cannot see through a Proxy trap, a `Symbol.toPrimitive`, a throwing getter or a side-effecting
 * property read, and pretending otherwise is how minifiers break programs.
 *
 * The passes, in the order they run:
 *
 *   drop_debugger     `debugger` statements, which are no-ops unless a debugger is attached
 *                     (`--keep-debugger` keeps them, and the report says which way it went)
 *   fold_literals     arithmetic, comparison and coercion between LITERALS only, with the printed
 *                     result read back and compared before it is used
 *   simplify_tests    a literal, side-effect-free test picks its branch
 *   simplify_literals `true`→`!0`, `false`→`!1`, an unbound `undefined`→`void 0`
 *   drop_unused       a binding with no references at all; an initialiser that is not provably pure
 *                     is kept as its own statement, so `const x = f()` becomes `f();`
 *   shorten_literals  the shortest spelling of a number or a string that means the same value
 *   rename_locals     opt-in: the shortest name that collides with nothing in the file
 *
 * Two hoisting rules are load-bearing and are the reason a "dead" branch is sometimes kept:
 *
 *   * `var` declarations and function declarations hoist out of a branch that never runs, so
 *     `if (false) { var x }` cannot simply be deleted — the binding exists;
 *   * a `while (false)` body is never evaluated, but the same hoisting applies inside it.
 *
 * Deliberately absent, and said so in the report rather than implied: no parameter dropping (arity
 * and `arguments` are observable), no property mangling, no `let`→`const` (no byte saved), no
 * cross-statement merging (evaluation order), and no assumption that any call is pure.
 */
const { KEYS, children } = require('./ast');
const { printNumber, printString } = require('./emit');
const { declaredNames } = require('./scope');

const RESERVED_WORDS = new Set(['break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'implements', 'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'await']);

/** Is evaluating this node provably free of side effects AND of reads that could throw or observe? */
function pure(node) {
  if (!node) return true;
  switch (node.type) {
    case 'Literal': case 'Identifier': case 'PrivateName': case 'MetaProperty': return true;
    case 'ParenExpression': return pure(node.expression);
    case 'TemplateLiteral': return node.expressions.every(pure);
    case 'ArrayExpression': case 'ArrayPattern': return (node.elements || []).every((el) => !el || pure(el));
    case 'ObjectExpression': return (node.properties || []).every((p) => (p.type === 'SpreadElement' ? pure(p.argument) : !p.method && (!p.computed || pure(p.key)) && pure(p.value)));
    case 'UnaryExpression': return node.operator !== 'delete' && pure(node.argument);
    case 'BinaryExpression': return node.operator !== 'instanceof' && pure(node.left) && pure(node.right);
    case 'LogicalExpression': return pure(node.left) && pure(node.right);
    case 'ConditionalExpression': return pure(node.test) && pure(node.consequent) && pure(node.alternate);
    case 'SequenceExpression': return node.expressions.every(pure);
    case 'FunctionExpression': case 'ArrowFunctionExpression': case 'ClassExpression': return true;
    default: return false;
  }
}

/** Does this subtree declare anything that hoists out of a branch that never runs? */
function hoists(node) {
  let found = false;
  (function scan(n) {
    if (found || !n || typeof n.type !== 'string') return;
    if (n.type === 'VariableDeclaration' && n.kind === 'var') { found = true; return; }
    if (n.type === 'FunctionDeclaration') { found = true; return; }
    for (const { node: child } of children(n)) scan(child);
  })(node);
  return found;
}

function literalValue(node) {
  if (!node) return undefined;
  if (node.type === 'Literal') return node.kind === 'bigint' || node.kind === 'regex' ? undefined : node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis.map((q) => q.value).join('');
  return undefined;
}

const literalNode = (value) => {
  if (typeof value === 'string') return { type: 'Literal', kind: 'string', value, raw: printString({ value, raw: JSON.stringify(value) }, true), synthetic: true };
  if (typeof value === 'boolean') return { type: 'Literal', kind: 'boolean', value, raw: String(value), synthetic: true };
  if (typeof value === 'number') return { type: 'Literal', kind: 'number', value, raw: printNumber({ value, raw: String(value) }, true), synthetic: true };
  return { type: 'Literal', kind: 'null', value: null, raw: 'null', synthetic: true };
};

/** Would re-reading the printed text give exactly this number back? */
function numberPrintsBack(value, text) {
  const parsed = Number(text);
  if (Number.isNaN(value)) return Number.isNaN(parsed);
  return Object.is(parsed, value) || (value !== 0 && parsed === value);
}

function compress(program, options = {}, analysis = {}) {
  const report = [];
  const note = (pass, summary, count, detail) => { report.push({ pass, summary, count, ...(detail ? { detail } : {}) }); return count; };
  const hazards = analysis.hazards || {};

  /** Post-order rewrite. Returning `null` drops an array member; returning an array splices it in. The
   * callback also receives the slot it is standing in, because two node types mean something different
   * by position: a TemplateLiteral is a string, but the same node as a tag's `quasi` is a model of the
   * call site, and folding it to a string would turn `tag\`a\`` into `tag"a"`. */
  function rewrite(node, fn, parent = null, parentKey = null) {
    if (!node || typeof node.type !== 'string') return node;
    for (const key of KEYS[node.type] || []) {
      const value = node[key];
      if (Array.isArray(value)) node[key] = value.flatMap((c) => {
        if (c === null || c === undefined) return [c];
        const out = rewrite(c, fn, node, key);
        return out === null || out === undefined ? [] : Array.isArray(out) ? out : [out];
      });
      else if (value) { const out = rewrite(value, fn, node, key); node[key] = Array.isArray(out) ? out[0] : out; }
    }
    return fn(node, parent, parentKey);
  }
  const isTaggedQuasi = (parent, key) => !!parent && parent.type === 'TaggedTemplateExpression' && key === 'quasi';

  // ------------------------------------------------------------------ 1. debugger
  let debuggers = 0;
  if (!options.keepDebugger) {
    rewrite(program, (node) => {
      if (node.type === 'DebuggerStatement') { debuggers++; return null; }
      return node;
    });
    note('drop_debugger', 'debugger statements removed: a no-op unless a debugger is attached (--keep-debugger keeps them)', debuggers);
  } else note('drop_debugger', 'debugger statements kept as asked (--keep-debugger)', 0);

  // ------------------------------------------------------------------ 2. fold literals
  let folds = 0;
  const foldBinary = (node) => {
    const left = literalValue(node.left), right = literalValue(node.right);
    if (left === undefined || right === undefined) return null;
    const bothNumbers = node.left.kind === 'number' && node.right.kind === 'number';
    let value;
    try {
      switch (node.operator) {
        case '+': value = left + right; break;
        case '-': if (!bothNumbers) return null; value = left - right; break;
        case '*': if (!bothNumbers) return null; value = left * right; break;
        case '/': if (!bothNumbers || right === 0) return null; value = left / right; break;
        case '%': if (!bothNumbers || right === 0) return null; value = left % right; break;
        case '**': if (!bothNumbers || Math.abs(right) > 64) return null; value = left ** right; break;
        case '<<': case '>>': case '>>>': case '&': case '|': case '^':
          if (!bothNumbers) return null;
          value = { '<<': left << right, '>>': left >> right, '>>>': left >>> right, '&': left & right, '|': left | right, '^': left ^ right }[node.operator];
          break;
        case '===': value = left === right; break;
        case '!==': value = left !== right; break;
        case '==': value = left == right; break; // eslint-disable-line eqeqeq
        case '!=': value = left != right; break; // eslint-disable-line eqeqeq
        case '<': case '>': case '<=': case '>=': value = { '<': left < right, '>': left > right, '<=': left <= right, '>=': left >= right }[node.operator]; break;
        default: return null;
      }
    } catch { return null; }
    if (typeof value === 'number' && (!Number.isFinite(value) || !numberPrintsBack(value, String(value)))) return null;
    if (typeof value === 'number' && Object.is(value, -0)) return null;
    return literalNode(value);
  };
  const foldUnary = (node) => {
    const v = literalValue(node.argument);
    if (v === undefined) return null;
    switch (node.operator) {
      case '!': return literalNode(!v);
      case 'typeof': return literalNode(typeof v);
      case '-': case '+': case '~': {
        if (typeof v !== 'number') return null;
        const value = node.operator === '-' ? -v : node.operator === '+' ? +v : ~v;
        if (!Number.isFinite(value) && typeof value === 'number') return null;
        return numberPrintsBack(value, String(value)) ? literalNode(value) : null;
      }
      default: return null;
    }
  };
  rewrite(program, (node, parent, key) => {
    if (node.type === 'BinaryExpression') { const out = foldBinary(node); if (out) { folds++; return out; } }
    if (node.type === 'UnaryExpression') { const out = foldUnary(node); if (out) { folds++; return out; } }
    if (node.type === 'TemplateLiteral' && node.expressions.length === 0 && !isTaggedQuasi(parent, key)) {
      folds++; return literalNode(node.quasis.map((q) => q.value).join(''));
    }
    return node;
  });
  note('fold_literals', 'arithmetic, comparison and coercion folded between literals only; the printed result is read back and compared before it is used', folds);

  // ------------------------------------------------------------------ 3. a literal test picks its branch
  let simplified = 0, keptForHoisting = 0;
  const blocked = (dropped) => { if (hoists(dropped)) { keptForHoisting++; return true; } return false; };
  rewrite(program, (node) => {
    if (node.type === 'LogicalExpression') {
      const left = literalValue(node.left);
      if (left === undefined) return node;
      if (node.operator === '&&') { simplified++; return left ? node.right : literalNode(left); }
      if (node.operator === '||') { simplified++; return left ? literalNode(left) : node.right; }
      if (node.operator === '??') { simplified++; return left === null || left === undefined ? node.right : literalNode(left); }
      return node;
    }
    if (node.type === 'ConditionalExpression') {
      const test = literalValue(node.test);
      if (test === undefined) return node;
      simplified++;
      return test ? node.consequent : node.alternate;
    }
    if (node.type === 'IfStatement') {
      const test = literalValue(node.test);
      if (test === undefined) return node;
      if (test) { if (blocked(node.alternate)) return node; simplified++; return node.consequent; }
      if (blocked(node.consequent)) return node;
      simplified++;
      return node.alternate || { type: 'EmptyStatement', loc: node.loc };
    }
    if (node.type === 'WhileStatement') {
      const test = literalValue(node.test);
      if (test !== false) return node;
      if (blocked(node.body) || !pure(node.body)) { keptForHoisting++; return node; }
      simplified++;
      return { type: 'EmptyStatement', loc: node.loc };
    }
    return node;
  });
  note('simplify_tests', 'a literal test picks its branch; a dropped branch that could hoist a `var` or a function declaration is KEPT, and a `while (false)` body is only dropped when it is already inert', simplified, keptForHoisting ? { branches_kept_because_they_hoist: keptForHoisting } : undefined);

  // ------------------------------------------------------------------ 4. true/false/undefined spellings
  let spellings = 0;
  const namePosition = (parent, key) => !!parent && (((parent.type === 'Property' || parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition' || parent.type === 'ExportSpecifier' || parent.type === 'ImportSpecifier') && key === 'key' && !parent.computed)
    || (parent.type === 'MemberExpression' && key === 'property' && !parent.computed));
  (function spell(node, parent, key) {
    if (!node || typeof node.type !== 'string') return;
    if (node.__directive) return;
    if (node.type === 'Literal' && node.kind === 'boolean' && !namePosition(parent, key)) {
      spellings++;
      Object.assign(node, { type: 'UnaryExpression', operator: '!', prefix: true, argument: literalNode(node.value ? 0 : 1), loc: node.loc });
    }
    if (node.type === 'Identifier' && node.name === 'undefined' && !node.__binding && !hazards.with) {
      spellings++;
      Object.assign(node, { type: 'UnaryExpression', operator: 'void', prefix: true, argument: literalNode(0), loc: node.loc });
    }
    for (const key of KEYS[node.type] || []) {
      const value = node[key];
      if (Array.isArray(value)) value.forEach((c) => spell(c, node, key));
      else spell(value, node, key);
    }
  })(program, null, null);
  note('simplify_literals', '`true`→`!0`, `false`→`!1`, and an `undefined` that resolves to no binding→`void 0` (a binding named `undefined` keeps its meaning)', spellings);

  // ------------------------------------------------------------------ 5. unused bindings
  let droppedBindings = 0, effectsKept = 0, droppedSpecifiers = 0;
  const unusedNodes = new Set();
  for (const b of analysis.bindings || []) {
    if (b.reads + b.writes === 0 && !b.exported && !(b.topLevel && program.sourceType !== 'module')) unusedNodes.add(b.node);
  }
  if (!hazards.eval && !hazards.with && unusedNodes.size) {
    rewrite(program, (node) => {
      if (node.type === 'VariableDeclaration') {
        const kept = [], extra = [];
        for (const d of node.declarations) {
          const names = declaredNames(d.id);
          // A destructuring binding reads properties of its initialiser, and a property read can run
          // a getter or a Proxy trap, so `const {a} = probe()` is NOT an unused binding to delete — it
          // is a call into code the compressor cannot see. Only a plain identifier is dropped.
          if (d.id.type !== 'Identifier' || !names.length || !names.every((id) => unusedNodes.has(id))) { kept.push(d); if (d.id.type !== 'Identifier') effectsKept++; continue; }
          droppedBindings += names.length;
          if (d.init && !pure(d.init)) { extra.push({ type: 'ExpressionStatement', expression: d.init, loc: d.loc }); effectsKept++; }
        }
        if (kept.length === node.declarations.length) return node;
        if (!kept.length) return extra.length ? extra : null;
        node.declarations = kept;
        return extra.length ? [node, ...extra] : node;
      }
      if (node.type === 'FunctionDeclaration' && node.id && unusedNodes.has(node.id) && !(node.topLevel && program.sourceType !== 'module')) { droppedBindings++; return null; }
      if (node.type === 'ImportDeclaration' && node.specifiers.length) {
        const kept = node.specifiers.filter((spec) => !unusedNodes.has(spec.local));
        if (kept.length !== node.specifiers.length) { droppedSpecifiers += node.specifiers.length - kept.length; node.specifiers = kept; }
        return node;
      }
      return node;
    });
    note('drop_unused', 'bindings with no references at all removed; an initialiser that is not provably pure is kept as its own statement, so `const x = f()` becomes `f();` and no call, read or `new` is deleted', droppedBindings, { unused_import_specifiers_removed: droppedSpecifiers, initialisers_kept_as_statements: effectsKept });
  } else {
    note('drop_unused', 'disabled for this file: ' + (hazards.eval ? 'a direct eval can read any name' : hazards.with ? 'a with block makes every name dynamic' : 'nothing was unused'), 0);
  }

  // ------------------------------------------------------------------ 6. shortest literal spellings
  let shortened = 0;
  rewrite(program, (node) => {
    if (node.__directive) return node;
    if (node.type === 'Literal' && node.kind === 'number') {
      const best = printNumber(node, true);
      if (best && best !== node.raw && Number(best) === node.value) { node.raw = best; shortened++; }
    } else if (node.type === 'Literal' && node.kind === 'string') {
      const best = printString(node, true);
      if (best && best.length < (node.raw || '').length) { node.raw = best; shortened++; }
    }
    return node;
  });
  note('shorten_literals', 'numbers and strings reprinted in the shortest form that evaluates to the same value (checked with Number() for numbers, re-quoted for strings)', shortened);

  // ------------------------------------------------------------------ 7. opt-in renaming
  const renames = { renamed: 0, skipped: [] };
  if (options.renameLocals) {
    const taken = new Set(RESERVED_WORDS);
    (function collect(node) {
      if (!node || typeof node.type !== 'string') return;
      if (node.type === 'Identifier') taken.add(node.name);
      if (node.type === 'PrivateName' && node.id) taken.add(node.id.name);
      for (const { node: child } of children(node)) collect(child);
    })(program);
    for (const text of analysis.strings || []) for (const word of String(text).split(/[^A-Za-z0-9_$]+/)) if (word) taken.add(word);
    const pool = [];
    for (const a of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_') pool.push(a);
    for (const a of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_') for (const b of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_0123456789') pool.push(a + b);
    for (const a of 'abcdfghijklmnopqrstuvwxyz') for (const b of 'abcdefghijklmnopqrstuvwxyz') for (const c of 'abcdefghijklmnopqrstuvwxyz0123456789') pool.push(a + b + c);
    const candidates = pool.filter((name) => !taken.has(name)).sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
    let cursor = 0;
    const order = (analysis.bindings || []).slice().sort((a, b) => (b.reads + b.writes) - (a.reads + a.writes) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const binding of order) {
      const usable = !binding.unsafeReason && binding.reads + binding.writes > 0 && binding.name.length > 1;
      if (!usable) { if (binding.unsafeReason && binding.reads + binding.writes > 0) renames.skipped.push({ name: binding.name, why: binding.unsafeReason }); continue; }
      while (cursor < candidates.length && candidates[cursor].length >= binding.name.length) cursor++;
      if (cursor >= candidates.length) break;
      const name = candidates[cursor++];
      taken.add(name);
      binding.renamed = name; renames.renamed++;
      for (const node of [binding.node, ...binding.refs]) Object.defineProperty(node, '__renamed', { value: name, writable: true, enumerable: false, configurable: true });
    }
    const reasons = [...new Set(renames.skipped.map((s) => s.why))].sort();
    const blocked = Object.entries(hazards).filter(([, on]) => on).map(([h]) => h);
    note('rename_locals', 'locals given the shortest name that collides with nothing in the file — not with any binding, not with any name that appears as text; exported names, top-level bindings and everything the analyser marked unsafe keeps its name', renames.renamed, { skipped: renames.skipped.length, skipped_reasons: reasons, ...(blocked.length ? { hazards_that_block_renaming: blocked } : {}) });
  } else note('rename_locals', 'disabled: every name is kept exactly as written (--rename-locals turns this on)', 0);

  return { report, renames };
}

module.exports = { compress, pure, hoists, literalValue, literalNode, RESERVED_WORDS };
