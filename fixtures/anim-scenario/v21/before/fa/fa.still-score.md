# vlmkit workspace: package dependencies — the figure read back vs its facts

reader: fa.reading-sonnet.json

| fact | read | missed | invented | note |
|---|---|---|---|---|
| modules | 11 | — | — |  |
| deps | 17 | ai->core, anim->ai, anim->animation-eval, mcp->core, mcp->markup, cli->ai, cli->animation-eval, cli->capture, cli->core | mcp->generate, mcp->ai, generate->core, plan->core |  |
| group members | 10 | — | — |  |
| nesting | 0 | — | — |  |
| highlighted | 0 | — | — |  |

47 facts · read 38 · missed 9 · invented 4 · fidelity 0.75

layout defects — geometry: none · reader: crossed: the arrows converging on 'core' and 'ai' overlap heavily in the middle of the figure; several of the lines running from 'markup'/'heal' toward 'core' pass directly over or beside the 'capture' and 'animation-eval' boxes rather than approaching only their own endpoints; other: six-plus lines fan out of 'vlmkit (root CLI)' and bunch tightly together as they cross the middle of the image, so pairing each line to its exact head (mcp vs. generate vs. plan vs. ai) is a best-effort read rather than a certain one; illegible: the two small gray 'peer' labels near the 'ai' box (between generate/ai and plan/ai) are faint and low-contrast against the light background, though still legible on close inspection

notes: Two arrows are labeled 'peer' near the 'ai' box, read here as generate->ai and plan->ai; all arrows appear to be solid (no dashed lines observed). Given the density of crossing lines in the central/lower region, some tail attributions for arrows terminating at 'core' and 'ai' (e.g. generate->core, plan->core, mcp->ai) are lower-confidence reads.
