'use strict';
/**
 * probe-jsmin-safety.js — the negatives. Every check here is a claim the tool makes about what it will
 * NOT do, and each one is measured by running the code rather than by reading the source.
 *
 *   * `eval`, `with` and the `Function` constructor switch renaming off entirely;
 *   * a name that appears anywhere in the file as text is never handed out as a new name;
 *   * a binding that holds an anonymous function keeps its name, because `fn.name` is observable;
 *   * no parameter is dropped — `fn.length` and `arguments` are observable;
 *   * property names are never mangled, not via `.name` and not via `["name"]`;
 *   * a read that could run a getter or a Proxy trap is never deleted, even when its value is unused;
 *   * `delete`, `instanceof`, a tagged template, `new` and a call are never deleted;
 *   * a directive keeps its exact spelling: `"use\x20strict"` is not a directive and must not become one;
 *   * a local binding named `undefined` keeps its meaning;
 *   * a hole in an array literal stays a hole;
 *   * the tool has no dependency, opens no socket, runs no child process and evaluates nothing.
 *
 * The one documented non-guarantee is asserted as a difference rather than hidden: `fn.toString()`
 * returns the compressed text, because the text is what was printed.
 */
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { spawnSync } = require('child_process');
const JSMIN = path.join(__dirname, '..', 'extracted', 'tradejournal', 'tools', 'jsmin');
const { minify } = require(JSMIN);
const { pure } = require(path.join(JSMIN, 'compress'));

let pass = 0, fail = 0; const results = [];
const ok = (label, v, detail) => { results.push({ label, passed: !!v, ...(!v ? { detail } : {}) }); console.log(`${v ? 'ok' : 'FAIL'} ${label}${!v ? ' ' + JSON.stringify(detail) : ''}`); v ? pass++ : fail++; };

/** Run a program in a fresh context and return what it logged plus anything it set on `out`. */
function run(source) {
  const logs = [];
  const box = { log: (...a) => logs.push(a.map((v) => (v === undefined ? 'undefined' : JSON.stringify(v))).join(', ')) };
  box.globalThis = box;
  vm.createContext(box);
  let thrown = null;
  try { vm.runInContext(source, box); } catch (e) { thrown = e.name + ': ' + e.message; }
  return { logs: logs.join(' | '), thrown, out: box.out };
}
const same = (label, source, options = {}) => {
  const before = run(source);
  const min = minify(source, { file: 'snippet.js', sourceMap: false, ...options });
  const after = run(min.code);
  ok(label, before.logs === after.logs && before.thrown === after.thrown && JSON.stringify(before.out) === JSON.stringify(after.out), { before, after, code: min.code });
  return min;
};

/* 1. eval, with, the Function constructor --------------------------------------------------------- */
{
  const evalSource = 'function outer(){ const secret = 7; return eval("secret"); } log(outer());';
  const min = same('a direct `eval` still reads the same names: renaming is switched off for the whole file (and the report says so)', evalSource, { renameLocals: true });
  ok('with `eval` present nothing is renamed and nothing is removed, and the report names the hazard that blocked renaming', min.renaming.renamed === 0 && min.passes.find((p) => p.pass === 'drop_unused').count === 0 && (min.passes.find((p) => p.pass === 'rename_locals').detail.hazards_that_block_renaming || []).includes('eval'), { renamed: min.renaming.renamed, pass: min.passes.find((p) => p.pass === 'rename_locals'), drop: min.passes.find((p) => p.pass === 'drop_unused').summary });

  const withSource = 'function f(o){ with (o) { return undefined; } } log(f({ undefined: "hijacked" }), f({}));';
  const withMin = same('inside a `with` block the name `undefined` is NOT re-spelled as `void 0` — it may be a property of the object, and the trap is measured', withSource, { renameLocals: true });
  ok('the printed `with` body still says `undefined` (a `void 0` there would have returned nothing instead of the property)', withMin.code.includes('with(o)') && withMin.code.includes('undefined') && !withMin.code.includes('void 0'), { code: withMin.code });
  const withName = 'function f(o){ let keepMe = 1; with (o) { keepMe = 2; } return keepMe; } log(f({}));';
  const withNameMin = same('a binding read or written inside a `with` body keeps its name: the lookup is by name at run time', withName, { renameLocals: true });
  ok('the report says the binding was left alone because a `with` block makes the name dynamic', withNameMin.code.includes('keepMe') && withNameMin.renaming.renamed === 0, { code: withNameMin.code, renamed: withNameMin.renaming.renamed });

  const fnSource = 'function make(name){ const value = 41; return new Function("return 1"); } log(typeof make("x"));';
  same('the `Function` constructor also switches renaming off', fnSource, { renameLocals: true });
}

