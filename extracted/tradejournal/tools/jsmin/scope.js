'use strict';
/**
 * scope.js — the scope chain, every binding's references, and the hazards that decide whether a name
 * may be renamed at all.
 *
 * Two passes, because declarations must exist before references can be resolved:
 *
 *   A. build the scope chain and declare every binding — `var` to the nearest function/script scope,
 *      `let`/`const`/`class`/block-level functions to the innermost block, parameters to the
 *      function, catch parameters to the catch clause, module specifiers to the module.
 *   B. resolve every identifier reference to its binding, counting reads and writes and marking each
 *      node, so a pass can rename a binding by walking the references rather than by rewriting text.
 *
 * What this file refuses to guess is the point of it. A binding is marked unsafe when something in
 * the file could observe its name without the analyser seeing a reference:
 *
 *   * a direct `eval` or a `with` block anywhere in an enclosing scope — the name may be looked up
 *     dynamically, and nothing in the tree says so;
 *   * `new Function(…)` / `Function(…)`, which is the same hazard one indirection away;
 *   * the name appearing as TEXT anywhere in the file (a string, a template chunk, a regular
 *     expression) — the classic `window[name]`, `obj['handler']` and `fn.name` cases;
 *   * an exported binding, and — unless asked — any top-level binding in a script, because a script's
 *     top level is shared with everything else on the page.
 *
 * None of that is style. A compressor that renames on the strength of "I did not see a reference"
 * is wrong about all four, and the honest response is to keep the name and say so in the report.
 */
const { KEYS, children } = require('./ast');

let nextBindingId = 1;

/** The scopes that belong to the whole file: their bindings are visible to everything that shares
 * the page or the module, which is why a rename there is opt-in and why a `var` stops climbing here. */
const TOP_LEVEL_SCOPES = new Set(['program', 'script', 'module']);

class Scope {
  constructor(type, parent, node) {
    this.type = type; this.parent = parent; this.node = node;
    this.bindings = new Map(); this.children = [];
    if (parent) parent.children.push(this);
    this.hazards = { eval: false, withBlock: false, dynamicFunction: false, argumentsUsed: false };
  }

  /** The scope a `var` belongs to: the nearest function, or the program. */
  get varScope() {
    let s = this;
    while (s && s.type !== 'function' && !TOP_LEVEL_SCOPES.has(s.type)) s = s.parent;
    return s || this;
  }

  declare(name, kind, node) {
    const existing = this.bindings.get(name);
    if (existing && kind !== 'var' && existing.kind === 'var') return existing;
    if (existing) return existing;
    const binding = {
      id: nextBindingId++, name, kind, scope: this, node: node || null,
      reads: 0, writes: 0, refs: [], writesNodes: [], exported: false, captures: false,
      functionValued: false, unsafeReason: null, renamed: null, topLevel: TOP_LEVEL_SCOPES.has(this.type),
    };
    this.bindings.set(name, binding);
    return binding;
  }

  lookup(name) {
    for (let s = this; s; s = s.parent) { const b = s.bindings.get(name); if (b) return b; }
    return null;
  }
}

const isWritingPosition = (node, parent, key, index) => {
  if (!parent) return false;
  if (parent.type === 'AssignmentExpression' && key === 'left') return true;
  if (parent.type === 'UpdateExpression') return true;
  if ((parent.type === 'ForInStatement' || parent.type === 'ForOfStatement') && key === 'left') return true;
  if (parent.type === 'AssignmentPattern' && key === 'left') return true;
  if ((parent.type === 'VariableDeclarator' || parent.type === 'PropertyDefinition') && key === 'id') return true;
  void index;
  return false;
};

/** The identifier a declaration node stands for, if it declares exactly one name. */
function declaredNames(pattern, out = []) {
  if (!pattern) return out;
  switch (pattern.type) {
    case 'Identifier': out.push(pattern); break;
    case 'ObjectPattern': for (const p of pattern.properties) declaredNames(p.type === 'RestElement' ? p.argument : (p.value && p.value.type === 'AssignmentPattern' ? p.value.left : p.value), out); break;
    case 'ArrayPattern': for (const el of pattern.elements) if (el) declaredNames(el.type === 'AssignmentPattern' ? el.left : el, out); break;
    case 'AssignmentPattern': declaredNames(pattern.left, out); break;
    case 'RestElement': declaredNames(pattern.argument, out); break;
    default: break;
  }
  return out;
}

