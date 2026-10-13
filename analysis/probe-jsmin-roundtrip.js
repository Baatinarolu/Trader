'use strict';
/**
 * probe-jsmin-roundtrip.js — the parser and the printer, measured on their own.
 *
 * The tool's first promise is that it reads real JavaScript and prints JavaScript that means the same
 * thing. That promise has three testable parts, and this probe tests all three:
 *
 *   fidelity      for every shipped file, `parse → print` then `parse → print` again is byte-identical,
 *                 and the printed text is never longer than the source;
 *   syntax        a curated corpus of the constructs that trip hand-written parsers (ASI, regex versus
 *                 division, templates with nesting, private names, `yield*`, optional chaining,
 *                 computed method keys, patterns with defaults, getters and setters, class fields);
 *   errors        invalid input produces a SyntaxError that carries a line and a column and says what
 *                 it wanted, instead of a wrong tree, a hang or a stack overflow. Nesting deeper than
 *                 the recursion limit is refused in those words rather than crashing.
 *
 * Not measured here: whether the printed code *behaves* the same — that is the differential probe's
 * job — and whether the output is smaller than a human would write: it is only ever compared with the
 * input it came from.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const JSMIN = path.join(__dirname, '..', 'extracted', 'tradejournal', 'tools', 'jsmin');
const { parse } = require(path.join(JSMIN, 'parse'));
const { emit } = require(path.join(JSMIN, 'emit'));
const { minify } = require(JSMIN);

let pass = 0, fail = 0; const results = [];
const ok = (label, v, detail) => { results.push({ label, passed: !!v, ...(!v ? { detail } : {}) }); console.log(`${v ? 'ok' : 'FAIL'} ${label}${!v ? ' ' + JSON.stringify(detail) : ''}`); v ? pass++ : fail++; };
const emitTwice = (source) => { const first = emit(parse(source), { source }).code; const second = emit(parse(first), { source: first }).code; return { first, second }; };

/* 1. every shipped file --------------------------------------------------------------------------- */
{
  const APP = path.join(__dirname, '..', 'extracted', 'tradejournal');
  const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!/node_modules|\.git|data/.test(p)) walk(p, out); } else if (e.name.endsWith('.js')) out.push(p); } return out; };
  const files = [...walk(path.join(APP, 'public')), ...walk(path.join(APP, 'src')), ...walk(path.join(APP, 'tools'))].sort();
  let bytesIn = 0, bytesOut = 0; const bad = [], grew = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const rel = path.relative(APP, file);
    try {
      const { first, second } = emitTwice(source);
      bytesIn += Buffer.byteLength(source); bytesOut += Buffer.byteLength(first);
      if (first !== second) bad.push(rel + ': a second print differs');
      if (Buffer.byteLength(first) > Buffer.byteLength(source)) grew.push(rel);
    } catch (e) { bad.push(rel + ': ' + e.message); }
  }
  ok(`every JavaScript file the app ships parses and prints twice to the same bytes (${files.length} files)`, bad.length === 0, bad.slice(0, 5));
  ok('printing never makes a file longer than it was', grew.length === 0, grew.slice(0, 5));
  ok('the whole corpus gets smaller, and the probe reports by how much', bytesOut < bytesIn && bytesOut / bytesIn < 0.85, { files: files.length, source_bytes: bytesIn, printed_bytes: bytesOut, pct: Math.round((100 * bytesOut) / bytesIn * 10) / 10 });
  console.log(`corpus: ${files.length} files, ${bytesIn} -> ${bytesOut} bytes (${((100 * bytesOut) / bytesIn).toFixed(1)}%)`);

  // The independent check: V8's own parser on every printed file. Our parser and V8 could agree with
  // each other and both be wrong about the language; they cannot both be wrong about what V8 accepts.
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsmin-v8-'));
    const rejected = [];
    for (const file of files) {
      const rel = path.relative(APP, file);
      const printed = emit(parse(fs.readFileSync(file, 'utf8')), { source: fs.readFileSync(file, 'utf8') }).code;
      const out = path.join(tmp, rel.replace(/[\\/]/g, '_'));
      fs.writeFileSync(out, printed);
      const r = spawnSync(process.execPath, ['--check', out], { encoding: 'utf8' });
      if (r.status !== 0) rejected.push({ file: rel, stderr: String(r.stderr).split('\n').slice(0, 4) });
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    ok(`every printed file is accepted by V8 itself (node --check on all ${files.length} outputs)`, rejected.length === 0, rejected.slice(0, 3));
  }
}

