# vlmkit workspace: package dependencies — the figure read back vs its facts

reader: fa.reading-sonnet.json

| fact | read | missed | invented | note |
|---|---|---|---|---|
| modules | 11 | — | — |  |
| deps | 22 | anim->ai, anim->animation-eval, mcp->core, mcp->markup | mcp->generate, mcp->ai, generate->core, plan->core, markup->heal |  |
| group members | 10 | — | — |  |
| nesting | 0 | — | — |  |
| highlighted | 0 | — | — |  |

47 facts · read 43 · missed 4 · invented 5 · fidelity 0.83

layout defects — geometry: none · reader: crossed: many arrows from markup/heal (left group) to ai and from generate/plan/mcp (middle group) to core/capture cross diagonally through the 'pure (no Playwright)' container's left border and through the animation-eval and ai boxes; the crossing region between x~350-650 has 8-10 overlapping lines, making individual tails hard to attribute; overlap: two small grey 'peer' text labels (near generate/ai and near plan/ai) sit directly on top of crossing arrow lines rather than beside a single clear edge, so it is unclear which exact arrow each 'peer' label annotates; crossed: the long fan of arrows from 'vlmkit (root CLI)' at top right to the left-hand boxes (heal, markup, capture, core) passes directly through the 'pure (no Playwright)' container box, crossing several of that container's internal arrows

notes: All arrows and container borders appear plain black/dark-grey with solid strokes; no red or dashed lines were visible, so 'forbidden' is empty and any grey-dashed dependency the brief describes is not present in this image. No box or border used a strong accent fill/colour, so 'highlighted' is empty. Because 'core' and 'ai' each have 5-7 arrowheads converging on them from tightly-crossing lines, a few of the listed edges (especially heal->ai, markup->ai, and which of generate/plan carries the 'peer' label) are my best reading rather than certain; tails were inferred by nearest matching line angle into each convergence point.
