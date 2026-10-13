'use strict';
/**
 * Differential execution: the same program, before and after compression, run in a real V8 context,
 * with the observable results compared — not "the output parses" but "the output behaves the same".
 *
 * What is measured: for each snippet the recorded calls (arguments serialised), the thrown error's
 * name and message, and the value left in `out`, are compared between
 *
 *   1. the source as written,
 *   2. the source compressed (default options),
 *   3. the source compressed with `--rename-locals`.
 *
 * What is NOT measured, and is said so here rather than implied: this is a curated corpus of 60
 * snippets, not a proof over all programs. It cannot cover a program whose behaviour depends on
 * something outside the snippet (a clock, a socket, a DOM). Two things the tool changes on purpose
 * are asserted separately as the documented exceptions — a `debugger` statement disappears, and a
 * renamed binding changes `fn.name` unless the binding holds a function, which is why bindings that
 * hold functions are skipped unless the caller asks for the unsafe rename.
 */
const vm = require('vm');
const fs = require('fs'), path = require('path');
const JSMIN = path.join(__dirname, '..', 'extracted', 'tradejournal', 'tools', 'jsmin');
const { minify, verify } = require(JSMIN);

let pass = 0, fail = 0; const results = [];
const ok = (label, v, detail) => { results.push({ label, passed: !!v, ...(!v ? { detail } : {}) }); console.log(`${v ? 'ok' : 'FAIL'} ${label}${!v ? ' ' + JSON.stringify(detail) : ''}`); v ? pass++ : fail++; };

const serialize = (value, seen = new Set()) => {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'function') return `[function ${value.name || 'anonymous'}/${value.length}]`;
  if (typeof value === 'symbol') return String(value);
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => serialize(v, seen));
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  const out = {};
  for (const k of Object.keys(value).sort()) out[k] = serialize(value[k], seen);
  return out;
};

/** Run a snippet in a fresh context; return everything observable about that run. */
function run(source) {
  const records = [];
  const sandbox = { log: (...args) => records.push(serialize(args)), error: (...args) => records.push(['error', serialize(args)]) };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  let thrown = null;
  try { vm.runInContext(source, context, { filename: 'snippet.js' }); }
  catch (e) { thrown = `${e && e.name}: ${e && e.message}`; }
  let out;
  try { out = serialize(vm.runInContext('typeof out === "undefined" ? undefined : out', context)); } catch { out = '<unevaluable>'; }
  return { records: JSON.stringify(records), out: JSON.stringify(out), thrown };
}