/* 2. the syntax corpus ---------------------------------------------------------------------------- */
const CORPUS = [
  ['empty program', ''],
  ['only a comment', '// nothing\n/* here */'],
  ['only a directive', '"use strict";'],
  ['ASI: no semicolons at all', 'const a = 1\nconst b = 2\nfunction f() { return a + b }\n'],
  ['ASI: return with a newline', 'function f() { return\n  1 }\n'],
  ['ASI: a statement starting with a paren', 'const a = {}\n;(function () { return a })()\n'],
  ['ASI: a statement starting with a bracket', 'const a = 1\nconst b = a\n[1, 2].forEach(function (v) { a + v })\n'],
  ['regex versus division', 'const r = /a[/]b/gi\nconst d = a / b / c\nconst e = (1 + 2) / 3\nif (/x/.test(s)) { f() }\n'],
  ['regex after a keyword', 'return\n/a/.test(x)\n'],
  ['division after a call', 'const v = Number(x) / 2 / 3'],
  ['nested templates', 'const t = `a${`b${c}d`}e${x ? `f` : g}`'],
  ['tagged template with an escape', 'const t = tag`a\\nb${c}\\u0041`'],
  ['a template with a dollar brace in text', 'const t = `a \\${not a hole} b`'],
  ['class with private fields and a static block', 'class A extends B { #p = 1\n static s = 2\n static { init() }\n get v() { return this.#p }\n set v(x) { this.#p = x }\n #m() { return this.#p }\n m() { return this.#m() } }\n'],
  ['computed method key and a numeric key', 'const o = { [k]() { return 1 }, 3: "three", "s": 4 }'],
  ['object with get/set, async, generator, spread', 'const o = { get a() { return 1 }, set a(v) {}, async m() {}, *g() {}, ...rest }'],
  ['patterns with defaults, rest and nesting', 'const { a = 1, b: { c } = {}, ...rest } = src\nconst [x, , y = 2, ...z] = list'],
  ['new chains', 'new a.b(c)\nnew (f())()\nnew a()\nnew a()()\nnew Date(iso).toLocaleDateString("en-GB", { day: "2-digit" })'],
  ['optional chaining and nullish', 'a?.b?.[c]?.()\nx ??= y\no?.p ?? "d"'],
  ['for await and for-of with patterns', 'async function f() { for await (const [k, v] of src) { use(k, v) } }'],
  ['for-in with var, labels and break', 'outer: for (var k in o) { if (k) { break outer } else { continue outer } }'],
  ['switch with fallthrough and default', 'switch (v) { case 1: case 2: a(); break; default: b() }'],
  ['try/catch without a binding, with finally', 'try { a() } catch { b() } finally { c() }'],
  ['generators and yield*', 'function* g() { yield 1; yield* h(); yield }'],
  ['async generators and await', 'async function* g() { await x; yield await y }'],
  ['arrow bodies that need parens', 'const a = (x) => ({ v: x })\nconst b = (x) => (x, x + 1)\nconst c = () => { return { w: 1 } }'],
  ['update and unary sequences', 'a + +b\na - -b\n- -a\n+ +b\na++ + ++b\n!a !== !!b'],
  ['`1..toString()` and a member on a number', 'const s = 1..toString()\nconst t = 0.5.toFixed(2)'],
  ['in, instanceof, delete, typeof, void', 'const a = "x" in o\nconst b = o instanceof C\ndelete o.p\nconst c = typeof u\nconst d = void 0'],
  ['a comma expression and a sequence statement', 'const a = (b, c, d)\n(b, c)'],
  ['a directive-looking string that is not a prologue', 'function f() { const x = 1\n"not a directive" }\n'],
  ['labels and a block statement', 'block: { if (a) { break block } }'],
  ['with statement', 'with (o) { p = 1 }'],
  ['a very long chain', 'a.b.c.d.e.f.g.h().i[0].j(1, 2, 3).k'],
];
{
  const bad = [];
  for (const [label, src] of CORPUS) {
    try {
      const { first, second } = emitTwice(src);
      if (first !== second) bad.push({ label, why: 'not stable', first, second });
    } catch (e) { bad.push({ label, why: e.message }); }
  }
  ok(`the syntax corpus parses and re-prints stably (${CORPUS.length} constructs)`, bad.length === 0, bad.slice(0, 4));
  {
    const moduleSource = ['const b = 1;', 'import d, { e as f2 } from "./m.js"', 'import * as ns from "./n.js"', 'export const a = 1', 'export default function f() {}', 'export { b as c }', 'export * from "./o.js"', ''].join('\n');
    const first = emit(parse(moduleSource, { sourceType: 'module' }), { source: moduleSource }).code;
    const second = emit(parse(first, { sourceType: 'module' }), { source: first }).code;
    const minified = minify(moduleSource, { file: 'm.js', sourceType: 'module', renameLocals: true, sourceMap: false });
    // Every form survives, and the two unused imports are kept as side-effect imports rather than
    // deleted: a module with no binding left still has to be evaluated when it is imported.
    const shipped = ['import "./m.js"', 'import "./n.js"', 'export const a=1', 'export default function f(){}', 'export{b as c}', 'export* from "./o.js"'].every((part) => minified.code.includes(part))
      && minified.code.indexOf('export{b as c}') < minified.code.indexOf('export* from');
    const sideEffectsKept = minify('import {unused} from "./s.js";export const k=1;', { file: 's.js', sourceType: 'module', sourceMap: false }).code;
    ok('an unused import becomes a side-effect import (`import "./s.js"`) instead of being deleted, so importing still runs the module', /^import "\.\/s\.js";export const k=1$/.test(sideEffectsKept), sideEffectsKept);
    // Verified against V8's own parser, not only against ours: the module is written out and checked.
    const moduleFile = path.join(os.tmpdir(), 'jsmin-probe-module.mjs');
    fs.writeFileSync(moduleFile, minified.code);
    const v8 = spawnSync(process.execPath, ['--check', moduleFile], { encoding: 'utf8' });
    ok('a module keeps its import and export forms through printing and through compression, an exported name is never renamed, and V8 accepts the result as a module', first === second && shipped && minified.renaming.renamed === 0 && minified.renaming.skipped.some((s2) => s2.why === 'exported') && v8.status === 0, { first, minified: minified.code, skipped: minified.renaming.skipped, v8: v8.stderr.slice(0, 200) });
  }
}

