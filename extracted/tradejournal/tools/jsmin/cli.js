#!/usr/bin/env node
'use strict';
/**
 * cli.js — the command line. `node tools/jsmin/cli.js input.js -o out.min.js --source-map`.
 *
 * Exit codes are the contract a script needs: 0 it worked, 1 the input is not valid JavaScript,
 * 2 the arguments are wrong, 3 the output was written but a requested target was not met. Nothing is
 * written unless the output re-parses and re-minifies to itself, so a failure never leaves a broken
 * file where a working one used to be.
 *
 * `--help` prints the whole contract, including what the tool will not do.
 */
const fs = require('fs');
const path = require('path');
const { minify, verify, VERSION } = require('./index');

const USAGE = `jsmin ${VERSION} — a JavaScript compressor with its own parser and source map generator.

usage: node tools/jsmin/cli.js [options] <input.js>

  -o, --out <file>          write the code here (default: stdout)
  --source-map [file]       write a Source Map v3 here (default: <out>.map; stdout: none)
  --no-source-map           no map at all
  --report <file>           write the JSON report here
  --stats                   print the report to stderr as JSON
  --rename-locals           rename local bindings (never exported, top-level or unsafe names)
  --rename-toplevel         also rename top-level bindings of a script (only safe when nothing
                            outside the file reads them)
  --unsafe-rename           also rename bindings that hold a function/class, whose .name is readable
  --keep-debugger           keep debugger statements (they are dropped by default)
  --target-bytes <n>        a goal, never a promise: the run reports whether it was met
  --no-verify               skip the re-parse and second-pass check (not recommended)
  --check                   parse only: report syntax errors, write nothing
  --stdin                   read the source from stdin (use with -o)
  -h, --help                this text

exit codes: 0 ok · 1 the input is not valid JavaScript · 2 bad arguments · 3 a requested target
            was not met (the output is still valid and is written)

The tool does not: evaluate anything, read the network, bundle, infer types, mangle property names of
objects it did not build, drop parameters (arity is observable), or claim that smaller means faster.
`;

function parseArgs(argv) {
  const out = { files: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { const v = argv[++i]; if (v === undefined) fail('missing value for ' + a); return v; };
    switch (a) {
      case '-o': case '--out': out.flags.out = next(); break;
      case '--source-map': out.flags.sourceMap = argv[i + 1] && !argv[i + 1].startsWith('-') ? next() : true; break;
      case '--no-source-map': out.flags.sourceMap = false; break;
      case '--report': out.flags.report = next(); break;
      case '--stats': out.flags.stats = true; break;
      case '--rename-locals': out.flags.renameLocals = true; break;
      case '--rename-toplevel': out.flags.renameToplevel = true; break;
      case '--unsafe-rename': out.flags.unsafeRename = true; break;
      case '--keep-debugger': out.flags.keepDebugger = true; break;
      case '--target-bytes': out.flags.targetBytes = Number(next()); break;
      case '--no-verify': out.flags.noVerify = true; break;
      case '--check': out.flags.check = true; break;
      case '--stdin': out.flags.stdin = true; break;
      case '-h': case '--help': out.flags.help = true; break;
      default:
        if (a.startsWith('-')) fail('unknown option ' + a);
        out.files.push(a);
    }
  }
  return out;
}

function fail(message) {
  process.stderr.write('jsmin: ' + message + '\n');
  process.exit(2);
}

function main() {
  const { files, flags } = parseArgs(process.argv.slice(2));
  if (flags.help || (!files.length && !flags.stdin)) { process.stdout.write(USAGE); process.exit(0); }
  const file = flags.stdin ? (files[0] || '<stdin>') : files[0];
  if (!flags.stdin && files.length > 1) fail('one input file at a time');
  const source = flags.stdin ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');

  if (flags.check) {
    try {
      minify(source, { file, sourceMap: false });
      process.stdout.write(`${file}: ok\n`);
      process.exit(0);
    } catch (e) {
      process.stderr.write(`${file}:${e.line || '?'}:${e.column || '?'}: ${e.message}\n`);
      process.exit(1);
    }
  }

  const sourceMapFile = flags.sourceMap === false ? null : (flags.sourceMap && flags.sourceMap !== true ? flags.sourceMap : (flags.out ? flags.out + '.map' : null));
  let result;
  try {
    result = minify(source, {
      file, sourceMapFile, keepDebugger: flags.keepDebugger, renameLocals: flags.renameLocals,
      renameToplevel: flags.renameToplevel, unsafeRename: flags.unsafeRename, targetBytes: flags.targetBytes,
    });
  } catch (e) {
    process.stderr.write(`${file}:${e.line || '?'}:${e.column || '?'}: ${e.message}\n`);
    process.exit(1);
  }

  if (!flags.noVerify) {
    const check = verify(source, { file, sourceMap: false, keepDebugger: flags.keepDebugger, renameLocals: flags.renameLocals, renameToplevel: flags.renameToplevel, unsafeRename: flags.unsafeRename });
    if (!check.reparsed || !check.idempotent) {
      process.stderr.write(`jsmin: refusing to write ${flags.out || 'stdout'}: the output did not re-parse${check.reparsed ? '' : ' (syntax)'}${check.idempotent ? '' : ' or was not stable on a second pass'}\n`);
      process.exit(1);
    }
    result.verified = { reparsed: check.reparsed, idempotent: check.idempotent, mappings: check.mapping_count };
  }

  if (result.map) {
    const mapFile = sourceMapFile || null;
    if (mapFile) fs.writeFileSync(mapFile, JSON.stringify(result.map));
    else process.stderr.write('jsmin: a map was built but there is nowhere to write it (use -o or --source-map <file>)\n');
  }
  const body = result.map && sourceMapFile ? result.code + `\n//# sourceMappingURL=${path.basename(sourceMapFile)}\n` : result.code;
  if (flags.out) fs.writeFileSync(flags.out, body); else process.stdout.write(body);
  if (flags.report) fs.writeFileSync(flags.report, JSON.stringify(result, null, 2) + '\n');
  if (flags.stats) process.stderr.write(JSON.stringify({ pass: result.passes, input_bytes: result.input_bytes, output_bytes: result.output_bytes, savings_pct: result.savings_pct, verified: result.verified || null, target: result.target_bytes === undefined ? null : { bytes: result.target_bytes, met: result.target_met, gap: result.target_gap } }, null, 2) + '\n');
  else process.stderr.write(`jsmin: ${result.input_bytes} -> ${result.output_bytes} bytes (${result.savings_pct}% smaller)${flags.out ? ' -> ' + flags.out : ''}\n`);
  if (result.target_bytes !== undefined && !result.target_met) {
    process.stderr.write(`jsmin: --target-bytes ${result.target_bytes} was NOT met: ${result.target_gap} bytes over. The output is valid and was written; no pass was relaxed to hit a number.\n`);
    process.exit(3);
  }
  process.exit(0);
}

if (require.main === module) main();
module.exports = { main, parseArgs, USAGE };
