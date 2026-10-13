'use strict';
/**
 * sourcemap.js — the map format itself: VLQ, the encoder and a decoder this tool also uses to
 * verify its own output. No dependency, no build step, no external tool.
 *
 * The map produced here is Source Map v3 with `sourcesContent` embedded, so a stack trace can be
 * traced back without the original file next to it. `decode()` and `originalPositionFor()` below
 * implement the lookup rule the spec defines ("the greatest mapping whose generated column is less
 * than or equal to the column being looked up"), which is what the verification probes use to check
 * every mapping this tool writes — the encoder is verified by the decoder rather than by itself.
 */
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = (() => { const m = new Map(); for (let i = 0; i < BASE64.length; i++) m.set(BASE64[i], i); return m; })();

function encodeVlq(value) {
  // A signed value is stored as a sign bit in the lowest bit, then base64 digits, 5 bits each, with
  // the continuation bit set on every digit but the last.
  let vlq = value < 0 ? ((-value) << 1) | 1 : value << 1;
  let out = '';
  do {
    let digit = vlq & 31;
    vlq >>>= 5;
    if (vlq > 0) digit |= 32;
    out += BASE64[digit];
  } while (vlq > 0);
  return out;
}

function decodeVlqSegments(str) {
  // Returns the signed values of one `,`-joined segment group (a segment group is one mapping).
  const values = []; let shift = 0, value = 0;
  for (const ch of str) {
    const digit = B64_INDEX.get(ch);
    if (digit === undefined) throw new SyntaxError('source map: invalid base64 VLQ character ' + JSON.stringify(ch));
    value += (digit & 31) << shift;
    if (digit & 32) { shift += 5; continue; }
    values.push(value & 1 ? -(value >>> 1) : value >>> 1);
    value = 0; shift = 0;
  }
  if (shift !== 0) throw new SyntaxError('source map: truncated VLQ segment');
  return values;
}

/**
 * Encode `mappings`: an array (one entry per generated line) of arrays of segments
 * `[generatedColumn, sourceIndex, originalLine, originalColumn, nameIndex?]` — as produced by
 * emit.js. Fields are stored as deltas, and `generatedColumn` resets on every generated line while
 * the rest carry across lines, which is what makes the format compact.
 */
function encode(mappings) {
  let prevSource = 0, prevOriginalLine = 0, prevOriginalColumn = 0, prevName = 0;
  const lines = [];
  for (const line of mappings) {
    const segments = [];
    let prevColumn = 0;
    for (const seg of line) {
      const [column, source, originalLine, originalColumn, name] = seg;
      let out = encodeVlq(column - prevColumn); prevColumn = column;
      if (source !== undefined && source !== null) {
        out += encodeVlq(source - prevSource); prevSource = source;
        out += encodeVlq(originalLine - prevOriginalLine); prevOriginalLine = originalLine;
        out += encodeVlq(originalColumn - prevOriginalColumn); prevOriginalColumn = originalColumn;
        if (name !== undefined && name !== null) { out += encodeVlq(name - prevName); prevName = name; }
      }
      segments.push(out);
    }
    lines.push(segments.join(','));
  }
  return lines.join(';');
}

/** The exact inverse of `encode`, used by the probes to read back what was written. */
function decode(mappings) {
  const lines = String(mappings).split(';');
  let source = 0, originalLine = 0, originalColumn = 0, name = 0;
  return lines.map((line) => {
    if (!line) return [];
    let column = 0;
    return line.split(',').map((seg) => {
      const v = decodeVlqSegments(seg);
      column += v[0];
      if (v.length === 1) return [column];
      if (v.length !== 4 && v.length !== 5) throw new SyntaxError('source map: segment with ' + v.length + ' fields');
      source += v[1]; originalLine += v[2]; originalColumn += v[3];
      const out = [column, source, originalLine, originalColumn];
      if (v.length === 5) { name += v[4]; out.push(name); }
      return out;
    });
  });
}

/** The spec's lookup rule: the greatest mapping at or before (line, column), or null. */
function originalPositionFor(map, line, column) {
  const decoded = map.__decoded || (map.__decoded = decode(map.mappings));
  const segments = decoded[line] || [];
  let best = null;
  for (const seg of segments) { if (seg[0] <= column) best = seg; else break; }
  if (!best || best.length === 1) return null;
  const sources = map.sources || [];
  return { source: sources[best[1]] ?? null, line: best[2], column: best[3], name: best.length === 5 ? (map.names || [])[best[4]] ?? null : null };
}

module.exports = { BASE64, encodeVlq, decodeVlqSegments, encode, decode, originalPositionFor };
