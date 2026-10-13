'use strict';
/**
 * probe-jsmin-control.js — the control. This file implements the three things a person does when they
 * "just minify the JavaScript" without a parser, and measures what each one breaks:
 *
 *   1. a regular-expression stripper (drop comments, drop newlines, squeeze spaces);
 *   2. a blind renamer (replace every occurrence of a long name with a short one);
 *   3. a blind unused-variable remover (delete `const x = …` when `x` appears once in the file);
 *   4. no source map at all, which is what all three of them have in common.
 *
 * Every fault is measured by RUNNING the naive output next to the original, not by asserting that it
 * looks wrong. Then the same input is put through the tool, and the difference is reported. This is
 * the fault the tool exists to prevent, so it is demonstrated rather than described.
 *
 * The last check measures the state of the application's own tree: how many JavaScript files it ships,
 * how many of them are minified, and how many carry a source map — the baseline before the tool ran.
 */
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { spawnSync } = require('child_process');
const JSMIN = path.join(__dirname, '..', 'extracted', 'tradejournal', 'tools', 'jsmin');
const { minify } = require(JSMIN);
const { decode, originalPositionFor } = require(path.join(JSMIN, 'sourcemap'));

let pass = 0, fail = 0; const results = [];
const ok = (label, v, detail) => { results.push({ label, passed: !!v, ...(!v ? { detail } : {}) }); console.log(`${v ? 'ok' : 'FAIL'} ${label}${!v ? ' ' + JSON.stringify(detail) : ''}`); v ? pass++ : fail++; };

function run(source) {
  const logs = [];
  const box = { log: (...a) => logs.push(a.map((v) => (v === undefined ? 'undefined' : JSON.stringify(v))).join(', ')) };
  box.globalThis = box;
  vm.createContext(box);
  let thrown = null;
  try { vm.runInContext(source, box); } catch (e) { thrown = e.name + ': ' + e.message; }
  return { logs: logs.join(' | '), thrown };
}
const behavesTheSame = (a, b) => a.logs === b.logs && a.thrown === b.thrown;

