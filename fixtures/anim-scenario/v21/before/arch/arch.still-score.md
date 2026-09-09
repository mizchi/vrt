# vlmkit — the workspace and its dependencies — the figure read back vs its facts

reader: arch.reading-sonnet.json

| fact | read | missed | invented | note |
|---|---|---|---|---|
| modules | 11 | — | — |  |
| deps | 16 | vlmkit (cli)->ai, vlmkit (cli)->animation-eval, vlmkit (cli)->capture, vlmkit (cli)->generate, vlmkit (cli)->markup, anim->ai, animation-eval->core, heal->core, markup->capture, mcp->core | mcp->ai, markup->anim, ai->animation-eval, plan->core, capture->ai |  |
| group members | 0 | — | — |  |
| nesting | 0 | — | — |  |
| highlighted | 0 | — | — |  |

37 facts · read 27 · missed 10 · invented 5 · fidelity 0.64 · names that resolve to nothing drawn: "the number "11" in "packages so far: 11" (orange/amber text, top right — no boxes are filled or outlined in an accent colour)"

layout defects — geometry: none · reader: crossed: the near-horizontal lines fanning from vlmkit (cli)/mcp toward ai and core pass directly over the 'generate' box and label; overlap: two arrowheads land almost on top of each other at animation-eval's bottom edge (one from markup, one from ai), hard to tell apart as separate arrows; overlap: two arrowheads converge at anim's bottom point (from vlmkit (cli) and from markup), close enough to read as one thick arrow at first glance; crossed: the long diagonal from heal up to ai/core crosses through the capture->ai / capture->core lines near capture's top

notes: No rounded containers around multiple boxes were visible — every box is its own individually-rounded module, so groups/nesting are empty. The middle band (mcp, generate, ai, core, plus markup above and plan/capture/heal below) is a dense tangle of near-parallel diagonal/horizontal lines with several arrowheads bunched close together; I could not fully disambiguate every tail with certainty. Specific low-confidence calls: (1) whether the long horizontal line from vlmkit (cli) terminates at core or at ai — I read it as reaching core, passing near/through ai. (2) whether the second arrowhead into animation-eval originates at ai or at core — I read ai (its x-position lines up closest under animation-eval). (3) generate appears to have only one edge (to ai) with nothing else clearly entering or leaving it, which seems like a real possibility but could also be an edge I missed under the crossing lines. (4) the two arrows converging on anim's bottom vertex are so close together that assigning one to vlmkit (cli) and the other to markup is a best guess based on the shallower vs steeper slope, not a certain read.
