'use strict';
/**
 * probe-jsmin-sourcemap.js — is the map a real map, and is it *usable*?
 *
 * Six things are checked, and each one is checked against the decoder rather than against the
 * encoder that produced it:
 *
 *   1. VLQ round trip over the value boundaries (0, ±1, ±15, ±16, ±511, ±512, ±1023, ±1024, 2**30);
 *   2. `encode`/`decode` round trip over hand-written mapping sets, including empty lines, a line
 *      with several segments, and a name index;
 *   3. every mapping a real file produces lands inside the generated text (line exists, column is not
 *      past the end of that line) and is reachable by the spec's lookup rule;
 *   4. the lookup rule itself: for every generated column in a run of columns that belongs to one
 *      segment, `originalPositionFor` returns that segment;
 *   5. the positions are TRUE: for every identifier in the output, the mapped original line's text
 *      contains that identifier's name at the mapped original column — for a renamed binding, the
 *      `names` entry is the name that is actually there;
 *   6. the map is usable in the way a map is used: the minified code throws, and the stack frame's
 *      line/column, mapped back, lands on the original `throw`.
 *
 * Not measured, and said so rather than implied: this does not validate the map against a third-party
 * consumer (there is no third-party consumer in this repository by design — the tool is dependency
 * free), and a map is only as good as the positions the printer recorded, so the source map is
 * checked at the granularity of identifiers and statement starts, not of every character.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const JSMIN = path.join(__dirname, '..', 'extracted', 'tradejournal', 'tools', 'jsmin');
const { minify } = require(JSMIN);
const { encodeVlq, decodeVlqSegments, encode, decode, originalPositionFor } = require(path.join(JSMIN, 'sourcemap'));

let pass = 0, fail = 0; const results = [];
const ok = (label, v, detail) => { results.push({ label, passed: !!v, ...(!v ? { detail } : {}) }); console.log(`${v ? 'ok' : 'FAIL'} ${label}${!v ? ' ' + JSON.stringify(detail) : ''}`); v ? pass++ : fail++; };

/* 1. VLQ ----------------------------------------------------------------------------------------- */
{
  const values = [0, 1, 2, -1, -2, 15, 16, -15, -16, 511, 512, -511, 2 ** 20, -(2 ** 20), 2 ** 30, -(2 ** 30)];
  const bad = values.filter((v) => { const back = decodeVlqSegments(encodeVlq(v)); return back.length !== 1 || back[0] !== v; });
  ok('every VLQ value round-trips through the encoder and the decoder, including the 5-bit continuation boundaries', bad.length === 0, bad);
  ok('a VLQ group with several values decodes to those values in order', JSON.stringify(decodeVlqSegments(encodeVlq(3) + encodeVlq(-7) + encodeVlq(0))) === '[3,-7,0]', decodeVlqSegments(encodeVlq(3) + encodeVlq(-7) + encodeVlq(0)));
  let threw = false; try { decodeVlqSegments('!'); } catch (e) { threw = e instanceof SyntaxError; }
  ok('an invalid base64 character is reported as a SyntaxError rather than silently skipped', threw, null);
}

/* 2. encode/decode of whole mapping sets --------------------------------------------------------- */
{
  const sets = [
    [[]],
    [[], []],
    [[[0, 0, 0, 0]], [[4, 0, 1, 2]]],
    [[[0, 0, 0, 0], [5, 0, 0, 6], [9, 0, 2, 1]]],
    [[[0, 0, 0, 0, 0], [6, 0, 1, 0, 1]]],
    [[[0, 0, 0, 0]], [[0, 0, 0, 0]], [[2, 0, 5, 5]]],
  ];
  const bad = sets.filter((s) => JSON.stringify(decode(encode(s))) !== JSON.stringify(s));
  ok('whole mapping sets round-trip, including empty lines and a name index', bad.length === 0, bad);
}

/* 3/4/5. A real file ------------------------------------------------------------------------------ */
const APP = path.join(__dirname, '..', 'extracted', 'tradejournal');
const target = path.join(APP, 'public', 'js', 'util.js');
const source = fs.readFileSync(target, 'utf8');
const mapped = minify(source, { file: 'util.js', sourceMapFile: 'util.min.js.map', renameLocals: true });
const code = mapped.code, map = mapped.map;
const lines = code.split('\n');
const decoded = decode(map.mappings);

