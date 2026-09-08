# Log — distributed-2pc-facts

Writer: fresh, first time touching `vlmkit-anim`. Only `docs/anim-ir.md` and CLI
output consulted (`schema --kind distributed`, `schema --kind expect`, `--help`).

## Round 1

Wrote the ten messages from the brief in order, used `"at": "<"` to broadcast
`prepare` and `commit` to both participants (the doc gives this exact pattern
for a broadcast), marked `p2`'s `ack` `"lost": true`, and — following the
guide's own timeout recipe ("A lost message still 'lands' for anchoring
purposes at the moment it would have arrived ... so a timeout can be
`{"after": "<the lost request>", "delay": 400}`") — anchored the resend on it:

```json
{ "from": "coord", "to": "p2", "label": "commit again", "after": "ack", "delay": 800, ... }
```

`p2`'s final `busy` status came from an `events` entry `{"after": "commit
again", "node": "p2", "status": "busy"}` — straightforward, no ambiguity there.

Command:
```
pnpm exec vlmkit-anim check fixtures/anim-scenario/attempts/lc/scene.json \
  --expect fixtures/anim-scenario/briefs/facts/distributed-2pc-facts.expect.json
```

Output (first-attempt: **1 ✗, 0 ⚠**):
```
✗ messages[8].after: "ack" labels 2 messages, so it cannot anchor anything
    → give the message you mean a unique label
✗ 1 error(s): fix these before the semantic checks can run
```

The sheet line and what it told me: `after: "ack" labels 2 messages, so it
cannot anchor anything → give the message you mean a unique label`. Directly
actionable in isolation — except the fact sheet requires **both** acks to be
literally labelled `"ack"` (`"p1->coord:ack"` and `"p2->coord:ack"` in
`distributed-2pc-facts.expect.json`), so "give it a unique label" and "match
the fact sheet's message text" pull in opposite directions. I could not
satisfy both by renaming.

## Round 2

Guessed the anchor might accept the same `"a->b:label"` qualifier the fact
sheet and the `distributed` sheet-format table use, to disambiguate without
renaming:

```json
{ ..., "after": "p2->coord:ack", "delay": 800, ... }
```

Output (still 1 ✗, 0 ⚠):
```
✗ messages[8].after: no earlier message is labelled "p2->coord:ack"
    → earlier labels: "prepare", "prepare", "yes", "yes", "commit", "commit", "ack", "ack"
```

Actionable in that it confirmed the guess was wrong and showed me the exact
label pool it matches against (plain label text only, no `a->b:` qualifier) —
but it also confirmed the round-1 problem is structural: **every** message
label this scene needs (`prepare`, `yes`, `commit`, `ack`) appears twice by
the fact sheet's own design (broadcast to two participants / reply from two
participants), so no fact-sheet-mandated label can ever be a unique `after`
target here. The guide's own worked example for this recipe must implicitly
assume a scene where the anchored label is unique; it doesn't say what to do
when it isn't.

## Round 3 — green

Dropped the `after`/`delay` on `commit again` entirely and inserted a
`{"note": "…"}` right before it instead, relying on two rules stated
elsewhere on the page: a note with no `at`/`after` defaults to "when
everything so far has landed" (which, per the earlier sentence, includes a
lost message's would-have-landed instant), and "every node waits for it" —
so it acts as a barrier that pushes `commit again`'s default (causal,
sender-free) start to after the timeout point, with no label reference at
all:

```json
{ "from": "p2", "to": "coord", "label": "ack", "lost": true },
{ "note": "coord times out waiting for p2's ack (lost) and resends the commit" },
{ "from": "coord", "to": "p2", "label": "commit again" }
```

Commands and full output:

```
$ pnpm exec vlmkit-anim check fixtures/anim-scenario/attempts/lc/scene.json \
    --expect fixtures/anim-scenario/briefs/facts/distributed-2pc-facts.expect.json
✓ scene.json (distributed): 0 error(s), 0 warning(s)
  4320ms · 8 steps (8 captioned) · 37 nodes · 51 tracks / 107 keyframes
  scene 817 B (minified) → timeline 11237 B (×13.8)
  facts distributed-2pc-facts.expect.json: 3 nodes · 10 messages · 1 lost · 3 statuses — all as drawn
  next: vlmkit-anim explain fixtures/anim-scenario/attempts/lc/scene.json · vlmkit-anim render fixtures/anim-scenario/attempts/lc/scene.json --step N · vlmkit-anim html fixtures/anim-scenario/attempts/lc/scene.json --out page.html

$ pnpm exec vlmkit-anim layout fixtures/anim-scenario/attempts/lc/scene.json
0 of 8 frames with layout issues · 0 overlap(s) · 0 clipped · 0 crossed
```

