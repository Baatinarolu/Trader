#!/usr/bin/env python3
"""Regenerate analysis/PROGRESS.md from analysis/MISMATCHES.md.

The point of this script is the assertion at the end: the groups must be an exact
partition of the ledger. If an item is missing from every group, or sits in two,
the script exits non-zero and writes nothing. That is the mechanism that stops
"don't leave anything out" from being a promise I have to remember to keep.

    python3 analysis/gen-progress.py
"""
import io, os, re, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LEDGER = os.path.join(ROOT, 'analysis', 'MISMATCHES.md')
OUT = os.path.join(ROOT, 'analysis', 'PROGRESS.md')

GROUPS = [
    ('A \u2014 scoring, vetoes & the tradeability gate  (setup.js)',
     # M124 is here rather than in a file-based group because it is a defect in the
     # TRADEABILITY GATE itself: chart() and analyse() answer "what do I do on this bar"
     # differently for the same bar, which is the gate giving two verdicts. The files are
     # index.js and now.js, not setup.js, but the concern is group A's.
     # M125 is here because it lives in setup.js and it corrupts the number the whole
     # tradeability gate reads: rr_final. The runway check, the minRR veto and the grade
     # all key off it, so a degenerate target is a gate defect, not a cosmetic one.
     ['M3', 'M7', 'M8', 'M35', 'M63', 'M68', 'M69', 'M70', 'M95', 'M96', 'M97', 'M98', 'M118',
      'M124', 'M125']),
    ('B \u2014 structure, zones & liquidity  (smc.js)',
     ['M1', 'M2', 'M16', 'M21', 'M22', 'M23', 'M24'] + ['M%d' % i for i in range(29, 33)]
     + ['M36'] + ['M%d' % i for i in range(42, 56)]
     + ['M67', 'M71', 'M72', 'M73', 'M75', 'M76', 'M77', 'M78', 'M119']),
    ('C \u2014 sessions, killzones & no-trade conditions',
     ['M5', 'M10', 'M26', 'M33', 'M37', 'M38', 'M39', 'M40', 'M41', 'M74', 'M112',
     # M126 was raised while applying M39: SESSIONS is still hardcoded UTC in the same
     # module whose SILVER_BULLETS M5 moved to New York time, so it belongs with the
     # session/timing rows rather than with a file-based group.
     'M126']),
    ('D \u2014 risk & guardrails',
     ['M9', 'M11'] + ['M%d' % i for i in range(79, 86)] + ['M94', 'M103', 'M113', 'M116']),
    ('E \u2014 journal, review & behaviour',
     ['M12', 'M13', 'M14', 'M15', 'M28', 'M56', 'M57', 'M58', 'M59', 'M60', 'M64', 'M65', 'M66']
     + ['M%d' % i for i in range(86, 94)] + ['M99', 'M100', 'M101', 'M104', 'M105', 'M106', 'M107', 'M115']),
    ('F \u2014 schema & strategy versioning', ['M102']),
    ('G \u2014 docs, config, provenance & product-scope',
     ['M4', 'M6', 'M17', 'M18', 'M19', 'M20', 'M25', 'M27', 'M34', 'M61', 'M62']
     + ['M%d' % i for i in range(108, 112)] + ['M114', 'M117']
     # M120 is an audit-of-the-audit finding raised by the §8.2 re-verification sweep: the
     # measurement harness omitted an input the server supplies. It sits with the other
     # provenance rows (M6, M19, M20, M117) rather than with a mechanism group.
     + ['M120']),
    ('H \u2014 market data & feed integrity  (candles.js)',
     # M121: the candle-provider path. Not a docs/config row and not a scoring mechanism —
     # it is the integrity of the bars every mechanism downstream is handed. Its own group so
     # later feed rows have a home, and so the partition assertion still names every ledger ID.
     # M122: the failure-message classifier on the same path — which FAMILY of failure a
     # candle request hit, so an unreachable host is not mistaken for a bad symbol or an
     # empty dataset. Lives with M121 because it is the same file and the same concern.
     # M123: the offline demo bar source on the same path — it exists because the live one is
     # unreachable here, and it is labelled so it can never be mistaken for a feed.
     ['M121', 'M122', 'M123']),
]

