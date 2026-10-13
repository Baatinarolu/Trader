'use strict';
/**
 * lexer.js — the tokenizer. ECMAScript 2020 token set, hand written, no dependency.
 *
 * Three things here are deliberate rather than incidental:
 *
 * 1. **The whole file is tokenized before it is parsed.** Parsing an arrow function needs to try a
 *    parenthesis as a parameter list and put it back; with a token array that is an index reset and
 *    not a lexer rewind.
 * 2. **Token positions are exact** (`start`/`end` offsets plus `line`/`column`, 0-based offsets and
 *    1-based lines, the same convention the source map uses). Every elimination this tool performs
 *    is reported with a position, so a report can be checked against the file.
 * 3. `async`, `of`, `get`, `set`, `static`, `as` and `from` are NOT keywords here: they are
 *    contextual, and the parser decides from the position whether each one names a binding, an
 *    operator or a modifier. Lexing them as keywords is a classic way to make `async function`
 *    unparsable, so the token stream calls them names and `atName()` asks about the text.
 * 4. **Comments are kept** as trivia attached to the token that follows them. A compressor that
 *    cannot see a comment cannot tell `/*! license *​/` from noise, and a source map that skips
 *    comments silently shifts a blank line. They are also the reason the emitter can preserve a
 *    license header on request.
 *
 * Ambiguity this file must resolve on its own: `/` between a division and a regular expression
 * literal. The rule is not lexical, so a small stack of opener kinds is kept and the decision is
 * made from the token before the `/` and, when that token is a closer, from what opened it.
 */
