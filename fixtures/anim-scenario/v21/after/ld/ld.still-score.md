# packages/vlmkit-capture/src — modules and their relative imports — the figure read back vs its facts

reader: ld.reading-sonnet.json

| fact | read | missed | invented | note |
|---|---|---|---|---|
| modules | 15 | — | — |  |
| deps | 9 | route-capture->capture-config, crater-smoke->crater-client, index->prescanner, index->crater-smoke, index->batch-prescan, prescanner->detection-types, batch-prescan->crater-client | index->capturer, route-capture->crater-client, batch-prescan->crater-wasm, prescanner->crater-smoke, crater-smoke->detection-types |  |
| group members | 15 | — | — |  |
| nesting | 0 | — | — |  |
| highlighted | 0 | — | — |  |

46 facts · read 39 · missed 7 · invented 5 · fidelity 0.76

layout defects — geometry: none · reader: crossed: the long arrows from index to cr-client/cr-wasm/det-types run through the 'Playwright side' container and pass very close to (possibly through) the route-cap and batch-pre boxes on their way right, making it hard to confirm they don't terminate there instead; crossed: in the gap between the batch-pre/prescanner/cr-smoke row and the cr-client/cr-wasm/det-types row, several arrows cross each other (route-cap->cr-client, batch-pre->cr-wasm, cr-smoke->det-types all intersect in roughly the same small region), so which tail pairs with which head is genuinely ambiguous there; other: the 9 arrows fanning out of the single 'index' box all leave from almost the same point on its right edge, so near the origin they overlap and are hard to count/separate individually

notes: No red-dashed (forbidden) arrows and no grey-dashed arrows were visible — all arrows appear as plain solid black lines. No box or container is filled/outlined in an accent color, so highlighted is empty. The exact endpoints of the three crossing arrows in the middle-right cluster (route-cap, batch-pre, cr-smoke to cr-client/cr-wasm/det-types) are my best reading but could be permuted, e.g. batch-pre could go to cr-client instead of cr-wasm and cr-smoke to cr-client instead of det-types — the crossing point makes this genuinely hard to trace pixel-by-pixel. 'Crater side' and 'shared types' appear to be sibling top-level containers (not nested) based on their separate left/right boundaries.
