# vlmkit workspace modules and dependencies — the figure read back vs its facts

reader: hd.reading-sonnet.json

| fact | read | missed | invented | note |
|---|---|---|---|---|
| modules | 9 | core, mcp | integration, foundation |  |
| deps | 16 | ai->core, anim->ai, animation-eval->core, capture->core, heal->core, markup->core, mcp->core, mcp->markup, vlmkit->core, vlmkit->mcp | vlmkit->integration, vlmkit->foundation, integration->markup, integration->foundation, heal->foundation, markup->foundation, anim->foundation, capture->foundation, animation-eval->foundation |  |
| group members | 9 | foundation: core, integration: mcp | integration: integration, foundation: foundation |  |
| nesting | 0 | — | — |  |
| highlighted | 0 | — | — |  |

48 facts · read 34 · missed 14 · invented 13 · fidelity 0.56

layout defects — geometry: none · reader: crossed: long diagonal arrows from 'heal' and 'markup' down to 'ai'/'capture'/'core' pass through or right along the 'Measurement' container's border and skirt the 'capture' and 'animation-eval' boxes, making exact tail/head pairing hard to verify by eye in that mid-lower zone; crossed: several of vlmkit's fan-out arrows to 'ai', 'capture', 'animation-eval' and 'core' run close past/through the 'mcp' box and the 'MCP' container label just below vlmkit; overlap: the small 'Core' container's top border sits almost flush against the bottom border of the 'Measurement' container, so it's ambiguous from the drawing alone whether 'core' is nested inside 'Measurement' or is a separate sibling container at the same level

notes: This is a dense, highly-crossed graph: many arrowheads converge on 'ai' and especially 'core' from multiple sources, and several long diagonals traverse most of the canvas width. Given the volume of overlapping lines in the central/lower area, the deps list above is my best-effort reading of tail->head pairs by tracing each line to its arrowhead; a few of the heal/markup/mcp-sourced edges into ai/capture/animation-eval/core are the ones I'm least certain about. No dashed arrows were observed (all lines appear solid/uniform weight). No strong accent-color fills or outlines were seen on any box or container.
