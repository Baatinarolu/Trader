# jsmin — a JavaScript compressor with its own parser and source map generator

**Delivered:** `extracted/tradejournal/tools/jsmin/` (nine files, no dependency, no build step) plus
`analysis/probe-jsmin-*.js` and `analysis/run-jsmin-verification.py`.
**Measured:** 113 assertions across six probes, 0 failures; the application's own tree compresses
**2,045,043 → 1,447,184 bytes (70.8 %)** with **200,299 mappings** written while printing.

The request was for a parser, a compressor and a source map generator in plain JavaScript, with no
external tools, tested, and documented as it was built. This is that work, written the way the rest of
this repository is written: the claim and the measurement next to each other, the negatives stated
rather than implied, and a control that shows the fault the tool exists to prevent.

---

## 1. What was built

| file | what it is |
| --- | --- |
| `tools/jsmin/lexer.js` | the tokeniser: exact positions (offset, 1-based line, 0-based column), automatic-semicolon bookkeeping (`newlineBefore`), and the one hard case a regex cannot solve — **regular expression or division**, decided by the previous significant token (the `braceOpensBlock`/`openers` rule) |
| `tools/jsmin/ast.js` | the node shape: one table of key orders (`KEYS`) and one `children()` walker, used by every pass so no pass invents its own traversal |
| `tools/jsmin/parse.js` | recursive descent with a precedence-climbing expression parser; cover grammar for patterns (`toPattern`), `new` chains, private names, optional chaining, class fields and static blocks, `async`/generator forms, import/export |
| `tools/jsmin/scope.js` | two passes — declare, then resolve — producing per-binding reference counts, a scope chain, and the **rename-safety verdict** for every binding with the reason it cannot be renamed |
| `tools/jsmin/compress.js` | seven passes, every deletion gated by `pure()` (no call, `new`, property read, `delete`, `instanceof`, tagged template or spread can be deleted) and every dropped branch checked with `hoists()` (`var` and function declarations hoist out of a branch that never runs) |
| `tools/jsmin/emit.js` | the printer: a precedence table, one text sink (`write(text, node)`), and the source map recorded **at the moment each character is written** — there is no second pass that adds mappings afterwards |
| `tools/jsmin/sourcemap.js` | Base64 VLQ, the encoder, a decoder, and the spec's lookup rule (`originalPositionFor`) |
| `tools/jsmin/index.js` | `minify()` / `verify()`: parse → analyse → compress → print → report, with the map built in the same call |
| `tools/jsmin/cli.js` | the command line: exit `0` ok, `1` invalid input, `2` bad arguments, `3` a byte target that was not met (the output is still written and still valid) |

`tools/jsmin/README.md` is the user-facing contract. This file is the verification.

## 2. The contracts, and which of them are measured

| contract | measured by |
| --- | --- |
| the output is a valid program | `roundtrip` (parse → print → parse → print, byte-identical) **and V8 itself**: `node --check` on all 94 printed files |
| one run reaches the fixed point | `roundtrip`, `differential`, `cli` (a second compression is byte-identical) |
| behaviour is preserved | `differential`: 66 snippets and every shipped file executed before and after in V8, comparing logged values, thrown errors and results |
| nothing observable is deleted | `safety`: getters, Proxy traps, `delete`, `instanceof`, `new`, tagged templates, `fn.name`, `fn.length`, `arguments`, array holes |
| a rename is only made when it is provably safe | `safety` + the report: `eval`, `with`, the `Function` constructor, a name that appears as text, an exported or top-level name, a function-valued binding |
| the map is a real map | `sourcemap`: 217,702 mappings over 94 files decoded, bounds checked, the lookup rule checked, every identifier's position checked against the source text, and a real stack trace resolved to the original `throw` |
| the command line is a contract | `cli`: 26 checks, each through a real child process, including "a file that does not parse does not overwrite an existing output" |
| the tool has no dependency and no network | `safety`: every `require` in the tool is relative or `fs`/`path`/`os`/`child_process`; no socket, no subprocess, no dynamic evaluation |
| the naive approaches are what it prevents | `control`: a regex stripper, a blind renamer and a blind unused-variable remover, each implemented and each **measured** breaking a program the tool handles |

### The two exceptions, and the one non-guarantee

* A `debugger` statement is removed unless `--keep-debugger` is given (`drop_debugger`, reported).
* `fn.toString()` returns the compressed text. Nothing the tool does changes `fn.name` or `fn.length`:
  bindings that hold anonymous functions keep their name, and no parameter is ever dropped.

Both are asserted as *differences* in `safety`, so they cannot become surprises.

## 3. The numbers

```
corpus            94 files  2,211,811 → 1,649,618 bytes (74.6 %)   with --rename-locals: 70.2 %
application tree  85 files  2,045,043 → 1,447,184 bytes (70.8 %)   200,299 mappings
syntax corpus     34 constructs parse, print, re-parse, print to the same bytes
invalid programs  18 refused, each with a SyntaxError carrying line, column and a message
depth             ~1000 nested parentheses and blocks, ~3000–5000 terms in one chain; past that a
                  SyntaxError that says the input nests too deeply (never a RangeError)
speed             40,000 declarations: 2.2 s; a 1 MB string literal: 0.3 s; 20,000 comments: 4 ms
```

The depth numbers are printed by the probe (`measured depth limits:` line) rather than written here as
constants, because they move with the caller's own stack. That is stated in
`tools/jsmin/README.md` too.

## 4. The control: the fault, measured

`analysis/probe-jsmin-control.js` implements the three things a person does when they minify without a
parser, and runs the results:

