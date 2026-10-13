'use strict';
/**
 * index.js — the library surface: `minify(source, options)` and `verify(source, options)`.
 *
 * One call does the whole job: parse, analyse, compress, print, and — when a map is asked for —
 * build the map while printing. Everything it returns is data: the code, the map, and a report that
 * says what each pass changed and what was deliberately left alone. There is no timing in the
 * report, because a report that changes between two runs of the same input cannot be diffed, and
 * this tool's output is meant to be reproducible byte for byte.
 *
 * Guarantees this module DOES make:
 *
 *   * the output is a valid program (the CLI re-parses it before writing it, unless `--no-verify`);
 *   * minifying the output again produces the same bytes (idempotent after one pass);
 *   * no call, property read, getter, `new`, tagged template, `delete`, mutation or `eval` is
 *     removed or reordered by any pass — see compress.js for what each pass will and will not do;
 *   * the source map's every mapping is written by the printer at the position it names.
 *
 * Guarantees it does NOT make, stated here rather than implied: the output is not smaller if the
 * input is already minimal; renaming changes `fn.name` for the functions it touches (which is why
 * function-valued bindings are skipped unless `unsafeRename` is asked for); a `debugger` statement
 * is removed by default; and minification is not a security boundary — it is not obfuscation, and
 * string contents are untouched.
 */
const { parse } = require('./parse');
const { analyze } = require('./scope');
const { compress } = require('./compress');
const { emit } = require('./emit');
const { decode } = require('./sourcemap');

const VERSION = 'jsmin-v1';
const SCOPE = 'A source-to-source JavaScript compressor: parse, analyse, compress, print, and a Source Map v3 written by the same printer that writes the characters. Literal folding only, no type inference, no evaluation of anything, no network, no dependency. Renaming is opt-in and never touches an exported, top-level or dynamically-reachable name.';

function byteLength(text) { return Buffer.byteLength(String(text), 'utf8'); }

/**
 * A tree deeper than V8's stack is refused in words. The analyser, the compressor and the printer all
 * walk the tree by recursion, so each of them can reach the limit on input the parser accepted.
 */
function depthGuard(stage, fn) {
  try { return fn(); }
  catch (e) {
    if (e instanceof RangeError) {
      const err = new SyntaxError(`${stage}: input nests too deeply for this tool: ` + e.message);
      err.code = 'DEPTH_LIMIT';
      err.cause = e;
      throw err;
    }
    throw e;
  }
}

function minify(source, options = {}) {
  const file = options.file || 'input.js';
  const sourceType = options.sourceType || (options.module ? 'module' : 'script');
  const sourceMapFile = options.sourceMap === false ? null : (options.sourceMapFile || (options.sourceMap ? file + '.map' : null));
  const program = parse(source, { sourceType });
  const analysis = depthGuard('analysis', () => analyze(program, { renameTopLevel: !!options.renameTopLevel, renameFunctionNames: !!options.unsafeRename }));
  const { report, renames } = depthGuard('compression', () => compress(program, { keepDebugger: !!options.keepDebugger, renameLocals: !!options.renameLocals }, analysis));
  const printed = depthGuard('printing', () => emit(program, { source, file, sourceMapFile, includeContent: options.includeContent !== false }));
  const inputBytes = byteLength(source), outputBytes = byteLength(printed.code);
  const savings = inputBytes ? Math.round(((inputBytes - outputBytes) / inputBytes) * 1000) / 10 : 0;
  const result = {
    version: VERSION,
    file,
    source_type: sourceType,
    code: printed.code,
    map: printed.map,
    input_bytes: inputBytes,
    output_bytes: outputBytes,
    savings_bytes: inputBytes - outputBytes,
    savings_pct: savings,
    passes: report,
    warnings: printed.warnings,
    renaming: options.renameLocals ? { enabled: true, renamed: renames.renamed, skipped: renames.skipped } : { enabled: false, renamed: 0, skipped: [] },
    analysis: {
      bindings: (analysis.bindings || []).length,
      references: (analysis.bindings || []).reduce((n, b) => n + b.reads + b.writes, 0),
      unresolved_names: (analysis.globals || []).length,
      hazards: analysis.hazards,
    },
    scope: SCOPE,
  };
  if (options.targetBytes) {
    result.target_bytes = Number(options.targetBytes);
    result.target_met = outputBytes <= result.target_bytes;
    result.target_gap = Math.max(0, outputBytes - result.target_bytes);
  }
  return result;
}

/**
 * Re-parse the output and minify it again: the cheap self-check the CLI runs before writing. A map is
 * always built here, even when the caller did not ask for one, because `mapping_count` is the only
 * evidence that the printer mapped what it printed.
 */
function verify(source, options = {}) {
  const file = options.file || 'input.js';
  const first = minify(source, { ...options, sourceMapFile: options.sourceMapFile || file + '.map' });
  const second = minify(first.code, { ...options, sourceMap: false, sourceMapFile: null });
  const reparsed = (() => { try { parse(first.code, { sourceType: first.source_type }); return true; } catch { return false; } })();
  const segments = first.map ? decode(first.map.mappings) : [];
  return {
    reparsed,
    idempotent: second.code === first.code,
    mapping_count: segments.reduce((n, line) => n + line.length, 0),
    mapped_lines: segments.filter((line) => line.length).length,
    names: first.map ? first.map.names.length : 0,
    output_bytes: first.output_bytes,
    second_pass_bytes: byteLength(second.code),
  };
}

module.exports = { minify, verify, VERSION, SCOPE, byteLength };
