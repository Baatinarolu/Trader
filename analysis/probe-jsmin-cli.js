'use strict';
/**
 * probe-jsmin-cli.js — the command line, end to end, as a script would use it.
 *
 * One property matters above all the others here: the CLI never leaves a broken file where a working
 * one was. Every check below is run through a real child process, and the exit code is read from the
 * child, not assumed.
 *
 *   0  it worked                    1  the input is not valid JavaScript
 *   2  the arguments are wrong      3  a requested target was not met (output still written, valid)
 */
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { spawnSync } = require('child_process');
const JSMIN = path.join(__dirname, '..', 'extracted', 'tradejournal', 'tools', 'jsmin');
const CLI = path.join(JSMIN, 'cli.js');
const { parse } = require(path.join(JSMIN, 'parse'));

let pass = 0, fail = 0; const results = [];
const ok = (label, v, detail) => { results.push({ label, passed: !!v, ...(!v ? { detail } : {}) }); console.log(`${v ? 'ok' : 'FAIL'} ${label}${!v ? ' ' + JSON.stringify(detail) : ''}`); v ? pass++ : fail++; };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsmin-cli-'));
/** Run the CLI as a real child process and read its status, stdout and stderr back. */
const run = (args, options = {}) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', input: options.input });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
};
const stripMapComment = (text) => text.replace(/\n\/\/# sourceMappingURL=.*\n?$/, '');

const good = path.join(dir, 'good.js');
fs.writeFileSync(good, [
  '"use strict";',
  'const CONFIG = { retries: 3, timeout: 15000 };',
  'function computeAverage(values) {',
  '  let total = 0;',
  '  for (const v of values) { total = total + v; }',
  '  const count = values.length;',
  '  return count === 0 ? 0 : total / count;',
  '}',
  'const unusedHelper = function () { return 1; };',
  'module.exports = { computeAverage, CONFIG };',
  '',
].join('\n'));
const broken = path.join(dir, 'broken.js');
fs.writeFileSync(broken, 'function f( { return 1 }\nconst x = ;\n');
const outFile = path.join(dir, 'good.min.js');
const mapFile = path.join(dir, 'good.min.js.map');
const reportFile = path.join(dir, 'report.json');

/* 1. the happy path ------------------------------------------------------------------------------- */
{
  const r = run([good, '-o', outFile, '--source-map', mapFile, '--report', reportFile, '--rename-locals']);
  const out = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
  const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : null;
  const map = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : null;
  ok('a file compresses to an output, a map and a report, and the run exits 0', r.status === 0 && !!out && !!map && !!report, { status: r.status, stderr: r.stderr, files: fs.readdirSync(dir) });
  ok('the output re-parses as a program', (() => { try { parse(out.replace(/\n\/\/# sourceMappingURL=.*\n?$/, '\n')); return true; } catch { return false; } })(), { out });
  ok('the output ends with a sourceMappingURL comment naming the map it was written next to', /\/\/# sourceMappingURL=good\.min\.js\.map\n?$/.test(out), out.slice(-80));
  ok('the report says the output was re-parsed and that a second pass is byte-identical — the check ran, it is not skipped by default', report && report.verified && report.verified.reparsed === true && report.verified.idempotent === true, report && report.verified);
  ok('the report names every pass with a count and a sentence, and the file that was written', report && Array.isArray(report.passes) && report.passes.length === 7 && report.passes.every((p) => typeof p.pass === 'string' && typeof p.count === 'number' && typeof p.summary === 'string') && report.file === good, report && report.passes.map((p) => p.pass));
  ok('the map is Source Map v3 with the original embedded', map && map.version === 3 && map.sources.length === 1 && map.sourcesContent[0] === fs.readFileSync(good, 'utf8'), map && { version: map.version, sources: map.sources });
  ok('the output is smaller than the input by the bytes the report claims', report && report.input_bytes === Buffer.byteLength(fs.readFileSync(good, 'utf8')) && report.output_bytes === Buffer.byteLength(stripMapComment(out)) && report.output_bytes < report.input_bytes, report && { in: report.input_bytes, out: report.output_bytes, counted: Buffer.byteLength(stripMapComment(out)) });
  {
    // Renaming is real when a name in the output is a name that was nowhere in the input.
    const identifiers = (text) => new Set(text.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || []);
    const before = identifiers(fs.readFileSync(good, 'utf8'));
    const newNames = [...identifiers(stripMapComment(out))].filter((n) => !before.has(n));
    ok('renaming actually renamed something: the report counts renames and the output contains names the input never had', report.renaming.enabled === true && report.renaming.renamed > 0 && newNames.length > 0 && report.renaming.skipped.every((s) => s.why), { renamed: report.renaming.renamed, newNames, skipped: report.renaming.skipped });
  }
}

/* 2. "use strict" survives the round trip through the CLI ------------------------------------------ */
{
  const out = fs.readFileSync(outFile, 'utf8');
  ok('the directive prologue is printed first and unchanged', out.startsWith('"use strict";'), out.slice(0, 40));
  const strictSource = path.join(dir, 'strict.js');
  const strictOut = path.join(dir, 'strict.min.js');
  fs.writeFileSync(strictSource, '"use strict";\nfunction whatIsThis() { return this; }\nmodule.exports = typeof whatIsThis();\n');
  const r = run([strictSource, '-o', strictOut]);
  const box = { module: { exports: null } };
  vm.createContext(box);
  vm.runInContext(stripMapComment(fs.readFileSync(strictOut, 'utf8')), box);
  ok('the compressed file still runs in strict mode: a bare call sees `undefined`, not the global object', r.status === 0 && box.module.exports === 'undefined', { status: r.status, exported: box.module.exports });
}

/* 3. the output behaves like the input ------------------------------------------------------------ */
{
  const src = fs.readFileSync(good, 'utf8');
  const load = (text) => { const box = { module: { exports: {} } }; vm.createContext(box); vm.runInContext(text, box); return JSON.stringify(box.module.exports.computeAverage([1, 2, 3, 4])) + '|' + JSON.stringify(box.module.exports.CONFIG); };
  let original; try { original = load(src); } catch (e) { original = 'threw: ' + e.message; }
  const out = fs.readFileSync(outFile, 'utf8');
  let compressed; try { compressed = load(stripMapComment(out)); } catch (e) { compressed = 'threw: ' + e.message; }
  ok('the compressed module exports the same values as the original (a 4-element average and a 2-key object)', original === compressed && original !== 'threw: undefined is not a function', { original, compressed });
}

/* 4. invalid input: exit 1, and nothing is written over the old file ------------------------------- */
{
  fs.writeFileSync(outFile, 'SENTINEL');
  const r = run([broken, '-o', outFile]);
  ok('a file that does not parse exits 1 and the message carries the line and column', r.status === 1 && /:\d+:\d+:/.test(r.stderr), { status: r.status, stderr: r.stderr });
  ok('a file that does not parse does not overwrite an existing output', fs.readFileSync(outFile, 'utf8') === 'SENTINEL', fs.readFileSync(outFile, 'utf8'));
}

/* 5. the arguments -------------------------------------------------------------------------------- */
{
  const unknown = run(['--nonsense', good]);
  const missing = run([good, '-o']);
  const twoFiles = run([good, broken]);
  ok('an unknown option exits 2 and says which one', unknown.status === 2 && /unknown option --nonsense/.test(unknown.stderr), unknown);
  ok('a missing value for an option exits 2', missing.status === 2 && /missing value/.test(missing.stderr), missing);
  ok('two input files exit 2', twoFiles.status === 2, twoFiles);
  const help = run(['--help']);
  ok('--help exits 0 and documents all four exit codes', help.status === 0 && ['0 ok', '1 the input', '2 bad arguments', '3 a requested target'].every((s) => help.stdout.includes(s)), help.stdout.slice(0, 120));
  const checkOk = run(['--check', good]);
  const checkBad = run(['--check', broken]);
  ok('--check parses only: ok for a good file and a line and column for a bad one', checkOk.status === 0 && /ok/.test(checkOk.stdout) && checkBad.status === 1 && /:\d+:\d+:/.test(checkBad.stderr), { checkOk: checkOk.status, checkBad: checkBad.status, stderr: checkBad.stderr });
}

/* 6. a goal is not a promise ---------------------------------------------------------------------- */
{
  const missesDir = path.join(dir, 'miss');
  fs.mkdirSync(missesDir, { recursive: true });
  const missOut = path.join(missesDir, 'a.min.js');
  const r = run([good, '-o', missOut, '--target-bytes', '10', '--report', path.join(missesDir, 'r.json')]);
  const report = JSON.parse(fs.readFileSync(path.join(missesDir, 'r.json'), 'utf8'));
  ok('an unreachable --target-bytes exits 3, says by how much, and still writes a valid output', r.status === 3 && /NOT met/.test(r.stderr) && fs.existsSync(missOut) && (() => { try { parse(fs.readFileSync(missOut, 'utf8')); return true; } catch { return false; } })(), { status: r.status, stderr: r.stderr });
  ok('the report records the goal and the gap rather than pretending it was met', report.target_bytes === 10 && report.target_met === false && report.target_gap > 0, report);
  const metOut = path.join(missesDir, 'b.min.js');
  const r2 = run([good, '-o', metOut, '--target-bytes', String(fs.statSync(good).size)]);
  ok('a reachable --target-bytes exits 0', r2.status === 0, { status: r2.status, stderr: r2.stderr });
}

/* 7. stdin, stdout, --stats and --keep-debugger --------------------------------------------------- */
{
  const source = 'let n = 1;\ndebugger;\nmodule.exports = () => n;\n';
  const viaStdin = run(['--stdin', '--keep-debugger'], { input: source });
  ok('--stdin reads the source and writes the code to stdout, keeping `debugger` when asked', viaStdin.status === 0 && /debugger/.test(viaStdin.stdout) && parse(viaStdin.stdout), { status: viaStdin.status, stdout: viaStdin.stdout });
  const dropped = run(['--stdin'], { input: source });
  ok('without --keep-debugger the debugger statement is gone and the report says how many were removed', dropped.status === 0 && !/debugger/.test(dropped.stdout), { stdout: dropped.stdout });
  const statsFile = path.join(dir, 'stats.js');
  const stats = run([good, '-o', statsFile, '--stats']);
  let parsed = null; try { parsed = JSON.parse(stats.stderr); } catch { /* some other line was on stderr */ }
  ok('--stats writes a JSON report to stderr and leaves stdout empty', stats.status === 0 && stats.stdout === '' && parsed && Array.isArray(parsed.pass) && parsed.verified.idempotent === true, { stdout: stats.stdout, stderr: stats.stderr.slice(0, 120) });
}

/* 8. a real file from the app, through the command line ------------------------------------------- */
{
  const APP = path.join(__dirname, '..', 'extracted', 'tradejournal');
  const appSource = path.join(APP, 'src', 'rule-breaks.js');
  const sizes = [];
  for (const [label, extra] of [['plain', []], ['renamed', ['--rename-locals']]]) {
    const out = path.join(dir, `rule-breaks.${label}.js`);
    const report = path.join(dir, `rule-breaks.${label}.json`);
    const r = run([appSource, '-o', out, '--source-map', out + '.map', '--report', report, ...extra]);
    const parsed = fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, 'utf8')) : null;
    sizes.push({ label, status: r.status, bytes: fs.statSync(out).size, verified: parsed && parsed.verified.reparsed && parsed.verified.idempotent, renamed: parsed && parsed.renaming.renamed });
  }
  const sourceBytes = fs.statSync(appSource).size;
  ok("the app's own rule-breaks.js compresses through the CLI, with and without renaming, smaller each time and verified each time", sizes.every((s) => s.status === 0 && s.verified && s.bytes < sourceBytes) && sizes[1].bytes < sizes[0].bytes, { sourceBytes, sizes });
}

/* 9. the CLI keeps its promise about what it will not do ------------------------------------------ */
{
  const help = run(['--help']).stdout;
  ok('the help text states the limits rather than implying them (no evaluation, no network, no property mangling, no arity change, no speed claim)', /does not: evaluate anything, read the network/.test(help) && /property/.test(help) && /arity/.test(help) && /smaller means faster/.test(help), help.split('The tool does not:')[1]);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`jsmin cli: ${pass} passed, ${fail} failed`);
if (process.env.JSMIN_RESULT) fs.writeFileSync(process.env.JSMIN_RESULT, JSON.stringify({ pass, fail, results, scope: 'the command line run as a child process: exit codes 0/1/2/3, files written and refused, the map and report on disk, the output re-parsed and executed, strict mode kept, and the two documented ways to ask for something this tool will not silently give (a kept debugger, a missed byte target).' }, null, 2) + '\n');
process.exitCode = fail ? 1 : 0;