/* 3. invalid input is refused with a position ----------------------------------------------------- */
{
  const INVALID = [
    ['a missing initialiser', 'const x = ;'],
    ['an unterminated brace', 'function f() { if (a) {'],
    ['two expressions with no operator', 'a b'],
    ['a keyword where a name is needed', 'let 1 = 2'],
    ['an unterminated block comment', '/* and then'],
    ['an unterminated string', 'const s = "abc'],
    ['an unterminated template', 'const t = `abc'],
    ['an unterminated regex', 'const r = /abc'],
    ['an object literal that is never closed', 'const o = { a: 1'],
    ['a half-written arrow', 'const f = (a) =>'],
    ['a broken for head', 'for (const of xs) {}'],
    ['a bad number', 'const n = 1e'],
    ['a stray private name', '#p'],
    ['a bad optional assignment', 'a?.= 1'],
    ['a class with no body', 'class A extends'],
    ['a semicolon where a colon belongs', 'const o = { a; 1 }'],
    ['a broken call', 'f(1,,2)'],
    ['a return outside a function is legal, but `return` with a `,` is not', 'return a,'],
  ];
  const bad = [];
  for (const [label, src] of INVALID) {
    try {
      parse(src);
      bad.push({ label, why: 'parsed without complaint' });
    } catch (e) {
      // `line` is 1-based and `column` is 0-based (the source map's convention); the message shows the
      // 1-based pair, which is what the editor gutter shows a reader.
      const positioned = e instanceof SyntaxError && typeof e.line === 'number' && typeof e.column === 'number' && e.line >= 1 && e.column >= 0
        && new RegExp(`at ${e.line}:${e.column + 1}$`).test(e.message);
      const saysSomething = typeof e.message === 'string' && e.message.length > 8 && !/Maximum call stack/.test(e.message);
      if (!positioned || !saysSomething) bad.push({ label, why: 'not a positioned SyntaxError', message: e.message, line: e.line, column: e.column });
      else if (e.line > src.split('\n').length + 1) bad.push({ label, why: 'line beyond the input', line: e.line, lines: src.split('\n').length });
    }
  }
  ok(`every invalid program is refused with a SyntaxError carrying a line and a column and a message (${INVALID.length} cases)`, bad.length === 0, bad.slice(0, 4));
  {
    let line = null, column = null, message = null;
    try { parse('const a = 1;\nconst b = ;\n'); } catch (e) { line = e.line; column = e.column; message = e.message; }
    ok('the position points at the offending token on the right line, 1-based in the message and 0-based in the object', line === 2 && column === 10 && /^unexpected ";" at 2:11$/.test(message), { line, column, message });
  }
}