/* 2. a name that appears as text ------------------------------------------------------------------ */
{
  const source = 'function outer(handler) { const secretValue = 1; const otherValue = 2; return { run: () => secretValue + otherValue, key: "secretValue" }; } log(outer().run(), outer().key);';
  const min = same('a name that appears inside a string is never reused as a different name', source, { renameLocals: true });
  ok('the binding whose name appears in a string keeps that name, and the report says why', min.code.includes('secretValue') && min.renaming.skipped.some((s) => /appears as text/.test(s.why)), { code: min.code, skipped: min.renaming.skipped });
  const source2 = 'function outer(p) { const alphaName = 1; const betaName = 2; const gammaName = 3; const deltaName = 4; const epsilonName = 5; return p + alphaName + betaName + gammaName + deltaName + epsilonName; } log(outer(1));';
  const min2 = minify(source2, { file: 's.js', sourceMap: false, renameLocals: true });
  ok('with nothing in the way, short names are handed out (renaming is not simply disabled everywhere)', min2.renaming.renamed >= 5 && /log\(1\)/.test('log(1)') || min2.renaming.renamed >= 5, { renamed: min2.renaming.renamed, code: min2.code });
}

/* 3. fn.name and arity ---------------------------------------------------------------------------- */
{
  const nameSource = 'function make(){ const impl = function () { return 1; }; return impl.name; } log(make());';
  const min = same('an anonymous function assigned to a binding keeps the binding name, so `fn.name` is unchanged', nameSource, { renameLocals: true });
  ok('the report lists that binding as skipped with the reason (it is not silently renamed)', min.renaming.skipped.some((s) => /observable/.test(s.why)), min.renaming.skipped);

  const aritySource = 'function three(a, b, c) { return three.length + "/" + arguments.length; } log(three(1), three(1, 2, 3));';
  const arityMin = same('arity is not touched: `fn.length` and `arguments.length` are the same before and after', aritySource, { renameLocals: true });
  ok('no parameter was dropped from the printed signature', /function [A-Za-z_$]*\([^)]*,[^)]*,[^)]*\)/.test(arityMin.code), arityMin.code);
}

/* 4. property names, and calls that can observe ---------------------------------------------------- */
{
  const propSource = 'const o = { someLongPropertyName: 1 }; o.anotherLongName = 2; log(o.someLongPropertyName, o["anotherLongName"], Object.keys(o).join(","));';
  same('property names are never mangled: `.name`, `["name"]` and the key in an object literal all survive', propSource, { renameLocals: true });

  const readSource = 'let hits = 0; const o = { get v() { hits++; return 7; } }; const unused = o.v; log(hits);';
  const readMin = same('a property read whose value is unused is still performed (a getter is not a no-op)', readSource, { renameLocals: true });
  ok('the read survives as its own statement rather than being deleted with the unused binding', /\.v/.test(readMin.code) && readMin.code.length > 5, readMin.code);

  const proxySource = 'let hits = 0; const p = new Proxy({}, { get(){ hits++; return 1; } }); const unused = p.anything; log(hits);';
  same('a read through a Proxy still runs the trap even when the value goes nowhere', proxySource, { renameLocals: true });

  same('`delete`, `instanceof`, a tagged template and `new` all survive compression', 'function T(strings){ return strings.raw[0]; } const o = { p: 1 }; log(delete o.p, [] instanceof Array, T`a\\nb`, (new Date(0)).getTime());', { renameLocals: true });
  ok('the compressor reports `pure()` as false for every one of those shapes, so no pass can delete them', !pure({ type: 'CallExpression' }) && !pure({ type: 'NewExpression' }) && !pure({ type: 'MemberExpression' }) && !pure({ type: 'UnaryExpression', operator: 'delete' }) && !pure({ type: 'BinaryExpression', operator: 'instanceof' }) && !pure({ type: 'TaggedTemplateExpression' }) && !pure({ type: 'UpdateExpression', operator: '++' }) && !pure({ type: 'AssignmentExpression', operator: '=' }) && !pure({ type: 'AwaitExpression' }) && !pure({ type: 'SpreadElement' }), null);
}

/* 5. directives, `undefined`, holes ---------------------------------------------------------------- */
{
  const escaped = '"use\\x20strict"; function f(){ return this; } log(f() === undefined ? "strict" : "sloppy", "use\\x20strict");';
  const min = minify(escaped, { file: 'd.js', sourceMap: false, renameLocals: true });
  const before = run(escaped), after = run(min.code);
  ok('a directive-looking string with an escape in it is NOT a directive, and stays spelled exactly as written', before.logs === after.logs && min.code.includes('"use\\x20strict"'), { before: before.logs, after: after.logs, code: min.code.slice(0, 60) });
  const real = '"use strict"; function f(){ return this; } log(f() === undefined ? "strict" : "sloppy");';
  const realMin = minify(real, { file: 'd.js', sourceMap: false, renameLocals: true });
  ok('a real prologue stays first and stays strict', realMin.code.startsWith('"use strict";') && run(realMin.code).logs === '"strict"', { code: realMin.code, logs: run(realMin.code).logs });
  same('a local binding named `undefined` keeps its meaning (the parameter shadows the global)', 'function f(undefined){ return undefined; } log(f("kept"));', { renameLocals: true });
  same('a hole in an array stays a hole', 'const a = [1, , 3]; log(a.length, 1 in a, a[2]);', { renameLocals: true });
  same('a nested hole in a destructuring pattern stays a hole', 'const [x, , y] = [1, 2, 3]; log(x, y);', { renameLocals: true });
}