const CASES = [
  ['arithmetic and precedence', 'out = 1 + 2 * 3 - (4 - 5) / 2 ** 2 % 3; log(out, -(-5), +(+3), ~4, - -1);'],
  ['string coercion', 'log("a" + 1, 1 + "a", "" + true, [1, 2] + "", `${1}${"b"}`);'],
  ['literal folding is only between literals', 'const n = 2; log(1 + 2, n + 3, "x" + n, n === 2);'],
  ['getter is read exactly once', 'let reads = 0; const o = { get v() { reads++; return 7; } }; log(o.v + o.v, reads);'],
  ['Proxy trap fires', 'let hits = 0; const p = new Proxy({}, { get: (t, k) => { hits++; return k; } }); log(p.a, p.b, hits);'],
  ['Symbol.toPrimitive is called', 'const o = { [Symbol.toPrimitive]: () => { log("prim"); return 41; } }; log(o + 1);'],
  ['property read is not removed', 'const o = { get x() { log("read"); return 1; } }; const unused = o.x; log("done");'],
  ['var hoisting out of a dead branch', 'function f() { if (false) { var x = 1; } return typeof x + "/" + x; } log(f());'],
  ['function declaration hoisting', 'log(typeof f, f()); function f() { return 5; }'],
  ['while(false) with an impure body', 'let n = 0; while (false) { n++; } log(n);'],
  ['while(false) with an inert body', 'let n = 0; while (false) { const s = 1 + 1; } log(n);'],
  ['evaluation order is preserved', 'const a = []; const t = (a.push(1), a.push(2), a.length); log(t, a.join(","));'],
  ['comma and conditional operators', 'let x = (0, 1, 2); const y = x > 1 ? "big" : "small"; log(x, y, (x = 3, x));'],
  ['logical short circuit', 'let calls = 0; const f = () => { calls++; return true; }; log(false && f(), true || f(), null ?? "d", 0 ?? "e", calls);'],
  ['ASI: statement starting with a paren', 'const a = {}; (function () { log("iife"); })(); log(typeof a);'],
  ['ASI: statement starting with a bracket', 'const a = 1; const b = a\n[1, 2].length; log(b);'],
  ['ASI: return with a newline', 'function f() { return\n  1; } log(f());'],
  ['a block after an expression statement', 'let v = 1; { const inner = 2; v += inner; } log(v);'],
  ['label and break', 'let seen = []; outer: for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) { if (j === 1) continue outer; seen.push(i + ":" + j); } } log(seen.join(" "));'],
  ['switch fallthrough', 'function f(n) { let out = []; switch (n) { case 1: out.push("one"); case 2: out.push("two"); break; default: out.push("other"); } return out.join(","); } log(f(1), f(2), f(3));'],
  ['try/catch/finally order', 'const seen = []; try { seen.push("try"); throw new Error("boom"); } catch (e) { seen.push("catch:" + e.message); } finally { seen.push("finally"); } log(seen.join("|"));'],
  ['catch without a binding', 'try { throw 1; } catch { log("caught"); }'],
  ['for-of with a const and destructuring', 'let total = 0; for (const [k, v] of [["a", 1], ["b", 2]]) { total += v; log(k); } log(total);'],
  ['for-in with a var', 'const o = { a: 1, b: 2 }; const keys = []; for (var k in o) keys.push(k); log(keys.join(","), typeof k);'],
  ['closure over a loop variable', 'const fns = []; for (let i = 0; i < 3; i++) fns.push(() => i); log(fns.map((f) => f()).join(","));'],
  ['closure over a var', 'const fns = []; for (var i = 0; i < 3; i++) fns.push(() => i); log(fns.map((f) => f()).join(","));'],
  ['TDZ stays an error', 'let t = null; try { t = (typeof x, 1); let x = 2; } catch (e) { t = e.name; } log(t);'],
  ['this is preserved for a method call', 'const o = { n: 5, m() { return this.n; } }; log(o.m(), (0, o.m)());'],
  ['this in an arrow is lexical', 'const o = { n: 3, m() { const f = () => this.n; return f(); } }; log(o.m());'],
  ['new and the callee chain', 'class A { constructor() { this.k = "a"; } } const o = { A }; log(new o.A().k, new (class { constructor() { this.k = "b"; } })().k);'],
  ['class fields, private names, getters', 'class A { #p = 2; static s = 9; get v() { return this.#p; } set v(x) { this.#p = x; } } const a = new A(); a.v = 5; log(a.v, A.s);'],
  ['super and extends', 'class B { m() { return "b"; } } class C extends B { m() { return super.m() + "c"; } } log(new C().m());'],
  ['object literal shorthand and methods', 'const k = "key"; const o = { k, m() { return 1; }, get g() { return 2; }, ["c" + "k"]: 3, ...{ x: 4 } }; log(o.k, o.m(), o.g, o.ck, o.x);'],
  ['destructuring with defaults and rest', 'const { a = 1, b: { c } = {}, ...rest } = { b: { c: 2 }, d: 3 }; const [x, , y = 4, ...z] = [1, 2, undefined, 3, 4]; log(a, c, JSON.stringify(rest), x, y, z.join(","));'],
  ['spread call and array spread', 'const args = [1, 2]; log(Math.max(...args, 3), [0, ...args].length);'],
  ['arrow shorthand and object body', 'const f = (x) => ({ v: x }); const g = (x) => { return { w: x }; }; log(f(1).v, g(2).w);'],
  ['tagged template receives raw and cooked', 'const tag = (s, ...v) => s.raw.join("|") + "/" + s.join("|") + "/" + v.join(","); log(tag`a\\nb${1 + 1}c${"d"}`);'],
  ['template with a nested template', 'const n = 2; log(`outer ${`inner ${n}`} end`);'],
  ['regex versus division', 'const r = /a[/]b/g; const d = 10 / 2 / 5; log(r.source, r.flags, d, /x/.test("axb"));'],
  ['regex with a flag after a call', 'const s = "a1b2"; log(s.replace(/[0-9]/g, "#"));'],
  ['typeof on an undeclared name', 'log(typeof notDeclared, typeof undefined, typeof null);'],
  ['in and instanceof', 'const o = { a: 1 }; log("a" in o, "b" in o, [] instanceof Array);'],
  ['delete and void', 'const o = { a: 1 }; log(delete o.a, "a" in o, void 0, undefined);'],
  ['update expressions and assignment operators', 'let n = 5; log(n++, ++n, n--, --n, n += 2, n -= 1, n *= 2, n /= 4, n %= 3, n **= 2);'],
  ['bitwise and shifts', 'log(5 & 3, 5 | 3, 5 ^ 3, ~5, 1 << 4, 256 >> 4, -1 >>> 28);'],
  ['optional chaining and nullish', 'const o = { a: { b: 1 } }; log(o?.a?.b, o?.c?.d, o.c ?? "fallback", o.c?.d?.());'],
  ['a function\'s arity is unchanged', 'function f(a, b, c) { return f.length + "/" + arguments.length; } log(f(1), f(1, 2, 3));'],
  ['arguments object contents', 'function f() { return Array.prototype.slice.call(arguments).join(","); } log(f(1, 2, 3));'],
  ['a getter that is only read once is still read', 'let n = 0; const o = {}; Object.defineProperty(o, "v", { get() { n++; return n; } }); const first = o.v; log(first, n);'],
  ['numbers keep their value', 'log(1000, 1e3, 0.5, .5, 0x10, 1e21, 1 - 0.9, 0.1 + 0.2, 12345678901234567890);'],
  ['strings keep their value', 'log("a\\u0041b", "\\n\\t", "quote\\"inside", "back\\\\slash", "\\u2028", "\\u{1F600}");'],
  ['comments and directives are removed, "use strict" is kept', '"use strict"; function f() { return this; } log(f());'],
  ['a binding used only in a nested function is kept', 'function outer() { const inner = 41; return () => inner + 1; } log(outer()());'],
  ['a shadowed name resolves to the right binding', 'const v = 1; function f() { const v = 2; return () => v; } log(f()(), v);'],
  ['the Function constructor is a hazard', 'const name = "x"; const f = new Function("return 1"); log(f(), name);'],
  ['a name inside a string is a hazard for renaming', 'function outer(handler) { const inner = 1; return { run: () => inner, key: "inner" }; } log(outer().run(), outer().key);'],
  ['no eval: a renamed name would break it', 'function outer() { const inner = 7; return eval("inner"); } log(outer());'],
  ['no with: every name is dynamic', 'const o = { inner: 3 }; let out2; with (o) { out2 = inner; } log(out2);'],
  ['empty statements and stray semicolons', ';;; let a = 1;; log(a);;'],
  ['a function expression name is its own binding', 'const f = function named() { return typeof named; }; log(f(), typeof named);'],
  ['immediately-invoked function expression with a global object', '(function (global) { const secret = 1; global.api = { read: () => secret }; })(globalThis); log(globalThis.api.read());'],
  ['exceptions keep their type and message', 'function boom() { throw new TypeError("nope"); } try { boom(); } catch (e) { log(e instanceof TypeError, e.message); }'],
  ['a thrown non-error', 'try { throw { code: 42 }; } catch (e) { log(e.code); }'],
  ['generators and yield*', 'function* g() { yield 1; yield* [2, 3]; } log([...g()].join(","));'],
  ['async/await over microtasks', 'async function f() { const v = await 1; return v + 1; } f().then((v) => log("async:" + v));'],
  ['iteration protocol', 'const it = { [Symbol.iterator]() { let i = 0; return { next: () => (i < 2 ? { value: i++, done: false } : { done: true }) }; } }; log([...it].join(","));'],
];

