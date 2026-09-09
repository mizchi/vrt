# vlmkit — the workspace and its dependencies — the figure read back vs its facts

reader: arch.reading-sonnet.json

| fact | read | missed | invented | note |
|---|---|---|---|---|
| modules | 11 | — | — |  |
| deps | 17 | vlmkit (cli)->animation-eval, vlmkit (cli)->capture, vlmkit (cli)->generate, ai->core, anim->ai, generate->ai, markup->capture, mcp->core, mcp->markup | markup->anim, mcp->ai, plan->core, capture->ai |  |
| group members | 0 | — | — |  |
| nesting | 0 | — | — |  |
| highlighted | 0 | — | — |  |

37 facts · read 28 · missed 9 · invented 4 · fidelity 0.68

layout defects — geometry: none · reader: crossed: near the 'ai' and 'core' boxes many arrow tails from vlmkit (cli), mcp, markup, plan, capture and heal converge and overlap, so individual lines are hard to trace back to one exact source with certainty; other: the 'generate' box (between mcp and ai) shows no clearly visible arrow touching it, unlike every other counted module; crossed: the long diagonal lines running from vlmkit (cli) up to markup and anim pass close beside/over the mcp and generate boxes, making it ambiguous whether they start at cli or at one of those boxes

notes: All arrows appear solid black (no red-dashed or grey-dashed lines seen), so 'forbidden' is empty and no dashed-style dependency is called out. No rounded container groups distinct from the module boxes themselves were visible, so groups/nesting are empty. Direction and exact source of several arrows feeding into ai/core (especially from markup, plan, capture, heal) were read as best-guess given heavy line crossing near that cluster; the arrow into markup from below (possibly involving generate or ai) is the least certain edge in this reading.