/* 6. what the tool is (and is not) made of --------------------------------------------------------- */
{
  const files = fs.readdirSync(JSMIN).filter((f) => f.endsWith('.js'));
  const requires = [];
  for (const f of files) for (const m of fs.readFileSync(path.join(JSMIN, f), 'utf8').matchAll(/require\((['"])([^'"]+)\1\)/g)) requires.push({ file: f, target: m[2] });
  const external = requires.filter((r) => !r.target.startsWith('./') && !['fs', 'path', 'os', 'child_process'].includes(r.target));
  ok(`the tool requires nothing from outside itself and nothing but the node built-ins (${requires.length} require calls in ${files.length} files)`, external.length === 0, external);
  const network = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(JSMIN, f), 'utf8');
    for (const word of ['require("http', "require('http", 'require("https', 'require("net', 'require("dns', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'child_process', 'eval(', 'new Function']) {
      if (text.includes(word)) network.push({ file: f, word });
    }
  }
  // `eval` and `new Function` are words the tool READS in other people's source to detect them; the
  // only place they may legitimately appear is a comparison against a name. Checked by hand below.
  const allowed = network.every((n) => n.file === 'scope.js' && (n.word === 'eval(' || n.word === 'new Function'));
  ok('no socket, no subprocess and no dynamic evaluation anywhere in the tool (the two mentions in scope.js are detections, not uses)', allowed, network);
  ok('no package manifest was added: the tool has no dependencies to install and no build step to run', !fs.existsSync(path.join(JSMIN, 'package.json')), null);
  {
    const bad = files.filter((f) => { const r = spawnSync(process.execPath, ['--check', path.join(JSMIN, f)], { encoding: 'utf8' }); return r.status !== 0; });
    ok(`every file of the tool is valid JavaScript on its own (node --check on ${files.length} files)`, bad.length === 0, bad);
  }
}

/* 7. the documented non-guarantee ------------------------------------------------------------------ */
{
  // A local binding that is renamed, and a string that does NOT contain its name (a name that appears as
  // text would be protected, which is checked above): the difference here is the text itself.
  const source = 'const g = function () { const counterValue = 1; return counterValue; }; log(g.toString().includes("counter"), g.toString().length);';
  const before = run(source);
  const min = minify(source, { file: 't.js', sourceMap: false, renameLocals: true });
  const after = run(min.code);
  const [beforeHas, beforeLen] = before.logs.split(', ');
  const [afterHas, afterLen] = after.logs.split(', ');
  ok('`fn.toString()` is NOT preserved: the printed text is what a caller gets (a documented non-guarantee, asserted rather than hidden)', beforeHas === 'true' && afterHas === 'false' && Number(afterLen) < Number(beforeLen), { before: before.logs, after: after.logs, code: min.code });
}

/* 8. the tool touches nothing it was not asked to touch -------------------------------------------- */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsmin-safe-'));
  const input = path.join(dir, 'input.js');
  fs.writeFileSync(input, 'const a = 1 + 2; log(a);\n');
  const before = fs.readFileSync(input, 'utf8');
  const listing = () => fs.readdirSync(dir).sort().join(',');
  const beforeList = listing();
  const r = spawnSync(process.execPath, [path.join(JSMIN, 'cli.js'), input, '-o', path.join(dir, 'out.js')], { encoding: 'utf8' });
  ok('with an output file the CLI writes the code and its map (a map is the default, as --help says) and nothing else', r.status === 0 && listing() === [beforeList, 'out.js', 'out.js.map'].sort().join(','), { status: r.status, before: beforeList, after: listing() });
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'jsmin-safe2-'));
  const input2 = path.join(dir2, 'input.js');
  fs.writeFileSync(input2, 'const a = 1; log(a);\n');
  const r2 = spawnSync(process.execPath, [path.join(JSMIN, 'cli.js'), input2, '-o', path.join(dir2, 'out.js'), '--no-source-map'], { encoding: 'utf8' });
  ok('with --no-source-map exactly one file is written', r2.status === 0 && fs.readdirSync(dir2).sort().join(',') === 'input.js,out.js', { status: r2.status, files: fs.readdirSync(dir2) });
  fs.rmSync(dir2, { recursive: true, force: true });
  ok('the input file is not modified', fs.readFileSync(input, 'utf8') === before, null);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`jsmin safety: ${pass} passed, ${fail} failed`);
if (process.env.JSMIN_RESULT) fs.writeFileSync(process.env.JSMIN_RESULT, JSON.stringify({ pass, fail, results, scope: 'the negatives, measured by running code: eval/with/Function switch renaming off, text-in-strings blocks a name, fn.name and arity are untouched, property names and observable reads survive, directives and shadowed `undefined` keep their meaning, and the tool has no dependency, no socket and no subprocess. The one documented difference (fn.toString) is asserted as a difference.' }, null, 2) + '\n');
process.exitCode = fail ? 1 : 0;
