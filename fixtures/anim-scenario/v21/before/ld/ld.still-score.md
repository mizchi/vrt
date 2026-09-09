# packages/vlmkit-capture/src — modules and their relative imports — the figure read back vs its facts

reader: ld.reading-sonnet.json

| fact | read | missed | invented | note |
|---|---|---|---|---|
| modules | 15 | — | — |  |
| deps | 11 | route-capture->capture-config, index->prescanner, index->crater-smoke, index->batch-prescan, prescanner->detection-types | index->capturer, route-capture->crater-client, viewport-discovery->cloudflare-quick-actions, batch-prescan->prescanner, prescanner->crater-smoke, crater-smoke->detection-types, crater-wasm->detection-types |  |
| group members | 15 | — | — |  |
| nesting | 0 | — | — |  |
| highlighted | 0 | — | — |  |

46 facts · read 41 · missed 5 · invented 7 · fidelity 0.77

layout defects — geometry: none · reader: crossed: the long fan-out arrows from 'index' run almost horizontally all the way to 'cr-client', 'cr-wasm' and 'det-types', passing very close under the 'batch-pre', 'prescanner' and 'cr-smoke' boxes and the 'Crater side' container label on the way — hard to tell whether they graze or actually cut through those boxes; crossed: the single line out of 'route-cap' crosses through the middle of the index fan-out bundle around the 'cap-config' / 'pw-analyzer' region, making it hard to isolate as a distinct edge; other: in the dense bundle of near-parallel lines converging on the 'cr-client' / 'cr-wasm' / 'det-types' cluster, individual line endpoints are difficult to trace back to a single unambiguous source, so the exact count and pairing of arrows into that cluster is uncertain

notes: The fan of ~9 lines out of 'index' is the dominant and hardest-to-read feature: all lines leave the same corner of the box at slightly different angles, so tracing which line ends at which far-right box (cr-client vs cr-wasm vs det-types) required following slope by eye rather than a clean visual path. Arrowheads at cr-smoke/cr-client/det-types are also small and clustered, so the cr-smoke<->cr-client and cr-smoke->det-types directions are my best reading rather than certain.