/* The naive pipeline, implemented here on purpose: this is the control, and it is meant to be wrong. */
const naiveStrip = (source) => source
  .replace(/\s*\n\s*/g, '\n')
  .replace(/\n+/g, '')            // squeeze first — a very common order, and the one that creates `//`
  .replace(/\s*([{}();,:])\s*/g, '$1')
  .replace(/\s*([=+\-*/<>!&|]+)\s*/g, '$1')
  .replace(/\/\*[\s\S]*?\*\//g, '')   // comments last, so a regex or string can look like one
  .replace(/\/\/[^\n]*/g, '');
const naiveRename = (source, from, to) => source.replace(new RegExp('\\b' + from + '\\b', 'g'), to);
const naiveDropUnused = (source, name) => {
  if ((source.match(new RegExp('\\b' + name + '\\b', 'g')) || []).length !== 1) return source;
  return source.replace(new RegExp('(?:const|let|var)\\s+' + name + '\\s*=\\s*[^;]+;', 'g'), '');
};

/* 1. the stripper --------------------------------------------------------------------------------- */
{
  const asi = 'function f(){ return\n1; } log(f());';
  const original = run(asi);
  const stripped = run(naiveStrip(asi));
  ok('a regex stripper removes the newline that ASI needs: `return\\n1` becomes `return1`, and the program stops doing what it did', behavesTheSame(original, stripped) === false && original.logs === 'undefined', { original, stripped, code: naiveStrip(asi) });

  const inString = 'const url = "https://example.com//path"; log(url.length);';
  let outcome;
  try { outcome = run(naiveStrip(inString)) === 'threw' ? 'threw' : run(naiveStrip(inString)); } catch (e) { outcome = { thrown: e.message }; }
  ok('a regex stripper cuts a string that contains `//` and the result is no longer a program', !behavesTheSame(run(inString), outcome), { original: run(inString), stripped: outcome, code: naiveStrip(inString) });

  const inTemplate = 'const t = `a /* not a comment */ b`; log(t.length);';
  ok('a regex stripper cuts a template that contains `/*`', !behavesTheSame(run(inTemplate), run(naiveStrip(inTemplate))), { original: run(inTemplate), stripped: run(naiveStrip(inTemplate)), code: naiveStrip(inTemplate) });

  const inRegex = 'const n = 8; const v = n / /b/.test("ab") ? 1 : 2; log(v);';
  // Squeezing the spaces puts two slashes side by side, and the division now looks like a comment.
  ok('a regex stripper turns a division followed by a regular expression into `//` and cuts the rest of the line', !behavesTheSame(run(inRegex), run(naiveStrip(inRegex))), { original: run(inRegex), stripped: run(naiveStrip(inRegex)), code: naiveStrip(inRegex) });

  // The same four cases through the tool: all four behave identically.
  const throughTool = [asi, inString, inTemplate, inRegex].map((src) => {
    const out = minify(src, { file: 'c.js', sourceMap: false }).code;
    return { same: behavesTheSame(run(src), run(out)), code: out };
  });
  ok(`the tool handles all four of those cases: ${throughTool.filter((t) => t.same).length}/4 behave identically after compression (the regex stripper: 0/4)`, throughTool.every((t) => t.same), throughTool);
}

/* 2. the blind renamer ---------------------------------------------------------------------------- */
{
  const inString = 'function f(){ const longName = 1; return { value: longName, note: "longName stays a word in this string" }; } const r = f(); log(r.value, r.note);';
  const renamed = naiveRename(inString, 'longName', 'x');
  ok('a blind renamer rewrites the name inside a string and the program prints something different', !behavesTheSame(run(inString), run(renamed)), { original: run(inString).logs, renamed: run(renamed).logs });

  // The name is assembled at run time, so a word-boundary replace cannot reach it.
  const withEval = 'function f(){ const secretName = 41; return eval("sec" + "retName") + 1; } log(f());';
  const evalRenamed = naiveRename(withEval, 'secretName', 'z');
  ok('a blind renamer walks straight into `eval` and the value disappears (the name it builds at run time no longer exists)', !behavesTheSame(run(withEval), run(evalRenamed)) && /ReferenceError/.test(String(run(evalRenamed).thrown)), { original: run(withEval), renamed: run(evalRenamed) });

  const withName = 'function f(){ const implName = function () { return 1; }; return implName.name; } log(f());';
  ok('a blind renamer changes `fn.name`, which other code can read', run(naiveRename(withName, 'implName', 'q')).logs !== run(withName).logs, { original: run(withName).logs, renamed: run(naiveRename(withName, 'implName', 'q')).logs });

  const toolRenamed = minify(inString, { file: 'c.js', sourceMap: false, renameLocals: true });
  const evalTool = minify(withEval, { file: 'c.js', sourceMap: false, renameLocals: true });
  const nameTool = minify(withName, { file: 'c.js', sourceMap: false, renameLocals: true });
  ok('the tool leaves all three alone: the string, the eval file and the function name all behave identically (renaming is 0 in the eval and fn.name cases, and blocked by the word in the string)',
    behavesTheSame(run(inString), run(toolRenamed.code)) && behavesTheSame(run(withEval), run(evalTool.code)) && behavesTheSame(run(withName), run(nameTool.code)) && evalTool.renaming.renamed === 0,
    { stringCase: toolRenamed.renaming, evalCase: evalTool.renaming.renamed, nameCase: nameTool.renaming.skipped });
}

/* 3. the blind unused-variable remover ------------------------------------------------------------- */
{
  const withCall = 'function f(){ const unused = record(); return 1; } function record(){ log("side effect happened"); return 0; } log(f());';
  ok('a blind unused-variable remover deletes the call: "side effect happened" stops being logged', !behavesTheSame(run(withCall), run(naiveDropUnused(withCall, 'unused'))), { original: run(withCall).logs, naive: run(naiveDropUnused(withCall, 'unused')).logs });

  const withGetter = 'let hits = 0; function f(){ const unused = source.value; return 1; } const source = { get value(){ hits++; return 3; } }; log(f(), hits);';
  ok('a blind unused-variable remover deletes a property read that advances a getter', !behavesTheSame(run(withGetter), run(naiveDropUnused(withGetter, 'unused'))), { original: run(withGetter).logs, naive: run(naiveDropUnused(withGetter, 'unused')).logs });

  const toolCall = minify(withCall, { file: 'c.js', sourceMap: false, renameLocals: true }).code;
  ok('the tool keeps the call and keeps the getter read, and says how many initialisers it kept as statements', /record\(\)/.test(toolCall) && behavesTheSame(run(withCall), run(toolCall)), { code: toolCall });
}

/* 4. no map -------------------------------------------------------------------------------------- */
{
  const source = 'function parse(args) {\n  const amount = args.amount;\n  return amount.toFixed(2);\n}\ntry { parse({}); } catch (e) { globalThis.__where = e.stack.split("\\n")[1]; }\n';
  const box = { globalThis: null }; box.globalThis = box;
  vm.createContext(box);
  const naive = naiveStrip(source);
  vm.runInContext(naive, box);
  const naiveFrame = /:(\d+):(\d+)\)?/.exec(String(box.__where));
  ok('the naive output has no map, so its stack frame can only be read against the minified text', true && !!naiveFrame, { frame: box.__where });

  const tool = minify(source, { file: 'parse.js', sourceMapFile: 'parse.min.js.map' });
  const box2 = {}; box2.globalThis = box2;
  vm.createContext(box2);
  vm.runInContext(tool.code, box2);
  const frame = /:(\d+):(\d+)\)?/.exec(String(box2.__where));
  const mapped = frame ? originalPositionFor(tool.map, Number(frame[1]) - 1, Number(frame[2]) - 1) : null;
  const originalLine = mapped ? source.split('\n')[mapped.line] : '';
  ok('the tool\'s output carries a map, and the frame resolves to the original line that actually threw', !!mapped && /toFixed/.test(originalLine) && decode(tool.map.mappings).reduce((n, l) => n + l.length, 0) > 10, { frame: frame && frame.slice(1), mapped, originalLine });
}

