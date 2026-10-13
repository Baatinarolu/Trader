# jsmin — a JavaScript compressor with its own parser and source map generator

`tools/jsmin/` is a small, dependency-free JavaScript compressor. It parses a file with its own
recursive-descent parser, prints it back with its own printer, folds and simplifies what can be folded
and simplified without guessing, and writes a Source Map v3 while it prints — one mapping per token it
writes, produced by the same code that produces the characters.

There is no `package.json` here, nothing to install and no build step: the tool runs on the same Node
the application already runs on, and it is part of the application's tree (it is exercised by the
application's own verification cohort, `/analysis/probe-jsmin-*.js`).

## Running it

```sh
# compress one file, next to it a map and a report
node tools/jsmin/cli.js public/js/util.js -o /tmp/util.min.js --source-map /tmp/util.min.js.map --report /tmp/util.report.json

# the same, with local names shortened (never an exported, top-level or unsafe name: see below)
node tools/jsmin/cli.js public/js/util.js -o /tmp/util.min.js --rename-locals

# check a file parses; write nothing
node tools/jsmin/cli.js --check public/js/util.js

# compress every JavaScript file the application ships, printing each as FILE.min.js beside it
for f in $(find public/js src -name '*.js' | grep -v '\.min\.js$'); do
  node tools/jsmin/cli.js "$f" -o "${f%.js}.min.js" --rename-locals
done
```

Exit codes are the contract a script needs: `0` it worked, `1` the input is not valid JavaScript,
`2` the arguments are wrong, `3` a requested byte target was not met (the output is still valid and is
still written — a goal is not a promise). `--help` prints the whole contract.

## The library surface

```js
const { minify, verify } = require('./tools/jsmin');
const result = minify(source, { file: 'util.js', sourceMapFile: 'util.min.js.map', renameLocals: true });
result.code;        // the compressed program
result.map;         // Source Map v3, or null when a map was not asked for
result.passes;      // one entry per pass: what it did, how many times, and in what words
result.renaming;    // what was renamed and what was skipped, with the reason for every skip
result.warnings;    // anything the tool declined to do and wants to say out loud
verify(source, {}); // re-parse the output and compress it again: { reparsed, idempotent, mapping_count, … }
```

## What it guarantees

* The output is a valid program. The CLI re-parses its own output and compresses it a second time
  before writing anything; if either check fails it refuses to write and the old file stays.
* Compressing the output again produces the same bytes (it reaches its fixed point in one run).
* No call, `new`, property read, `delete`, `instanceof`, tagged template, spread or mutation is
  removed, reordered or evaluated. `pure()` in `compress.js` is the single gate every deletion passes
  through, and it says no to all of those.
* A binding is renamed only when the analysis can prove it is safe: not exported, not a top-level
  binding of a script or module, not the name of a function or class, not a name that appears anywhere
  in the file as text (strings, template chunks, regular expression bodies), not inside or below a
  `with`, not in a file that contains a direct `eval` or the `Function` constructor, and never to a
  name that is not strictly shorter. Every skip is reported with its reason.
* The map's every mapping is written by the printer at the position it names, and the map is checked
  by decoding it with its own decoder (see the probes).

### The two exceptions, said out loud

* A `debugger` statement is removed unless `--keep-debugger` is given. It is a no-op unless a debugger
  is attached, and the report says which way it went.
* `fn.toString()` returns the compressed text, not the original source, because the text is what was
  printed. Nothing about the tool changes a function's *name* (`fn.name`) or its *arity*
  (`fn.length`): bindings that hold anonymous functions keep their name, and no parameter is ever
  dropped.

## What it does not do

No evaluation, no network, no subprocess, no dependency, no bundling, no type inference, no property
mangling, no parameter dropping, no obfuscation, and no claim that smaller means faster. It is a
source-to-source compressor and a map generator, and the report it writes is the list of what it
actually did — including what it declined to do and why.

## Measured limits

The parser, the analyser, the compressor and the printer all walk the tree by recursion, so the depth
limit is V8's stack rather than a number in this file. Measured on the application's own tree
(`analysis/probe-jsmin-roundtrip.js`):

| input | handled | refused |
| --- | --- | --- |
| nested parentheses | ~1000 | ~1500 |
| nested blocks | ~1000 | ~1500 |
| terms in one `a + b + …` chain | ~3000–5000 | ~5000–10000 |
| statements in a file | 40000 | — |

Past the limit the tool refuses in words — a `SyntaxError` whose message says the input nests too
deeply — instead of letting a `RangeError` escape. The exact numbers move with how deep the caller's
own stack already is; the probe records what it measured rather than what the tool hopes.

## The map

Source Map v3 with `sourcesContent` embedded, so a stack trace can be read without the original file
next to it. `sourcemap.js` implements the VLQ encoding and a decoder; `originalPositionFor(map, line,
column)` implements the spec's lookup rule (the greatest mapping not past the column) and takes the
0-based line and column the map format itself uses. `tools/jsmin/cli.js` appends
`//# sourceMappingURL=…` when it writes a map next to the output.

## Verification

`analysis/probe-jsmin-{roundtrip,differential,sourcemap,cli,safety,control}.js` and
`python3 analysis/run-jsmin-verification.py --suite feature` — six probes, 113 assertions, run against
the tree this file ships with. The cohort includes a control that implements the three naive
alternatives (a regex stripper, a blind renamer, a blind unused-variable remover) and measures each of
them breaking a program the tool handles correctly. The results, and every bug the verification found,
are written up in `analysis/JSMIN.md`.