const KEYWORDS = new Set(['break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'let', 'await', 'true', 'false', 'null', 'enum']);
/** Keywords that cannot be an identifier reference; the rest are contextual (`async`, `of`, `let`…). */
const RESERVED = new Set(['break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'enum']);
/** A `/` after one of these starts a regular expression, not a division. */
const REGEX_AFTER_KEYWORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const PUNCTUATORS = [
  '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>',
  '{', '}', '(', ')', '[', ']', ';', ',', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^', '!', '~', '?', ':', '=', '.',
];
const ID_START = /[$_\p{L}\p{Nl}]/u, ID_CONTINUE = /[$_\u200c\u200d\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}]/u;
const isDigit = (c) => c >= '0' && c <= '9';
const isHex = (c) => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');

class LexError extends SyntaxError {
  constructor(message, line, column, offset) { super(message); this.name = 'SyntaxError'; this.line = line; this.column = column; this.offset = offset; }
}

/** `{` opens a block (not an object literal) when the token before it cannot end an expression. */
function braceOpensBlock(prev) {
  if (!prev) return true;
  if (prev.type === 'name') return !['of', 'in', 'case', 'do', 'else', 'return', 'typeof', 'new', 'void', 'delete', 'yield', 'await', 'extends', 'default'].includes(prev.value);
  if (prev.type === 'num' || prev.type === 'str' || prev.type === 'regex' || prev.type === 'template_full' || prev.type === 'template_tail' || prev.type === 'private') return false;
  if (prev.type !== 'punct') return false;
  return ['=>', ')', '}', ']', ';', '{', 'else'].includes(prev.value);
}

class Lexer {
  constructor(source) {
    this.source = source; this.i = 0; this.line = 1; this.lineStart = 0;
    this.tokens = []; this.comments = []; this.openers = []; this.templates = [];
    this.prev = null; this.newlineSinceToken = false;
  }

  error(message, offset = this.i) {
    const before = this.source.slice(0, offset);
    const line = before.split('\n').length, column = offset - (before.lastIndexOf('\n') + 1);
    // `column` is 0-based (the source map's convention); the message shows the 1-based pair, which is
    // what an editor shows a reader.
    throw new LexError(`${message} at ${line}:${column + 1}`, line, column, offset);
  }

  get col() { return this.i - this.lineStart; }

  push(type, value, raw, start, startLine, startCol, extra) {
    const t = { type, value, raw, start, end: this.i, line: startLine, column: startCol, newlineBefore: this.newlineSinceToken, comments: [], ...extra };
    if (this.comments.length) { t.comments = this.comments; this.comments = []; }
    this.newlineSinceToken = false;
    this.tokens.push(t); this.prev = t;
    return t;
  }

  /** Whitespace, line terminators and comments; records whether a newline was crossed. */
  skipSpace() {
    const s = this.source;
    for (;;) {
      const c = s[this.i];
      if (c === '\n') { this.i++; this.line++; this.lineStart = this.i; this.newlineSinceToken = true; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\v' || c === '\f' || c === '\u00a0' || c === '\ufeff') { this.i++; continue; }
      if (c === '/' && s[this.i + 1] === '/') {
        const start = this.i, startLine = this.line, startCol = this.col;
        this.i += 2; while (this.i < s.length && s[this.i] !== '\n' && s[this.i] !== '\u2028' && s[this.i] !== '\u2029') this.i++;
        this.comments.push({ type: 'Line', value: s.slice(start + 2, this.i), start, end: this.i, line: startLine, column: startCol });
        continue;
      }
      if (c === '/' && s[this.i + 1] === '*') {
        const start = this.i, startLine = this.line, startCol = this.col;
        this.i += 2; let closed = false;
        while (this.i < s.length) {
          if (s[this.i] === '*' && s[this.i + 1] === '/') { closed = true; this.i += 2; break; }
          if (s[this.i] === '\n') { this.line++; this.lineStart = this.i + 1; this.newlineSinceToken = true; }
          this.i++;
        }
        if (!closed) this.error('unterminated block comment', start);
        this.comments.push({ type: 'Block', value: s.slice(start + 2, this.i - 2), start, end: this.i, line: startLine, column: startCol });
        continue;
      }
      if (c === '<' && s.startsWith('<!--', this.i)) { this.i += 4; continue; }
      return;
    }
  }

  readIdentifier() {
    const s = this.source, start = this.i, startLine = this.line, startCol = this.col;
    let value = '';
    while (this.i < s.length) {
      const c = s[this.i];
      if (c === '\\' && s[this.i + 1] === 'u') {
        const decoded = this.readUnicodeEscape();
        value += decoded; continue;
      }
      if (this.i === start ? ID_START.test(c) : ID_CONTINUE.test(c)) { value += c; this.i++; continue; }
      break;
    }
    if (!value) this.error('invalid identifier');
    const raw = s.slice(start, this.i);
    return this.push(KEYWORDS.has(value) ? 'keyword' : 'name', value, raw, start, startLine, startCol);
  }

  readUnicodeEscape() {
    const s = this.source; this.i += 2; // \u
    if (s[this.i] === '{') {
      const close = s.indexOf('}', this.i);
      if (close < 0) this.error('unterminated unicode escape');
      const hex = s.slice(this.i + 1, close);
      this.i = close + 1; return String.fromCodePoint(parseInt(hex, 16));
    }
    const hex = s.slice(this.i, this.i + 4);
    this.i += 4; return String.fromCharCode(parseInt(hex, 16));
  }

  readNumber() {
    const s = this.source, start = this.i, startLine = this.line, startCol = this.col;
    let value = null, bigint = false;
    if (s[this.i] === '0' && (s[this.i + 1] === 'x' || s[this.i + 1] === 'X')) {
      this.i += 2; const from = this.i;
      while (isHex(s[this.i]) || s[this.i] === '_') this.i++;
      if (this.i === from) this.error('malformed hexadecimal literal');
      value = parseInt(s.slice(from, this.i).replace(/_/g, ''), 16);
    } else if (s[this.i] === '0' && (s[this.i + 1] === 'b' || s[this.i + 1] === 'B' || s[this.i + 1] === 'o' || s[this.i + 1] === 'O')) {
      const base = (s[this.i + 1] === 'b' || s[this.i + 1] === 'B') ? 2 : 8;
      this.i += 2; const from = this.i;
      while (isDigit(s[this.i]) || (base === 8 && s[this.i] >= '0' && s[this.i] <= '7') || s[this.i] === '_') this.i++;
      if (this.i === from) this.error('malformed numeric literal');
      value = parseInt(s.slice(from, this.i).replace(/_/g, ''), base);
    } else {
      const from = this.i;
      while (isDigit(s[this.i]) || s[this.i] === '_') this.i++;
      if (s[this.i] === '.') { this.i++; while (isDigit(s[this.i]) || s[this.i] === '_') this.i++; }
      if (s[this.i] === 'e' || s[this.i] === 'E') {
        const save = this.i; this.i++;
        if (s[this.i] === '+' || s[this.i] === '-') this.i++;
        if (isDigit(s[this.i])) { while (isDigit(s[this.i]) || s[this.i] === '_') this.i++; } else this.i = save;
      }
      const raw = s.slice(from, this.i);
      value = raw.includes('.') || /[eE]/.test(raw) ? parseFloat(raw.replace(/_/g, ''))
        : (/^0[0-7]+$/.test(raw) ? parseInt(raw, 8) : parseInt(raw, 10));
      if (raw.length > 1 && raw[0] === '0' && !/^0[0-9]/.test(raw)) value = parseFloat(raw);
    }
    if (s[this.i] === 'n') { this.i++; bigint = true; }
    if (ID_START.test(s[this.i] || '') || isDigit(s[this.i] || '')) this.error('identifier starts immediately after a numeric literal', this.i);
    this.push('num', value, s.slice(start, this.i), start, startLine, startCol, bigint ? { bigint: true } : {});
  }

  readString() {
    const s = this.source, quote = s[this.i], start = this.i, startLine = this.line, startCol = this.col;
    let value = ''; this.i++;
    for (;;) {
      const c = s[this.i];
      if (c === undefined || c === '\n') this.error('unterminated string literal', start);
      if (c === quote) { this.i++; break; }
      if (c === '\\') { value += this.readEscape(); continue; }
      value += c; this.i++;
    }
    this.push('str', value, s.slice(start, this.i), start, startLine, startCol);
  }

  readEscape() {
    const s = this.source, c = s[this.i + 1];
    this.i += 2;
    switch (c) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'v': return '\v';
      case '0': return isDigit(s[this.i]) ? '0' : '\0';
      case 'x': {
        const hex = s.slice(this.i, this.i + 2);
        if (!isHex(hex[0]) || !isHex(hex[1])) this.error('malformed \\x escape');
        this.i += 2; return String.fromCharCode(parseInt(hex, 16));
      }
      case 'u': this.i -= 2; return this.readUnicodeEscape();
      case '\r': if (s[this.i] === '\n') this.i++; this.line++; this.lineStart = this.i; return '';
      case '\n': this.line++; this.lineStart = this.i; return '';
      case undefined: return '';
      default: return c;
    }
  }

  /** One template chunk, starting at the opening backtick: `` `text` `` or `` `head${ ``. */
  scanTemplate(start) {
    const s = this.source, startLine = this.line, startCol = start - this.lineStart;
    let cooked = '';
    for (;;) {
      const c = s[this.i];
      if (c === undefined) this.error('unterminated template literal', start);
      if (c === '`') { this.i++; this.push('template', cooked, s.slice(start, this.i), start, startLine, startCol); return; }
      if (c === '$' && s[this.i + 1] === '{') {
        this.i += 2; this.push('template_head', cooked, s.slice(start, this.i), start, startLine, startCol);
        this.templates.push({ brace: 0 }); return;
      }
      if (c === '\\') { cooked += this.readEscape(); continue; }
      if (c === '\r') { this.i++; if (s[this.i] === '\n') this.i++; cooked += '\n'; this.line++; this.lineStart = this.i; continue; }
      if (c === '\n') { this.line++; this.lineStart = this.i + 1; }
      cooked += c; this.i++;
    }
  }

  /** Called with `this.i` on the `}` that closes a `${ … }` substitution. */
  scanTemplateContinuation() {
    const s = this.source, start = this.i, startLine = this.line, startCol = start - this.lineStart;
    this.templates.pop(); this.i++; // consume `}`
    let cooked = '';
    for (;;) {
      const c = s[this.i];
      if (c === undefined) this.error('unterminated template literal', start);
      if (c === '`') { this.i++; this.push('template_tail', cooked, s.slice(start, this.i), start, startLine, startCol); return; }
      if (c === '$' && s[this.i + 1] === '{') {
        this.i += 2; this.push('template_middle', cooked, s.slice(start, this.i), start, startLine, startCol);
        this.templates.push({ brace: 0 }); return;
      }
      if (c === '\\') { cooked += this.readEscape(); continue; }
      if (c === '\r') { this.i++; if (s[this.i] === '\n') this.i++; cooked += '\n'; this.line++; this.lineStart = this.i; continue; }
      if (c === '\n') { this.line++; this.lineStart = this.i + 1; }
      cooked += c; this.i++;
    }
  }

  readRegex() {
    const s = this.source, start = this.i, startLine = this.line, startCol = this.col;
    let inClass = false; this.i++; // opening /
    for (;;) {
      const c = s[this.i];
      if (c === undefined || c === '\n') this.error('unterminated regular expression literal', start);
      if (c === '\\') { this.i += 2; continue; }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) { this.i++; break; }
      this.i++;
    }
    while (ID_CONTINUE.test(s[this.i] || '')) this.i++;
    const raw = s.slice(start, this.i);
    const body = raw.slice(1, raw.lastIndexOf('/'));
    const flags = raw.slice(raw.lastIndexOf('/') + 1);
    this.push('regex', { body, flags }, raw, start, startLine, startCol);
  }

  regexAllowed() {
    const prev = this.prev;
    if (!prev) return true;
    if (prev.type === 'num' || prev.type === 'str' || prev.type === 'regex' || prev.type === 'name' || prev.type === 'private'
      || prev.type === 'template_full' || prev.type === 'template_tail') return false;
    if (prev.type === 'keyword') return !['this', 'super', 'true', 'false', 'null'].includes(prev.value) && REGEX_AFTER_KEYWORD.has(prev.value);
    if (prev.type === 'punct') {
      if (prev.value === ')') { const opener = this.openers[this.openers.length - 1]; return !!opener && opener.kind === 'header'; }
      if (prev.value === ']') return false;
      if (prev.value === '}') { const opener = this.openers[this.openers.length - 1]; return !!opener && opener.kind === 'block'; }
      if (prev.value === '++' || prev.value === '--') return false;
      return true;
    }
    return true;
  }

  tokenize() {
    const s = this.source;
    if (s.startsWith('#!')) { while (this.i < s.length && s[this.i] !== '\n') this.i++; }
    for (;;) {
      this.skipSpace();
      if (this.i >= s.length) { this.push('eof', null, '', this.i, this.line, this.col); break; }
      const c = s[this.i];
      if (c === '`') { const at = this.i; this.i++; this.scanTemplate(at); continue; }
      if (c === '}' && this.templates.length && this.templates[this.templates.length - 1].brace === 0) { this.scanTemplateContinuation(); continue; }
      if (ID_START.test(c) || (c === '\\' && s[this.i + 1] === 'u')) { this.readIdentifier(); continue; }
      if (isDigit(c) || (c === '.' && isDigit(s[this.i + 1]))) { this.readNumber(); continue; }
      if (c === '"' || c === "'") { this.readString(); continue; }
      if (c === '#') { const start = this.i, l = this.line, col = this.col; this.i++; const id = this.readIdentifierRaw(); this.push('private', id, s.slice(start, this.i), start, l, col); continue; }
      if (c === '/' && this.regexAllowed()) { this.readRegex(); continue; }
      const punct = PUNCTUATORS.find((p) => s.startsWith(p, this.i) && !(p === '?.' && isDigit(s[this.i + 2])));
      if (!punct) this.error(`unexpected character ${JSON.stringify(c)}`);
      const start = this.i, startLine = this.line, startCol = this.col;
      this.i += punct.length;
      const t = this.push('punct', punct, punct, start, startLine, startCol);
      if (punct === '{') this.openers.push({ kind: braceOpensBlock(this.tokenBefore(start)) ? 'block' : 'object', token: t });
      else if (punct === '(') this.openers.push({ kind: this.parenIsHeader(), token: t });
      else if (punct === '[') this.openers.push({ kind: 'array', token: t });
      else if (punct === '}') this.openers.pop();
      else if (punct === ')' || punct === ']') { this.openers.pop(); }
      if (punct === '{' && this.templates.length) this.templates[this.templates.length - 1].brace++;
      if (punct === '}' && this.templates.length && this.templates[this.templates.length - 1].brace > 0) this.templates[this.templates.length - 1].brace--;
    }
    return { tokens: this.tokens, comments: this.tokens.flatMap((t) => t.comments), source: this.source };
  }

  /** The token that opened the group closed by the current `)`/`]`/`}` — used for the regex rule. */
  tokenBefore(offset) {
    for (let i = this.tokens.length - 1; i >= 0; i--) if (this.tokens[i].end <= offset) return this.tokens[i];
    return null;
  }

  /** `(` after `if`/`for`/`while`/`with`/`catch` is a header, so `)` may be followed by a regex. */
  parenIsHeader() {
    const prev = this.prev;
    if (!prev) return false;
    if (prev.type === 'keyword') return ['if', 'for', 'while', 'with', 'catch', 'switch'].includes(prev.value);
    return false;
  }

  readIdentifierRaw() {
    const s = this.source, start = this.i;
    while (this.i < s.length && ID_CONTINUE.test(s[this.i])) this.i++;
    return s.slice(start, this.i);
  }
}

/** Tokenize `source`. Throws `LexError` (a `SyntaxError` carrying line/column/offset) on bad input. */
function tokenize(source) {
  return new Lexer(source).tokenize();
}

module.exports = { tokenize, Lexer, LexError, KEYWORDS, RESERVED, ID_START, ID_CONTINUE, isDigit };
