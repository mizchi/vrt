# Monorepo architecture — the figure read back vs its facts

reader: nc.reading-sonnet.json

| fact | read | missed | invented | note |
|---|---|---|---|---|
| modules | 10 | — | — |  |
| deps | 10 | catalog->shared-types, orders->shared-types, api->logger | catalog->logger |  |
| group members | 10 | — | — |  |
| nesting | 2 | — | — |  |
| highlighted | 0 | — | — |  |

35 facts · read 32 · missed 3 · invented 1 · fidelity 0.89

layout defects — geometry: none · reader: none

notes: All arrows are solid (no dashed edges seen). Two regions have arrows crossing each other in open space (auth->shared-types crosses catalog->logger below the services row; catalog->db and orders->db converge/cross on their way into db) but none of these lines pass through a box or a text label, so they are not listed as 'crossed' issues per the brief's definition -- just noted as visually dense. The admin->api arrow is a long diagonal that dips across the top border of the 'platform' container on its way to api; this is a container-boundary crossing, not a label/box crossing, so also not flagged.