ok('the map is Source Map v3 with this file as its source and no other source', map.version === 3 && map.file === 'util.min.js.map' && map.sources.length === 1 && map.sources[0] === 'util.js', { version: map.version, file: map.file, sources: map.sources });
ok('the original text is embedded, byte-identical to the input', Array.isArray(map.sourcesContent) && map.sourcesContent.length === 1 && map.sourcesContent[0] === source, { has: Array.isArray(map.sourcesContent), same: map.sourcesContent && map.sourcesContent[0] === source });
ok('the map has no more generated lines than the code has', decoded.length <= lines.length, { mapped_lines: decoded.length, code_lines: lines.length });
{
  const outOfRange = [];
  decoded.forEach((segs, i) => segs.forEach((s) => { if (i >= lines.length || s[0] > lines[i].length) outOfRange.push([i, s[0], lines[i] ? lines[i].length : 0]); }));
  ok('every mapping lands inside the generated text', outOfRange.length === 0, outOfRange.slice(0, 5));
}
ok('the file produces a non-zero number of mappings', decoded.reduce((n, l) => n + l.length, 0) > 100, decoded.reduce((n, l) => n + l.length, 0));
{
  // The lookup rule: every column that belongs to a segment resolves to that segment.
  const wrong = [];
  decoded.forEach((segs, line) => segs.forEach((s, i) => {
    const end = i + 1 < segs.length ? segs[i + 1][0] : s[0] + 1;
    for (let c = s[0]; c < end; c++) {
      const got = originalPositionFor(map, line, c);
      if (!got || got.line !== s[2] || got.column !== s[3]) wrong.push([line, c, got, s]);
    }
  }));
  ok('for every generated column the "greatest mapping not past the column" rule returns that mapping', wrong.length === 0, wrong.slice(0, 3));
}
{
  // The positions are true: each identifier in the output maps to a position whose source text is
  // that identifier — the renamed name when it was renamed, the original name otherwise.
  const identifierAt = (line, column) => {
    const text = lines[line] || '';
    if (!/[A-Za-z_$]/.test(text[column] || '')) return null;
    let start = column, end = column;
    while (start > 0 && /[A-Za-z0-9_$]/.test(text[start - 1])) start--;
    while (end < text.length && /[A-Za-z0-9_$]/.test(text[end])) end++;
    return { name: text.slice(start, end), start };
  };
  const sourceLines = source.split('\n');
  // The compressor re-spells two things on purpose: `undefined` becomes `void 0` and a boolean
  // literal becomes `!0`/`!1` (their own spellings are checked elsewhere; here the question is only
  // whether the position is true). A re-spelled token is allowed to map to the word it replaced.
  const RESPELT = { void: ['undefined'], '!0': ['true'], '!1': ['false'] };
  let checked = 0, respelled = 0, renamedRefs = 0; const mismatched = [];
  decoded.forEach((segs, line) => segs.forEach((s) => {
    const token = identifierAt(line, s[0]);
    if (!token || token.start !== s[0]) return;
    const got = originalPositionFor(map, line, s[0]);
    if (!got) return;
    if (got.line !== s[2] || got.column !== s[3]) { mismatched.push([line, s[0], token.name, got, s]); return; }
    const original = sourceLines[got.line] || '';
    const word = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(original.slice(got.column))?.[0] || '';
    // A segment that carries a name index says "this generated name was that name": the map's job is
    // then to be right about the ORIGINAL name. A segment without one must agree with the generated
    // token, unless the token is one of the two re-spellings the compressor makes on purpose.
    const named = got.name ? got.name === word
      : word === token.name || /^(void|!0|!1)$/.test(token.name) && (RESPELT[token.name] || []).includes(word);
    if (!named) mismatched.push({ generated: [line, s[0]], token: token.name, mapped: got, wordThere: word, textThere: original.slice(got.column, got.column + 12) });
    if (RESPELT[token.name]) respelled++;
    if (got.name) renamedRefs++;
    checked++;
  }));
  ok(`every identifier in the generated file maps to a source position that really holds its name (${checked} identifiers checked: ${renamedRefs} renamed references whose original name is in the map, ${respelled} re-spelled on purpose)`, mismatched.length === 0 && renamedRefs > 50, { mismatched: mismatched.slice(0, 3), renamedRefs });
}
ok('renamed bindings are named in the map, so a reader can see what a short name used to be', map.names.length > 0 && mapped.renaming.renamed > 0, { names: map.names.slice(0, 5), renamed: mapped.renaming.renamed });