console.log('jsmin differential: ' + CASES.length + ' snippets');
let mismatch = 0;
for (const [name, code] of CASES) {
  const original = run(code);
  let plain, renamed;
  try {
    plain = minify(code, { file: 'snippet.js' });
    renamed = minify(code, { file: 'snippet.js', renameLocals: true });
  } catch (e) {
    ok(`compresses: ${name}`, false, e.message);
    continue;
  }
  const plainRun = run(plain.code), renamedRun = run(renamed.code);
  if (JSON.stringify(plainRun) !== JSON.stringify(original) || JSON.stringify(renamedRun) !== JSON.stringify(original)) {
    mismatch++;
    ok(`behaves the same after compression: ${name}`, false, { original, plain: plainRun, renamed: renamedRun, plain_code: plain.code, renamed_code: renamed.code });
  }
}
ok(`every one of the ${CASES.length} snippets behaves identically before and after compression, with and without renaming`, mismatch === 0, mismatch ? { mismatched: mismatch } : null);

/* The two documented exceptions, asserted as exceptions rather than hidden. */
{
  const withDebugger = 'let hit = 0; debugger; hit++; log(hit);';
  const compressed = minify(withDebugger, { file: 'd.js' });
  const kept = minify(withDebugger, { file: 'd.js', keepDebugger: true });
  ok('a `debugger` statement is dropped by default and kept with --keep-debugger (the ONLY statement the tool removes that has no effect on a program without a debugger attached)', !/debugger/.test(compressed.code) && /debugger/.test(kept.code) && compressed.passes.find((p) => p.pass === 'drop_debugger').count === 1, { code: compressed.code, kept: kept.code });
}
{
  const source = 'function make() { const impl = function () { return 1; }; return impl; } log(make().name);';
  const plain = minify(source, { file: 'n.js' });
  const renamed = minify(source, { file: 'n.js', renameLocals: true });
  ok('a binding that holds a function keeps its name, so `fn.name` is not silently changed (the binding is reported as skipped)', run(plain.code).records === run(source).records && /impl/.test(renamed.code), { renamed: renamed.code, skipped: renamed.renaming.skipped });
  ok('the same file renamed with the unsafe flag DOES change `fn.name`, and the report says the rename happened', (() => { const unsafe = minify(source, { file: 'n.js', renameLocals: true, unsafeRename: true }); return run(unsafe.code).records !== run(source).records && unsafe.renaming.renamed > 0; })(), null);
}