| naive approach | what it breaks (measured) |
| --- | --- |
| a regex stripper (squeeze whitespace, then strip comments) | `return\n1` becomes `return1` — the function returns a different value; `"https://example.com//path"` loses the rest of the string; `` `a /* not a comment */ b` `` is cut; `n / /b/.test(x)` becomes `n//b/…` and the line vanishes |
| a blind renamer (word-boundary replace) | rewrites the name inside a string and the program prints something different; walks into `eval("sec" + "retName")` and the value is a `ReferenceError`; changes `fn.name` |
| a blind unused-variable remover | deletes `const unused = record()` and the side effect stops happening; deletes `const unused = source.value` and the getter stops being read |
| no source map | the frame from a thrown error can only be read against the minified text |

The same four inputs through the tool behave identically (4/4), the side-effecting initialiser is kept
(and counted as `initialisers_kept_as_statements`), and the stack trace resolves to the original line.

## 5. What the verification found while the tool was being written

The probes are not decoration: they found ten real defects, six of which would have shipped silently.
This is the list, because a compressor's failure mode is *quiet* — the output still runs, it just does
something else.

1. **`async` was dropped from async function expressions.** `const load = async function () { await x }`
   printed as `function () { await x }`. Every probe was green; V8's `node --check` on the printed files
   caught it on three shipped files. Fixed, and the check is now part of the cohort.
2. **`??` printed beside `&&`/`||` without parentheses** — a syntax error the grammar forbids and the
   precedence table did not express. Three shipped files were refused by V8. Fixed in the printer, with
   the paren-aware unwrapping that the fix needed.
3. **A tagged template's `quasi` was folded to a string**: `tag\`a\`` became `tag"a"` — a crash in the
   printer *and*, once printed, a different call. Found by a corpus case, fixed by giving every rewrite
   callback the slot it is standing in.
4. **A division followed by a regular expression printed as a comment**: `n / /b/` printed as `n//b/`,
   so the rest of the line disappeared. `a + +b` and `a - -b` were already separated; `/` was not.
   Found by the control probe, which is what the control is for.
5. **Source-map positions that were not real positions.** `Parser.loc()` could not read a *node*'s own
   location, so ranges came out with an undefined start line. Those reached the map as negative and
   undefined original columns. Fixed, and the probe now checks every mapping of every shipped file
   against the file it came from (217,702 of them) plus the truth of every identifier position.
6. **The analysis was quadratic**: recording the same binding once per declaration made the binding
   list grow with the number of *declarations*. A 20,000-declaration file took 43 s; it takes 2.2 s.
7. **`drop_unused` was unreachable.** The identifier that *declares* a binding was counted as a
   reference, so `reads + writes` was never 0 and no pass could ever find unused code. Fixing it is
   what made import pruning real, and that exposed the next defect.
8. **Pruning an import could quietly empty a module.** With `reads` fixed, an inline
   `export const x = 1` was seen as an unused local and removed, leaving `export{}` — the module
   exported nothing. Inline exports are now marked exported, and an unused import becomes a
   side-effect import (`import "./s.js"`) rather than being deleted.
9. **Array holes were deleted.** The rewrite walker dropped `null` elements, so `[x, , y]` became
   `[x, y]`: a hole is not a missing node, it is a missing element. Fixed, and asserted in `safety`.
10. **One line of module code could not be re-parsed.** `export default function f(){}export{…}` is
    accepted by V8 and by nobody's emitter-and-parser pair; the printer now writes the separator.

Two smaller ones, both found by the invalid-input corpus: a stray private name (`#p`) parsed as an
expression statement instead of being refused, and a stack overflow escaped as a `RangeError` instead of
a `SyntaxError` that says the input nests too deeply.

## 6. What is *not* verified — the honest gaps

* The map is not validated against a third-party consumer. There is no third-party consumer in this
  repository by design (the tool is dependency free), so the map is checked by its own decoder, by the
  spec's lookup rule and by a real stack trace. A browser's devtools has not been pointed at it here.
* The behavioural cohort is a curated corpus (66 snippets, plus every file the app ships, plus the
  syntax corpus), not a fuzzer and not a proof. A program whose behaviour depends on something outside
  the snippet is not covered.
* Depth limits are V8-stack-dependent and move with the caller. They are measured per run, and the tool
  refuses past them in words; it does not handle arbitrary depth.
* `--rename-toplevel` and `--unsafe-rename` are opt-in escape hatches with clear names; they are
  exercised in the probes only far enough to show they are off by default and that asking for them is
  what changes `fn.name`.
* No performance claim is made anywhere. The only speed numbers in this report are the ones the probe
  prints.
* **The application still serves its readable sources.** The tool can produce a minified tree in one
  command (in `tools/jsmin/README.md`), and this report measures what that command produces, but
  switching what `public/index.html` loads is a delivery decision left as an explicit opt-in: every
  existing verification of this application — the UI probes, the documentation checks, the file-hash
  stages of the delivery chain — names the readable files, and a minified build would have to be a
  build artifact with its own verification, not a side effect of shipping a tool.

## 7. Evidence

```
analysis/evidence/jsmin/feature-summary.json      six probes, pinned counts, 113/0, per-check results
analysis/evidence/jsmin/parent-source.json        the M112 commit's own file list: the tool is absent there
analysis/evidence/jsmin/{roundtrip,differential,sourcemap,cli,safety,control}.json
analysis/run-jsmin-verification.py --suite feature
```

Reproduce:

```sh
python3 analysis/run-jsmin-verification.py --suite feature     # 113/0, green
python3 analysis/run-jsmin-verification.py --suite control     # the fault, measured
```
