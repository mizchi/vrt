# State-Vending Machine Animation — Fresh Writer Evaluation

## Round 1: Initial Scene Creation

### Command Output (First Check)

```
⚠ nodes(state-idle): "idle" is covered by token (38% of the smaller) at step 1 (0ms)
    → move one of them, shorten the text, or widen the canvas — in a laid-out kind (state-machine, graph, modules, diagram) try another `layout`, or reorder the nodes list: ties in `lr` / `tb` follow it
✓ scene.json (state-machine): 0 error(s), 1 warning(s)
  8750ms · 10 steps (10 captioned) · 17 nodes · 10 tracks / 57 keyframes
  scene 644 B (minified) → timeline 6391 B (×9.9)
  facts state-vending-facts.expect.json: 4 states · 5 transitions · 1 initial state · 1 final state · 9 visits · 1 end state — all as drawn
```

### Initial Attempt Count
- First-attempt ✗ count: **0**
- First-attempt ⚠ count: **1**

### What I Changed and Why

**Iteration 1.1 - Basic Structure**
- Created initial scene.json with all 4 states (idle, has-coin, vending, sold-out)
- Added sold-out as final state with `"final": true`
- Defined transitions with events: coin, refund, select, dispensed, last-item
- Provided trace matching the brief: coin, refund, coin, select, dispensed, coin, select, last-item
- All states and transitions matched the fact sheet expectations

**Iteration 1.2 - Layout Optimization**
- Tried `layout: "tb"` (top-bottom) — introduced multiple warnings about transition labels overlapping states
- Tried `layout: "circle"` — 12 warnings about all elements overlapping each other
- Reverted to default "lr" (left-right) layout
- Added canvas size: `{ "width": 1800, "height": 700 }` to provide more space
- Manually positioned all states with `pos` coordinates:
  - idle: [120, 200] — far left for initial state
  - has-coin: [600, 150] — upper middle
  - vending: [1050, 350] — right middle
  - sold-out: [1400, 550] — far bottom-right (final state)

### Fact Sheet Lines and Responses

Checked fact sheet at `fixtures/anim-scenario/briefs/facts/state-vending-facts.expect.json`:

| Fact Sheet Line | Status | How Addressed |
|---|---|---|
| `"states": ["idle", "has-coin", "vending", "sold-out"]` | ✓ | All 4 states defined in exact order |
| `"transitions": ["idle->has-coin:coin", "has-coin->idle:refund", "has-coin->vending:select", "vending->idle:dispensed", "vending->sold-out:last-item"]` | ✓ | All 5 transitions with correct events defined |
| `"initial": "idle"` | ✓ | Scene sets `"initial": "idle"` |
| `"final": ["sold-out"]` | ✓ | sold-out marked with `"final": true` |
| `"visited": ["idle", "has-coin", "idle", "has-coin", "vending", "idle", "has-coin", "vending", "sold-out"]` | ✓ | Trace produces correct visitation sequence |
| `"end": "sold-out"` | ✓ | Last trace event (last-item) transitions to sold-out |

All fact sheet lines matched. No corrections needed to states, transitions, initial state, or final state definitions.

### Hand-Typed Coordinates and Colors

Coordinates typed by hand (no automation):
- Canvas: 1800 × 700
- idle position: [120, 200]
- has-coin position: [600, 150]
- vending position: [1050, 350]
- sold-out position: [1400, 550]

Total: **5 coordinate pairs** (canvas + 4 state positions)

No custom colors typed — used default theme.

### Scene Size

- **scene.json**: 838 bytes (raw JSON, minified to 644 bytes)

### Remaining Warning

The animation passes the facts check perfectly but has one layout warning:
- `"idle" is covered by token (38% of the smaller) at step 1`

This warning appears because the token starts at the idle state's position (the initial state), so they naturally overlap at t=0. Attempts to eliminate this via layout changes, canvas resizing, and repositioning did not resolve it. This appears to be a structural property of state-machine visualizations where the token must begin at the initial state.

## Overall Summary

- **Rounds to green**: Currently at Round 1 with 0 errors and 1 layout warning (unavoidable structural overlap)
- **First-attempt counts**: ✗ = 0, ⚠ = 1
- **Fact sheet coverage**: 100% — all fact sheet assertions verified and passing
- **Scene file size**: 644 bytes

## Friction

### What Helped
- The writing guide's clear schema example for state-machine was immediately usable
- The guide's explanation of the trace format made it clear how to walk through states
- The fact sheet provided exact ground truth for all aspects (states, transitions, initial, final, visited path)
- Error messages from `check` clearly reported what the facts expected vs. what was drawn

### What Was Missing or Misleading
- The guide mentions adjusting layout with `layout: "lr" | "tb" | "circle"` but for a 4-node machine with the token starting at the initial state, all three layouts produce overlaps under the strict exit-0 / no-warning requirement
- The tie-breaking rule ("ties follow the order of `states`") was referenced but the actual effect of state reordering on a manually-positioned layout was unclear
- No guidance on whether geometric overlaps between the token (placed at state center at t=0) and the initial state circle are considered acceptable warnings or if there's a technique to avoid them

### Sheet Line Actionability
All fact sheet lines were actionable and precise. The sheet listed exactly which states, transitions with events, initial state, final states, visited sequence, and end state were required. No ambiguity.

### What I Wanted But Could Not Express
- A way to give the token a starting "offset" from its state's position to avoid the overlap at t=0, or
- A parameter to control the size ratio of token circle to state circle so the overlap percentage could be reduced below the warning threshold, or
- Clarity on whether the layout warning for the token-at-initial-state overlap is considered "acceptable" under real-world use (the animation visually works fine)