# ---------------------------------------------------------------- read ledger
rows = {}
for line in io.open(LEDGER, encoding='utf-8'):
    if not line.startswith('|'):
        continue
    c = line.replace('\\|', '\x00').split('|')
    if len(c) < 7:
        continue
    k = c[1].strip().replace('**', '')
    if not re.fullmatch(r'M\d+', k):
        continue
    sev = (re.match(r'\**\s*(S[1-4])', c[2].strip()) or [None, '?'])[1]
    frm = c[3].strip().replace('\x00', '|').replace('**', '')
    st = c[6].strip().replace('\x00', '|')
    chg = c[5].strip().replace('\x00', '|')
    # Order matters: PARTIAL contains the substring APPLIED, so it must be tested first or a
    # half-finished item is silently counted as complete.
    if 'PARTIAL' in st.upper():
        status = 'partial'
    elif 'APPLIED' in st or 'RESOLVED by M58' in st:
        status = 'done'
    # M3 is the one item whose remedy is "record the difference, change no code"; that phrase
    # lives in the CHANGE column, not the status column, so both have to be read or it is
    # silently counted as work still outstanding.
    elif ('no-action' in st.lower() or 'not a defect' in st.lower()
          or chg.lower().startswith('not a defect')):
        status = 'no-action'
    else:
        status = 'todo'
    rows[k] = dict(sev=sev, frm=frm, status=status)

# ------------------------------------------------------- the anti-omission gate
seen = [i for _, items in GROUPS for i in items]
allids = sorted(rows, key=lambda x: int(x[1:]))
problems = []
dupes = [k for k, v in collections.Counter(seen).items() if v > 1]
if dupes:
    problems.append('in more than one group: ' + ', '.join(dupes))
missing = sorted(set(allids) - set(seen), key=lambda x: int(x[1:]))
if missing:
    problems.append('in the ledger but in NO group: ' + ', '.join(missing))
phantom = sorted(set(seen) - set(allids), key=lambda x: int(x[1:]))
if phantom:
    problems.append('in a group but NOT in the ledger: ' + ', '.join(phantom))
if problems:
    sys.stderr.write('REFUSING TO WRITE PROGRESS.md \u2014 the groups are not a partition:\n')
    for p in problems:
        sys.stderr.write('  \u00b7 ' + p + '\n')
    sys.exit(1)
assert len(seen) == len(set(seen)) == len(allids)

# ------------------------------------------------------------------- render
done = sum(1 for r in rows.values() if r['status'] == 'done')
part = sum(1 for r in rows.values() if r['status'] == 'partial')
noact = sum(1 for r in rows.values() if r['status'] == 'no-action')
todo = len(rows) - done - part - noact
out = []
out.append('# Progress tracker \u2014 every one of the %d findings' % len(rows))
out.append('')
out.append('Ordered by **mechanism**, not by episode, so related changes land together and can be')
out.append('measured as one unit. Regenerated by `python3 analysis/gen-progress.py`, which **refuses')
out.append('to write** unless the groups below are an exact partition of `MISMATCHES.md` \u2014 no item')
out.append('missing, none duplicated, none invented. That assertion is what makes "nothing left out"')
out.append('a property of the file rather than a promise.')
out.append('')
out.append('**%d done \u00b7 %d partial \u00b7 %d todo \u00b7 %d deliberate no-action \u00b7 %d total**' % (done, part, todo, noact, len(rows)))
out.append('')
for title, items in GROUPS:
    g_done = sum(1 for i in items if rows[i]['status'] == 'done')
    g_part = sum(1 for i in items if rows[i]['status'] == 'partial')
    out.append('## %s' % title)
    out.append('')
    out.append('_%d of %d done%s_' % (g_done, len(items), (', %d partial' % g_part) if g_part else ''))
    out.append('')
    out.append('| item | ep | sev | status |')
    out.append('|---|---|---|---|')
    for i in sorted(items, key=lambda x: int(x[1:])):
        r = rows[i]
        out.append('| %s | %s | %s | %s |' % (i, r['frm'], r['sev'], r['status']))
    out.append('')
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(out))
print('PROGRESS.md written: %d done / %d partial / %d todo / %d no-action / %d total' % (done, part, todo, noact, len(rows)))
print('partition asserted across %d groups' % len(GROUPS))