/* 4. deep or huge input: refuse cleanly or handle it ---------------------------------------------- */
{
  // What this tool can take, measured rather than promised. The limits are V8's stack: a recursive
  // descent parser, a recursive analyser, a recursive compressor and a recursive printer all have one.
  const measured = {};
  const refuseAt = (make, ceiling) => {
    let okDepth = 0;
    for (const n of [100, 250, 500, 1000, 1500, 2000, 3000, 5000, 10000, 20000, ceiling]) {
      try { minify(make(n), { file: 'depth.js', sourceMap: false }); okDepth = n; }
      catch (e) { return { parses_up_to: okDepth, refused_at: n, refused_with: e.name + ': ' + e.message.slice(0, 70) }; }
    }
    return { parses_up_to: okDepth, refused_at: null };
  };
  measured.parens = refuseAt((n) => '('.repeat(n) + '1' + ')'.repeat(n), 50000);
  measured.blocks = refuseAt((n) => '{'.repeat(n) + ';' + '}'.repeat(n), 50000);
  measured.chain = refuseAt((n) => Array(n).fill('x').join('+'), 50000);
  const allRefusedInWords = [measured.parens, measured.blocks, measured.chain].every((m) => m.refused_at === null || /nests? too deeply/.test(m.refused_with || ''));
  ok('a tree too deep for V8\'s stack is refused in words (a SyntaxError that says it nests too deeply), never as a raw RangeError', allRefusedInWords, measured);
  ok('the depth a hand-written file could plausibly reach is handled: 500 nested parentheses, 500 nested blocks and a 500-term chain all compress', measured.parens.parses_up_to >= 500 && measured.blocks.parses_up_to >= 500 && measured.chain.parses_up_to >= 500, measured);
  console.log('measured depth limits:', JSON.stringify(measured));

  const cases = [
    ['a 2000-term binary chain', Array(2000).fill('x').join('+'), 15000],
    ['1000 nested blocks', '{'.repeat(1000) + ';' + '}'.repeat(1000), 15000],
    ['a 40000-declaration file', 'const v$ = 1;\n'.repeat(20000), 15000],
    ['a 1 MB string literal', `const s = "${'x'.repeat(1e6)}";`, 15000],
    ['20000 comments', '// a comment\n'.repeat(20000) + 'const a = 1;', 15000],
  ];
  const timings = [];
  for (const [label, src, budgetMs] of cases) {
    const started = Date.now();
    let outcome;
    try {
      const out = minify(src, { file: 'big.js', sourceMap: false });
      outcome = { ok: true, bytes: out.output_bytes, idempotent: minify(out.code, { file: 'big.js', sourceMap: false }).code === out.code, budget_ok: Date.now() - started < budgetMs };
    } catch (e) { outcome = { ok: false, message: e.name + ': ' + e.message.slice(0, 60) }; }
    timings.push({ label, ms: Date.now() - started, ...outcome, input_bytes: Buffer.byteLength(src) });
  }
  ok('large but plausible input completes inside its time budget and is stable on a second pass', timings.every((t) => t.ok && t.idempotent && t.budget_ok), timings);
  console.log('timings:', timings.map((t) => `${t.label}: ${t.ms}ms${t.bytes ? ' -> ' + t.bytes + 'B' : ''}`).join(' | '));
  if (process.env.JSMIN_RESULT) process.env.MEASURED_DEPTH = JSON.stringify(measured);
}

