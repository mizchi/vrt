# vlmkit workspace modules and dependencies — the figure read back vs its facts

reader: hd.reading-sonnet.json

| fact | read | missed | invented | note |
|---|---|---|---|---|
| modules | 9 | core, mcp | integration, foundation |  |
| deps | 13 | ai->core, anim->ai, animation-eval->core, capture->core, heal->capture, heal->core, markup->animation-eval, markup->core, mcp->core, mcp->markup, vlmkit->ai, vlmkit->core, vlmkit->mcp | vlmkit->integration, vlmkit->foundation, integration->markup, integration->ai, integration->foundation, heal->foundation, markup->foundation, capture->foundation, animation-eval->foundation |  |
| group members | 9 | foundation: core, integration: mcp | integration: integration, foundation: foundation |  |
| nesting | 0 | — | — |  |
| highlighted | 0 | — | — |  |

48 facts · read 31 · missed 17 · invented 13 · fidelity 0.51

layout defects — geometry: none · reader: crossed: vlmkit's long arrow down to 'core' runs past/through the 'capture' and 'animation-eval' boxes on its way, making it hard to tell if it terminates at core or is actually two separate shorter arrows; crossed: several arrows converging on the 'ai' box (from mcp, heal, markup) cross close to the 'plan' and 'capture' boxes, so the exact tail of each line into 'ai' is ambiguous; other: the anim->animation-eval arrow is grey and dashed, visually distinct from the solid black arrows elsewhere, per the brief's note that a grey dashed arrow still counts as a dependency

notes: This figure has a large hub of lines radiating from 'vlmkit' and converging on 'ai' and 'core', with many near-parallel crossings in the middle of the image. The edges listed above are my best reading of tail/head from arrowhead position, but individual line identity is genuinely hard to verify where 6+ lines overlap near the 'ai' and 'core' boxes. The 'Synthesis' container's exact membership (heal, markup, anim vs. anim alone) is inferred from the label sitting at the container's top-right corner, matching the corner-label convention used by CLI/MCP/AI-LLM; no red or strong-accent-colored elements were visible anywhere in the image.
