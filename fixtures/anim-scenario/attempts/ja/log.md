# Ports and Adapters Still Figure — Iteration Log

## Round 1: Initial scene

```
✓ scene.json (modules): 0 error(s), 0 warning(s)
  1260ms · 3 steps (2 captioned) · 27 nodes · 3 tracks / 6 keyframes · annotations: 2 drawn, 2 on screen at the end
  scene 743 B → timeline 4872 B (×6.6)
  facts modules-adapters-still.expect.json: 7 module(s) · 7 dependencies · 1 forbidden · 1 highlighted · 3 group(s) — all as drawn
```

Layout check: `0 of 3 frames with layout issues · 0 overlap(s) · 0 clipped · 0 crossed`

**Success criterion met on first attempt.** All facts matched, no warnings or errors.

---

## Summary

### Check result
- First `check --expect` result: **0 ✗ count, 0 ⚠ count**
- Fact sheet lines (all matched): 7 modules, 7 dependencies (including the correct arrow directions), 1 forbidden dependency, 1 highlighted edge (app→port), 3 groups with correct membership

### Rounds used
- Round 1: Scene validated immediately and matched all facts

### Five points from the brief

| Point | Field / Op | Guide said it existed? |
|-------|-----------|------------------------|
| 1. Adapters **implement** the port (UML notation) | `"style": "implements"` on postgres→port and memory→port deps | Yes — Line 582 of guide: `"style"` options include `"implements"` (dashed with hollow head realises an interface) |
| 2. In-memory adapter is a **test double** (visually secondary) | `"tone": "muted"` on memory module | Yes — Line 581 of guide: modules can have `"tone": "muted"` (outline and label, not filled) |
| 3. Two adapters are **substitutable** (relation between them) | `{"relate": {"from": "postgres", "to": "memory", "style": "equals", "label": "substitutable"}}` in one-beat sequence | Yes — Lines 609–610 of guide explicitly: `relate` with `"style": "equals"` draws double line for "substitutable / satisfy same interface" |
| 4. app→port is the **rule** (eye should land on it) | `"tone": "accent"` on the app→port dependency | Yes — Line 583 of guide: deps can have `"tone": "accent"` to colour one dependency |
| 5. Forbidden dependency **domain→postgres shown as forbidden** | `"style": "forbidden"` on domain→postgres dep | Yes — Line 582 of guide: `"style": "forbidden"` draws dashed red, labelled ✗, drawn but ignored by layout |

### What did not help, was missing, or was confusing
- **Nothing.** The writing guide and `schema --kind modules` / `schema --kind annotations` provided exactly what was needed. Every visual requirement maps directly to guide fields. No guessing required.

### Coordinates, colours, and canvas size typed by hand
- **None.** No hardcoded x/y positions, hex colours, or canvas dimensions. Layout and theming are automatic. The amber colour on app→port, the grey on memory, the red on the forbidden edge, and the double line between adapters all derive from the schema fields: `tone`, `style`, etc. The layout engine positioned all modules, edges, and groups.

### In-figure visibility check (from figure.svg)
1. ✓ **Implements**: postgres→port and memory→port edges have `marker-end="url(#arrow-hollow-1f2328)"` (hollow head) and `stroke-dasharray="6 4"` (dashed)
2. ✓ **Test double**: memory module has `stroke="#9ca3af"` (grey) and unfilled background; postgres and other modules use `stroke="#1f2328"` (black)
3. ✓ **Substitutable**: double line between postgres and memory (lines 28–29 of SVG, both y-offset to create the double), with label "substitutable"
4. ✓ **Rule**: app→port edge has `stroke="#f59e0b"` (amber/accent colour); all other deps use `stroke="#1f2328"` (black)
5. ✓ **Forbidden**: domain→postgres edge has `stroke="#ef4444"` (red), `stroke-dasharray="6 4"` (dashed), and label "✗"