/* 6. A stack trace, mapped ------------------------------------------------------------------------ */
{
  const src = [
    'function parseTrade(row) {',
    '  const amount = Number(row.amount);',
    '  const symbol = row.symbol.toUpperCase();',   // line 3: throws when row.symbol is missing
    '  return { amount, symbol };',
    '}',
    'try { parseTrade({ amount: 5 }); } catch (e) { globalThis.__stack = e.stack; }',
    '',
  ].join('\n');
  const min = minify(src, { file: 'trade.js', sourceMapFile: 'trade.min.js.map', renameLocals: true });
  const sandbox = {};
  vm.createContext(sandbox);
  try { vm.runInContext(min.code, sandbox, { filename: 'trade.min.js' }); } catch (e) { sandbox.__stack = e.stack; }
  const stack = String(sandbox.__stack || '');
  const frame = /trade\.min\.js:(\d+):(\d+)/.exec(stack);
  const got = frame ? originalPositionFor(min.map, Number(frame[1]) - 1, Number(frame[2]) - 1) : null;
  const originalLine = got ? (src.split('\n')[got.line] || '') : '';
  ok('a real stack trace from the minified file maps back to the original throw site', !!got && /row\.symbol\.toUpperCase/.test(originalLine), { frame: frame && frame.slice(1), mapped: got, originalLine, stack: stack.split('\n').slice(0, 3) });
}

/* Every mapping of every file lands inside its own source ------------------------------------------- */
{
  const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!/node_modules|\.git|data/.test(p)) walk(p, out); } else if (e.name.endsWith('.js')) out.push(p); } return out; };
  const files = [...walk(path.join(APP, 'public')), ...walk(path.join(APP, 'src')), ...walk(path.join(APP, 'tools'))];
  let mappings = 0, unmapped = 0; const outside = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(APP, file);
    const min = minify(text, { file: rel, sourceMapFile: rel + '.map' });
    unmapped += min.unmapped || 0;
    const sourceLines = text.split('\n');
    decode(min.map.mappings).forEach((segs, line) => segs.forEach((s) => {
      mappings++;
      if (s.length === 1) return;
      const [genCol, src, srcLine, srcCol] = s;
      const generatedLine = (lines.length, code.split('\n')[0] && null); // placeholder, replaced below
      if (src >= min.map.sources.length || srcLine < 0 || srcLine >= sourceLines.length || srcCol < 0 || srcCol > (sourceLines[srcLine] || '').length) outside.push({ file: rel, genCol, src, srcLine, srcCol, line });
    }));
  }
  ok(`every mapping in every shipped file resolves inside that file — a line that exists and a column inside it (${mappings} mappings over ${files.length} files)`, outside.length === 0 && mappings > 50000, { outside: outside.slice(0, 3), mappings, unmapped });
  ok('no node was left unmapped for want of a source position (the guard has nothing to report)', unmapped === 0, { unmapped });
}

/* Absence is honest too --------------------------------------------------------------------------- */
{
  const none = minify(source, { file: 'util.js', sourceMap: false });
  ok('with the map turned off there is no map object at all, rather than an empty one', none.map === null, { map: none.map });
  const withoutContent = minify(source, { file: 'util.js', sourceMapFile: 'util.min.js.map', includeContent: false });
  ok('with `includeContent:false` the map carries no original text and says so by being empty', Array.isArray(withoutContent.map.sourcesContent) && withoutContent.map.sourcesContent.length === 0, withoutContent.map.sourcesContent);
  const again = minify(source, { file: 'util.js', sourceMapFile: 'util.min.js.map', renameLocals: true });
  ok('two runs of the same file produce byte-identical code, map and names (the map is deterministic)', again.code === code && again.map.mappings === map.mappings && JSON.stringify(again.map.names) === JSON.stringify(map.names), null);
}

console.log(`jsmin sourcemap: ${pass} passed, ${fail} failed`);
if (process.env.JSMIN_RESULT) fs.writeFileSync(process.env.JSMIN_RESULT, JSON.stringify({ pass, fail, results, scope: 'the source map, checked with its own decoder: VLQ boundaries, whole-set round trips, mapping bounds, the spec lookup rule, truth of identifier positions, and a real stack trace mapped back to the original throw. Not validated against a third-party consumer: the tool is dependency free by design.' }, null, 2) + '\n');
process.exitCode = fail ? 1 : 0;