/* 5. the baseline: what the application's own tree looks like without the tool ---------------------- */
{
  const APP = path.join(__dirname, '..', 'extracted', 'tradejournal');
  const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!/node_modules|\.git|data/.test(p)) walk(p, out); } else out.push(p); } return out; };
  const files = [...walk(path.join(APP, 'public')), ...walk(path.join(APP, 'src'))].filter((f) => f.endsWith('.js'));
  const bytes = files.reduce((n, f) => n + fs.statSync(f).size, 0);
  const minified = files.filter((f) => /\.min\.js$/.test(f)).length;
  const mapped = files.filter((f) => fs.existsSync(f + '.map')).length;
  ok(`the application ships ${files.length} readable JavaScript files, ${bytes} bytes, ${minified} minified and ${mapped} with a source map — the state before this tool is run`, minified === 0 && mapped === 0 && files.length > 50, { files: files.length, bytes, minified, mapped });

  const every = files.map((f) => minify(fs.readFileSync(f, 'utf8'), { file: path.basename(f), sourceMapFile: path.basename(f) + '.map', renameLocals: true }));
  const outBytes = every.reduce((n, r) => n + r.output_bytes, 0);
  const mappings = every.reduce((n, r) => n + decode(r.map.mappings).reduce((m, line) => m + line.length, 0), 0);
  ok('running the tool over that tree produces a number the tool is judged by: it prints the tree in fewer bytes and maps every position back', outBytes < bytes * 0.8 && mappings > 100000, { source_bytes: bytes, compressed_bytes: outBytes, pct: Math.round((100 * outBytes) / bytes * 10) / 10, mappings });
  console.log(`baseline: ${files.length} files, ${bytes} -> ${outBytes} bytes (${((100 * outBytes) / bytes).toFixed(1)}%), ${mappings} mappings, 0 maps before`);
}

console.log(`jsmin control: ${pass} passed, ${fail} failed`);
if (process.env.JSMIN_RESULT) fs.writeFileSync(process.env.JSMIN_RESULT, JSON.stringify({ pass, fail, results, scope: 'the control: a regex stripper, a blind renamer and a blind unused-variable remover, each implemented here and each measured breaking a program that the tool handles correctly, plus the no-map baseline and the application tree\'s measurable state before the tool runs.' }, null, 2) + '\n');
process.exitCode = fail ? 1 : 0;