function analyze(program, options = {}) {
  const root = new Scope(program.sourceType === 'module' ? 'module' : 'script', null, program);
  const bindings = [];
  const globals = [];
  const strings = new Set();
  const dynamicText = new Set();
  const dynamicScopes = new Set();
  let evalSeen = false, withSeen = false, functionConstructorSeen = false, argumentsSeen = false;

  // `declare` hands back the binding that already exists when a name is declared twice (a `var` in a
  // loop, a repeated `const` in the same scope, a function declared and assigned): the same object
  // then comes back more than once, and recording it twice made the binding list grow with the
  // number of DECLARATIONS rather than the number of BINDINGS — and made the passes below quadratic
  // in a file that declares the same name over and over.
  const seenBindings = new Set();
  const record = (b) => { if (b && !seenBindings.has(b)) { seenBindings.add(b); bindings.push(b); } return b; };

  // ------------------------------------------------------------------ pass A: scopes + declarations
  function declarePattern(pattern, scope, kind) {
    for (const id of declaredNames(pattern)) record(scope.declare(id.name, kind, id));
  }

  function build(node, scope) {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'Program':
        for (const stmt of node.body) build(stmt, scope);
        return;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': {
        // The name of a function declaration lives in the enclosing scope; the name of a function
        // expression lives in a scope of its own, so it can be used inside its own body.
        if (node.type === 'FunctionDeclaration' && node.id) record(scope.declare(node.id.name, 'function', node.id));
        const fnScope = new Scope('function', scope, node);
        if (node.type === 'FunctionExpression' && node.id) record(fnScope.declare(node.id.name, 'function-name', node.id));
        for (const p of node.params) declarePattern(p, fnScope, 'param');
        if (node.body.type === 'BlockStatement') {
          const bodyScope = new Scope('block', fnScope, node.body);
          for (const stmt of node.body.body) build(stmt, bodyScope);
        } else build(node.body, fnScope);
        return;
      }
      case 'ClassDeclaration': {
        if (node.id) record(scope.declare(node.id.name, 'class', node.id));
        const classScope = new Scope('block', scope, node);
        if (node.id) record(classScope.declare(node.id.name, 'class-name', node.id));
        if (node.superClass) build(node.superClass, scope);
        for (const member of node.body.body) {
          if (member.computed && member.key) build(member.key, classScope);
          if (member.value) build(member.value, classScope);
          if (member.type === 'PropertyDefinition' && member.value) build(member.value, classScope);
          if (member.type === 'StaticBlock') for (const stmt of member.body) build(stmt, classScope);
        }
        return;
      }
      case 'ClassExpression': {
        const classScope = new Scope('block', scope, node);
        if (node.id) record(classScope.declare(node.id.name, 'class-name', node.id));
        if (node.superClass) build(node.superClass, scope);
        for (const member of node.body.body) {
          if (member.computed && member.key) build(member.key, classScope);
          if (member.value) build(member.value, classScope);
          if (member.type === 'PropertyDefinition' && member.value) build(member.value, classScope);
          if (member.type === 'StaticBlock') for (const stmt of member.body) build(stmt, classScope);
        }
        return;
      }
      case 'BlockStatement': case 'StaticBlock': {
        const block = new Scope('block', scope, node);
        for (const stmt of node.body) build(stmt, block);
        return;
      }
      case 'VariableDeclaration': {
        const target = node.kind === 'var' ? scope.varScope : scope;
        for (const d of node.declarations) {
          declarePattern(d.id, target, node.kind);
          if (d.init) {
            // An ANONYMOUS function/arrow/class expression takes its name from the binding it is
            // assigned to, so renaming that binding would change `fn.name`. A named one carries its
            // own name and is safe to rename.
            const init = d.init;
            const nameBearing = (init.type === 'FunctionExpression' || init.type === 'ClassExpression') ? !init.id
              : init.type === 'ArrowFunctionExpression';
            if (nameBearing) for (const id of declaredNames(d.id)) { const b = target.lookup(id.name); if (b) b.functionValued = true; }
            build(d.init, scope);
          }
        }
        return;
      }
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': {
        const forScope = new Scope('block', scope, node);
        const head = node.init || node.left;
        if (head && head.type === 'VariableDeclaration') build(head, forScope);
        else if (head) build(head, forScope);
        if (node.test) build(node.test, forScope);
        if (node.update) build(node.update, forScope);
        if (node.right) build(node.right, forScope);
        build(node.body, forScope);
        return;
      }
      case 'SwitchStatement': {
        build(node.discriminant, scope);
        const switchScope = new Scope('block', scope, node);
        for (const c of node.cases) { if (c.test) build(c.test, switchScope); for (const s of c.consequent) build(s, switchScope); }
        return;
      }
      case 'CatchClause': {
        const catchScope = new Scope('block', scope, node);
        if (node.param) declarePattern(node.param, catchScope, 'catch');
        for (const stmt of node.body.body) build(stmt, catchScope);
        return;
      }
      case 'WithStatement':
        scope.hazards.withBlock = true; withSeen = true; dynamicScopes.add(scope);
        build(node.object, scope); build(node.body, scope);
        return;
      case 'ImportDeclaration':
        for (const spec of node.specifiers) record(scope.declare(spec.local.name, 'import', spec.local));
        return;
      case 'ExportNamedDeclaration': {
        if (node.declaration) {
          build(node.declaration, scope);
          // `export const x = 1` exports x without a specifier: every name the declaration introduces is
          // exported, so it must be marked here — an inline export that was not marked got removed as an
          // unused local and the module exported nothing.
          const names = node.declaration.type === 'VariableDeclaration'
            ? node.declaration.declarations.flatMap((d) => declaredNames(d.id))
            : (node.declaration.id ? [node.declaration.id] : []);
          for (const id of names) { const b = scope.lookup(id.name); if (b) b.exported = true; }
        }
        for (const spec of node.specifiers) {
          const b = scope.lookup(spec.local.name);
          if (b) b.exported = true; else globals.push(spec.local);
        }
        return;
      }
      case 'ExportDefaultDeclaration': {
        if (node.declaration.type === 'FunctionDeclaration' || node.declaration.type === 'ClassDeclaration') {
          if (node.declaration.id) { const b = scope.declare(node.declaration.id.name, node.declaration.type === 'FunctionDeclaration' ? 'function' : 'class', node.declaration.id); b.exported = true; record(b); }
          else build(node.declaration, scope);
        } else build(node.declaration, scope);
        return;
      }
      case 'ExportAllDeclaration': return;
      default: break;
    }
    for (const { key, node: child } of children(node)) {
      // Property `keys` are names, not references; a computed key is an expression.
      if ((node.type === 'Property' || node.type === 'MethodDefinition' || node.type === 'PropertyDefinition') && key === 'key' && !node.computed) continue;
      build(child, scope);
    }
  }

  build(program, root);

  // ------------------------------------------------------------------ pass B: references
  function reference(idNode, scope, parent, key) {
    const binding = scope.lookup(idNode.name);
    if (!binding) { globals.push(idNode); return; }
    const writing = isWritingPosition(idNode, parent, key);
    // The identifier that DECLARES a binding is kept in `refs`, because a rename has to reach it, but it
    // is not a reference to the value: counting it as one made `reads + writes` at least 1 for every
    // binding in every file, which quietly made `drop_unused` and `unsafeReason === 'never referenced'`
    // unreachable — an unused import was never pruned and an unused local was never removed.
    const declares = binding.node === idNode;
    binding.refs.push(idNode);
    if (declares) { /* the declaration is not a use */ }
    else if (writing) { binding.writes++; binding.writesNodes.push(idNode); }
    else binding.reads++;
    markNode(idNode, { __binding: binding, __decl: declares });
  }

  function walkRefs(node, scope, parent, key) {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'Identifier') {
      if (parent && parent.type === 'MemberExpression' && key === 'property' && !parent.computed) return;
      if (parent && parent.type === 'MetaProperty') return;
      // In `import {a as b}` the name `a` belongs to the other module and the name `b` is the local
      // declaration; in `export {b as c}` the local name is a real reference and the exported name is
      // a name in the export list. Only `local` is a name in this file.
      if (parent && (parent.type === 'ImportSpecifier' || parent.type === 'ImportNamespaceSpecifier' || parent.type === 'ImportDefaultSpecifier' || parent.type === 'ExportSpecifier') && key !== 'local') return;
      if (parent && parent.type === 'PrivateName') return;
      if (parent && (parent.type === 'Property' || parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') && key === 'key' && !parent.computed) return;
      if (parent && parent.type === 'BreakStatement' || parent && parent.type === 'ContinueStatement') return;
      if (parent && parent.type === 'LabeledStatement' && key === 'label') return;
      if (node.name === 'this' || node.name === 'super') return;
      reference(node, scope, parent, key);
      return;
    }
    if (node.type === 'CallExpression') {
      const callee = node.callee;
      const dynamic = (callee.type === 'Identifier' && callee.name === 'eval') || (callee.type === 'Identifier' && callee.name === 'Function');
      if (dynamic && callee.name === 'eval') { evalSeen = true; for (let s = scope; s; s = s.parent) s.hazards.eval = true; dynamicScopes.add(scope); }
      if (dynamic && callee.name === 'Function') { functionConstructorSeen = true; for (let s = scope; s; s = s.parent) s.hazards.dynamicFunction = true; }
      if (callee.type === 'MemberExpression' && callee.object && callee.object.type === 'Identifier' && callee.object.name === 'window' && callee.computed) { /* window[name] is caught by the text guard */ }
    }
    if (node.type === 'NewExpression' && node.callee.type === 'Identifier' && node.callee.name === 'Function') {
      functionConstructorSeen = true; for (let s = scope; s; s = s.parent) s.hazards.dynamicFunction = true;
    }
    if (node.type === 'Identifier' && node.name === 'arguments') { argumentsSeen = true; }
    if (node.type === 'Literal' && node.kind === 'string') strings.add(node.value);
    if (node.type === 'Literal' && node.kind === 'regex') strings.add(node.value.body);
    if (node.type === 'TemplateElement') strings.add(node.value);
    switch (node.type) {
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': {
        const fnScope = findScope(node) || scope;
        for (const p of node.params) walkPattern(p, fnScope);
        if (node.body.type === 'BlockStatement') {
          const bodyScope = fnScope.children.find((c) => c.node === node.body) || fnScope;
          for (const stmt of node.body.body) walkRefs(stmt, bodyScope, node, 'body');
        } else walkRefs(node.body, fnScope, node, 'body');
        return;
      }
      case 'ClassDeclaration': case 'ClassExpression': {
        const classScope = findScope(node) || scope;
        if (node.superClass) walkRefs(node.superClass, scope, node, 'superClass');
        for (const member of node.body.body) {
          if (member.computed && member.key) walkRefs(member.key, classScope, member, 'key');
          if (member.value) walkRefs(member.value, classScope, member, 'value');
          if (member.type === 'PropertyDefinition' && member.value) walkRefs(member.value, classScope, member, 'value');
          if (member.type === 'StaticBlock') for (const stmt of member.body) walkRefs(stmt, classScope, member, 'body');
        }
        return;
      }
      case 'BlockStatement': case 'StaticBlock': {
        const block = findScope(node) || scope;
        for (const stmt of node.body) walkRefs(stmt, block, node, 'body');
        return;
      }
      case 'CatchClause': {
        const catchScope = findScope(node) || scope;
        if (node.param) walkPattern(node.param, catchScope);
        for (const stmt of node.body.body) walkRefs(stmt, catchScope, node, 'body');
        return;
      }
      case 'SwitchStatement': case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': {
        const inner = findScope(node) || scope;
        for (const { key: k, node: child } of children(node)) walkRefs(child, inner, node, k);
        return;
      }
      case 'VariableDeclaration':
        for (const d of node.declarations) { walkPattern(d.id, scope); if (d.init) walkRefs(d.init, scope, node, 'init'); }
        return;
      case 'AssignmentExpression':
        walkAssignmentTarget(node.left, scope, node);
        walkRefs(node.right, scope, node, 'right');
        return;
      case 'Property':
        if (node.computed) walkRefs(node.key, scope, node, 'key');
        if (node.shorthand && node.value.type === 'Identifier') reference(node.value, scope, node, 'value');
        else walkRefs(node.value, scope, node, 'value');
        return;
      default: break;
    }
    for (const { key: k, node: child } of children(node)) walkRefs(child, scope, node, k);
  }

  function walkPattern(pattern, scope) {
    if (!pattern) return;
    switch (pattern.type) {
      case 'Identifier': reference(pattern, scope, null, null); return;
      case 'AssignmentPattern': walkPattern(pattern.left, scope); walkRefs(pattern.right, scope, pattern, 'right'); return;
      case 'ObjectPattern':
        for (const prop of pattern.properties) {
          if (prop.type === 'RestElement') walkPattern(prop.argument, scope);
          else { if (prop.computed) walkRefs(prop.key, scope, prop, 'key'); if (prop.value.type === 'AssignmentPattern') walkPattern(prop.value.left, scope); else walkPattern(prop.value, scope); }
        }
        return;
      case 'ArrayPattern': for (const el of pattern.elements) if (el) walkPattern(el, scope); return;
      case 'RestElement': walkPattern(pattern.argument, scope); return;
      case 'MemberExpression': walkRefs(pattern, scope, null, null); return;
      default: walkRefs(pattern, scope, null, null);
    }
  }

  function walkAssignmentTarget(target, scope, parent) {
    if (!target) return;
    if (target.type === 'Identifier') { reference(target, scope, parent, 'left'); return; }
    if (target.type === 'MemberExpression') { walkRefs(target.object, scope, target, 'object'); if (target.computed) walkRefs(target.property, scope, target, 'property'); return; }
    walkPattern(target, scope);
  }

  const scopeByNode = new Map();
  (function indexScopes(scope) { scopeByNode.set(scope.node, scope); for (const c of scope.children) indexScopes(c); })(root);
  function findScope(node) { return scopeByNode.get(node) || null; }

  walkRefs(program, root, null, null);

  // ------------------------------------------------------------------ rename safety
  for (const b of bindings) {
    if (b.exported) b.unsafeReason = 'exported';
    else if (b.topLevel && !options.renameTopLevel) b.unsafeReason = 'top-level binding in a ' + program.sourceType;
    else if (b.kind === 'import' || b.kind === 'function-name' || b.kind === 'class-name') b.unsafeReason = b.kind + ' name';
    else if (b.functionValued && !options.renameFunctionNames) b.unsafeReason = 'holds a function or class expression, so its `.name` is observable';
    else if (evalSeen) b.unsafeReason = 'a direct eval in the file can read any name';
    else if (functionConstructorSeen) b.unsafeReason = 'the Function constructor can read any name';
    else if (withSeen && dynamicScopes.has(b.scope)) b.unsafeReason = 'inside or below a with block';
    else if (strings.has(b.name)) b.unsafeReason = 'the name appears as text in the file';
    else if (b.reads + b.writes === 0) b.unsafeReason = 'never referenced';
  }
  const functionOf = new Map();
  (function indexFunction(node, fn) {
    functionOf.set(node, fn);
    for (const { node: child } of children(node)) if (child && typeof child.type === 'string') indexFunction(child, node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression' ? node : fn);
  })(program, null);
  function enclosingFunction(node) { return node ? functionOf.get(node) || null : null; }

  // A binding is *captured* when at least one reference sits in a different function than the
  // declaration: not a safety rule, but the report uses it to say how much of the file is closure
  // traffic rather than local traffic.
  for (const b of bindings) b.captures = b.refs.some((ref) => enclosingFunction(ref) !== enclosingFunction(b.node));

  return { root, bindings, globals, strings, hazards: { eval: evalSeen, with: withSeen, dynamicFunction: functionConstructorSeen, arguments: argumentsSeen }, scopeByNode, findScope };

  function markNode(node, props) {
    for (const [k, v] of Object.entries(props)) Object.defineProperty(node, k, { value: v, writable: true, enumerable: false, configurable: true });
  }
}

module.exports = { analyze, Scope, declaredNames };
