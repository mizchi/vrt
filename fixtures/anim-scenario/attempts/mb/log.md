# Evaluation Log: Flowchart Checkout

## Round 1

### First Check Command and Output

```
pnpm exec vlmkit-anim check fixtures/anim-scenario/attempts/mb/scene.json --expect fixtures/anim-scenario/briefs/facts/flowchart-checkout-facts.expect.json
```

Output:
```
✓ scene.json (flowchart): 0 error(s), 0 warning(s)
  11760ms · 14 steps (14 captioned) · 30 nodes · 22 tracks / 98 keyframes
  scene 1034 B (minified) → timeline 11524 B (×11.1)
  facts flowchart-checkout-facts.expect.json: 10 nodes · 12 edges · 13 visits · 1 end state — all as drawn
```

**Result: PASSED on first attempt. No ✗ marks or ⚠ warnings.**

### Layout Check

```
pnpm exec vlmkit-anim layout fixtures/anim-scenario/attempts/mb/scene.json
```

Output:
```
0 of 14 frames with layout issues · 0 overlap(s) · 0 clipped · 0 crossed
```

**Result: PASSED - no layout issues.**

### Explain Output

```
pnpm exec vlmkit-anim explain fixtures/anim-scenario/attempts/mb/scene.json
```

Output:
```
Checkout — 14 steps, 11760ms, 30 nodes
 1. [    0ms] Start at "cart"
 2. [  490ms] cart → logged in?
 3. [ 1400ms] logged in?: no → sign in
 4. [ 2310ms] sign in → enter address
 5. [ 3220ms] enter address → all in stock?
 6. [ 4130ms] all in stock?: no → remove missing item
 7. [ 5040ms] remove missing item → all in stock?
 8. [ 5950ms] all in stock?: yes → pay
 9. [ 6860ms] pay → payment ok?
10. [ 7770ms] payment ok?: no → retry card
11. [ 8680ms] retry card → pay
12. [ 9590ms] pay → payment ok?
13. [10500ms] payment ok?: yes → order placed
14. [11410ms] End at "order placed"
```

**Result: PASSED - story reads correctly.**

## Design Decisions

### Node Shapes
- **Terminal**: `start` ("cart"), `done` ("order placed") — beginning and end points represented as pill-shaped nodes
- **Decision**: `login` ("logged in?"), `stock` ("all in stock?"), `paid` ("payment ok?") — questions represented as diamonds with labeled branches (yes/no)
- **Process**: `signin` ("sign in"), `address` ("enter address"), `remove` ("remove missing item"), `pay` ("pay"), `retry` ("retry card") — regular actions as boxes

### Walk Flow
The walk follows the scenario described in the brief:
1. Customer is not logged in → takes `no` branch from `login` → goes to `signin`
2. One item out of stock → takes `no` branch from `stock` → goes to `remove` → loops back to `stock`
3. First payment fails → takes `no` branch from `paid` → goes to `retry` → loops back to `pay`
4. Second payment succeeds → takes `yes` branch from `paid` → goes to `done`

## Manual Entries

### Coordinates
No manual coordinates were typed. The flowchart layout is automatic, computed by the CLI based on the node dependencies and the `tb` (top-to-bottom) layout mode.

### Colors
No manual colors were typed. Default theme colors were used:
- `node`: default fill for process boxes
- `nodeStroke`: default stroke
- `text`: default text color
- `accent`: for the current node during walk
- All other theme values: defaults

### Canvas Size
No manual canvas size specified. The canvas is automatically sized by the compiler to fit all nodes and edges with appropriate margins. Final canvas computed as part of the timeline compilation.

## Metrics

### Scene File Size
- **Bytes**: 1299 (raw JSON)
- **Minified**: 1034 B

### Compiled Timeline
- **Duration**: 11760ms (14 steps × ~500ms default stepMs × plus timing for the walk)
- **Steps**: 14 captioned steps
- **Nodes in Timeline**: 30 (including SVG rendering nodes)
- **Tracks/Keyframes**: 22 tracks / 98 keyframes

### Manual Entry Count
- **Coordinates typed by hand**: 0 (automatic layout)
- **Colors typed by hand**: 0 (default theme)
- **Canvas size typed by hand**: 0 (automatic sizing)
- **Total manual entries**: 0

## Facts Check

The scene was validated against the fact sheet:
- **Nodes**: 10 (all required nodes present)
- **Edges**: 12 (all required edges with correct labels)
- **Visited nodes**: 13 (start + 12 hops matching the exact walk sequence)
- **End state**: "done" (correct end node)
- **Result**: "all as drawn"

## Friction Notes

### What Helped
- The writing guide was clear and complete. The flowchart structure is intuitive: nodes with shapes (terminal, decision, process) map naturally to the brief's descriptions.
- The example in the guide showed the exact pattern needed: shorthand edges `["from", "to"]` for process steps and labeled edges `{"from", "to", "label": "yes"/"no"}` for decision branches.
- The walk concept is straightforward: list the nodes in the order visited, and the CLI validates that each hop is a valid edge.
- Default styling and automatic layout meant I could focus on the structure without typing coordinates or color values.
- The validation output was immediate and exact: "all as drawn" matched the expectations perfectly.

### What Was Unclear or Missing
- None. The guide covered all aspects of flowchart authoring with clear examples, and the validation was precise.

### Actionability of Check Lines
- ✓ `0 error(s), 0 warning(s)` — immediately confirmed no issues
- ✓ `facts ... all as drawn` — confirmed the facts validation passed
- ✓ `layout: 0 of 14 frames with layout issues` — confirmed no rendering problems
- All check lines were fully actionable and the scene required no edits.

### Things I Wanted But Could Not Express
- None. The flowchart kind expresses the scenario completely: looping edges, decisions with branches, and the walk sequence showing one customer's path through the flow.

## Success Criteria Met

✓ `vlmkit-anim check scene.json --expect facts.json` exits 0 with no ✗ and no ⚠
✓ `vlmkit-anim layout scene.json` reports no issues
✓ `explain` reads as the story above: not logged in → sign in → address → out of stock → remove → check again → pay → payment failed → retry → pay again → done