No sheet-specific mismatch line ever appeared for `messages` / `lost` /
`status` — the two schema-level errors in rounds 1–2 blocked the semantic
`--expect` comparison from running at all ("fix these before the semantic
checks can run"), and once the timing was fixed structurally, the fact
comparison passed on the first try: `3 nodes · 10 messages · 1 lost · 3
statuses — all as drawn`. I never got to see what a genuine facts-mismatch
line looks like on this scene.

## `explain` output (final)

```
Two-phase commit: a lost ack — 8 steps, 4320ms, 37 nodes
 1. [    0ms] coord → p1: prepare · coord → p2: prepare
 2. [  600ms] p1 → coord: yes · p2 → coord: yes
 3. [ 1200ms] coord → p1: commit · coord → p2: commit
 4. [ 1800ms] p1 → coord: ack · p2 → coord: ack (lost)
 5. [ 2400ms] coord times out waiting for p2's ack (lost) and resends the commit
 6. [ 2940ms] coord → p2: commit again
 7. [ 3540ms] p2 → coord: ack again · p2 applies the resent commit slowly
 8. [ 4140ms] end
```

This reads as the protocol: both broadcasts land together (steps 1 and 3),
both replies land together (steps 2 and 4, with the lost one marked inline),
the timeout is its own captioned beat (5), the resend and its own ack follow
(6–7, with `p2` going busy on the same beat as its `ack again`), and it ends
(8). No title/"Start" step was added separately from step 1 — the title line
appears in the `explain` header instead, and step 1 is the first real beat.

## Counts requested by the brief

- **First-attempt ✗ / ⚠**: 1 ✗, 0 ⚠ (round 1, the ambiguous-anchor error above).
- **Rounds to green**: 3 (round 1 and 2 both blocked on the same structural
  issue via two different guesses; round 3 sidestepped it).
- **Hand-typed coordinates, colours, or canvas sizes**: **0**. This kind
  needed none — no `pos`, no `fill`/`stroke`/hex, no `canvas` override. The
  only hand-typed non-content values anywhere were the two literal delay
  numbers (`800`) in the discarded round-1/2 attempts, and those are gone
  from the final scene.
- **`scene.json` size**: 1311 bytes as written (pretty-printed, 2-space
  indent); `check` reports 817 B minified.
- **How the resend was timed** (which field made "after the ack was lost"
  sayable): not a field on the resend message itself. It's the **absence**
  of `at`/`after` on a `{"note": …}` step placed right after the lost ack,
  combined with two rules from the guide: (1) an unanchored note defaults to
  "when everything so far has landed," and a lost message still counts as
  landing — at its would-have-arrived instant — for anchoring purposes; (2)
  "every node waits for [a note]," so it acts as a barrier and the next
  message's own default (causal, sender-free) start is pushed past it. The
  `after`/`delay` fields exist and the guide even names this exact scenario
  ("a timeout can be `{"after": "<the lost request>", "delay": 400}`"), but
  they were unusable here because the anchor label (`"ack"`) was not unique
  — see Friction.

## Friction

**What helped.** The `messages` field table and the causal-timing section
with its worked `a/b/c/d` example were enough to get the ten messages in the
right order and to use `"at": "<"` for the two broadcasts (prepare, commit)
correctly on the first try — that part of the guide is precise and the
example transfers directly. `schema --kind distributed` and `schema --kind
expect` on the CLI matched the prose closely enough that I didn't need to
re-read the page for field names. The error messages themselves were good:
both rounds 1 and 2 named the exact field (`messages[8].after`), said what
was wrong in one clause, and round 2's error even printed the full label
pool so I could see immediately that guessing a qualified syntax was wrong
rather than almost-right.

**What was missing or misleading.** The guide states the timeout recipe
(`{"after": "<the lost request>", "delay": 400}`) as if it always applies,
but never says what to do when the lost message's label is not unique — and
in a two-participant protocol like 2PC, the natural labels (`prepare`,
`yes`, `commit`, `ack`) are *never* unique, because they're used for both
participants by construction. The fact sheet format compounds this: it
requires the literal label text to match for both participants
(`"p1->coord:ack"`, `"p2->coord:ack"`), so "just give it a unique label" (the
error's own hint) directly conflicts with satisfying `--expect`. I could not
find a field that lets a message carry an internal anchor id distinct from
its display `label` (the way annotation ops have both an `id` and separate
display text) — that's the gap. I worked around it with a `note`, which
turned out cleaner (it's also a better sentence — "coord times out..." is a
real beat with its own caption, not a hidden timing side-effect on the
resend), but I only found that path because I already knew the "notes are a
barrier every node waits for" rule from a different part of the page; a
reader who only skimmed the messages table would not have made that
connection, since nothing under "messages" cross-references it.

**Was each sheet line actionable?** Yes for what it covered — both round 1
and round 2's ✗ lines told me exactly what was wrong and where. But neither
line, nor anything in the guide, told me *why* it was wrong for my specific
case (duplicate labels being structurally required by the fact sheet) or
what to do instead; I had to reason that out myself from a different section
of the guide (notes as a barrier).

**What I wanted and could not express.** A way to anchor `after` on "this
particular message" independent of its display label — e.g. an anchor by
index, or a message-level `id` distinct from `label`, mirroring what
annotation ops already do. Short of that, the guide could at least say
"when the anchor label isn't unique, use an unanchored `note` after the
messages you're waiting on — it waits for everything, lost messages
included" right in the timeout paragraph, since that's the only way out once
you hit the ambiguity and it isn't hinted at there.