/* The app's own files: every one of them must compress to something that still parses and is stable. */
{
  const APP = path.join(__dirname, '..', 'extracted', 'tradejournal');
  const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!/node_modules|\.git|data/.test(p)) walk(p, out); } else if (e.name.endsWith('.js')) out.push(p); } return out; };
  const files = [...walk(path.join(APP, 'public')), ...walk(path.join(APP, 'src')), ...walk(path.join(APP, 'tools'))];
  let bytesIn = 0, bytesOut = 0, bytesRenamed = 0, bad = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    try {
      const plain = minify(source, { file: path.relative(APP, file), sourceMap: false });
      const renamed = minify(source, { file: path.relative(APP, file), sourceMap: false, renameLocals: true });
      const check = verify(source, { file: path.relative(APP, file) });
      if (!check.reparsed || !check.idempotent) bad.push(path.relative(APP, file) + ': not stable');
      bytesIn += plain.input_bytes; bytesOut += plain.output_bytes; bytesRenamed += renamed.output_bytes;
    } catch (e) { bad.push(path.relative(APP, file) + ': ' + e.message); }
  }
  ok(`every shipped JavaScript file of the app compresses, re-parses and is stable on a second pass (${files.length} files)`, bad.length === 0, bad.slice(0, 5));
  ok('the compressed app is smaller than the source, and renaming removes more bytes than compressing alone', bytesOut < bytesIn && bytesRenamed < bytesOut, { files: files.length, source_bytes: bytesIn, compressed_bytes: bytesOut, compressed_renamed_bytes: bytesRenamed, pct: Math.round((1 - bytesOut / bytesIn) * 1000) / 10, pct_renamed: Math.round((1 - bytesRenamed / bytesIn) * 1000) / 10 });
  console.log(`app corpus: ${files.length} files, ${bytesIn} -> ${bytesOut} bytes (${(100 * bytesOut / bytesIn).toFixed(1)}%), renamed ${bytesRenamed} (${(100 * bytesRenamed / bytesIn).toFixed(1)}%)`);
}

console.log(`jsmin differential: ${pass} passed, ${fail} failed`);
if (process.env.JSMIN_RESULT) fs.writeFileSync(process.env.JSMIN_RESULT, JSON.stringify({ pass, fail, results, scope: 'differential execution in V8 of a curated corpus plus every shipped app file: behaviour compared before/after compression, with assertions for the two documented exceptions (debugger removal, fn.name under an explicit unsafe rename). Not a proof over all programs and not a claim about performance.' }, null, 2) + '\n');
process.exitCode = fail ? 1 : 0;
