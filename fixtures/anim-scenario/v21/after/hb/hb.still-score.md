# Ports and Adapters (Hexagonal Architecture) — the figure read back vs its facts

reader: hb.reading-sonnet.json

| fact | read | missed | invented | note |
|---|---|---|---|---|
| modules | 7 | — | — |  |
| deps | 7 | — | — |  |
| forbidden | 1 | — | — |  |
| group members | 7 | — | — |  |
| nesting | 0 | — | — |  |
| highlighted | 0 | — | — |  |

22 facts · read 22 · missed 0 · invented 0 · fidelity 1

layout defects — geometry: none · reader: none

notes: The red dashed arrow (labeled 'never') runs from domain up to postgres, passing close to the port box and near where the postgres->port and memory->port arrows converge, making that junction the densest part of the figure. All text otherwise reads clearly with no obvious overlap, clipping, or line-through-label/box.