/* 5. the awkward characters ----------------------------------------------------------------------- */
{
  const cases = [
    ['a byte order mark', '\uFEFFconst a = 1;'],
    ['CRLF line endings', 'const a = 1;\r\nconst b = 2;\r\n'],
    ['a line separator inside a string', 'const s = "a\\u2028b";'],
    ['an astral character in a template', 'const t = `🙂${1}`;'],
    ['an escaped identifier', 'const \\u0061bc = 1;'],
    ['a zero width joiner in a string', 'const s = "👩‍💻";'],
    ['an identifier with $ and _', 'const $a_b$ = 1;'],
  ];
  const bad = [];
  for (const [label, src] of cases) {
    try {
      const { first, second } = emitTwice(src);
      if (first !== second) bad.push({ label, why: 'not stable', first });
      // The values must survive: parse the printed text and compare the string literals found.
      const valuesOf = (text) => JSON.stringify((text.match(/"(?:[^"\\]|\\.)*"/g) || []).map((q) => { try { return JSON.parse(q); } catch { return null; } }));
      if (valuesOf(first) !== valuesOf(src)) bad.push({ label, why: 'a string literal changed', before: valuesOf(src), after: valuesOf(first) });
    } catch (e) { bad.push({ label, why: e.message }); }
  }
  ok('a BOM, CRLF, escaped identifiers, astral characters and $/_ names all survive a round trip', bad.length === 0, bad);
  {
    const src = 'const a = 1;\r\nconst b = 2;\r\n';
    const printed = emit(parse(src), { source: src, sourceMapFile: 'x.map', file: 'x.js' });
    const originalLines = printed.mappings.flat().map((s) => s[2]);
    ok('the source map counts CRLF input as two lines, not one, so its original lines are right', Math.max(...originalLines) === 1, { originalLines, code: printed.code });
  }
}

console.log(`jsmin roundtrip: ${pass} passed, ${fail} failed`);
if (process.env.JSMIN_RESULT) fs.writeFileSync(process.env.JSMIN_RESULT, JSON.stringify({ pass, fail, measured_depth_limits: process.env.MEASURED_DEPTH ? JSON.parse(process.env.MEASURED_DEPTH) : null, results, scope: 'the parser and the printer on their own: every shipped file, a curated syntax corpus, eighteen invalid programs that must be refused with a position, deep and huge input, and the awkward characters (BOM, CRLF, astral, escaped identifiers). Behavioural equivalence is the differential probe\'s job, not this one\'s.' }, null, 2) + '\n');
process.exitCode = fail ? 1 : 0;
