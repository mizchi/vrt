# Ports and adapters: dependency flow — the figure read back vs its facts

reader: fe.reading-sonnet.json

| fact | read | missed | invented | note |
|---|---|---|---|---|
| modules | 7 | — | — |  |
| deps | 4 | http->app-svc, app-svc->repo-port, domain->postgres | http->repo-port, domain->repo-port |  |
| forbidden | 0 | — | domain->postgres |  |
| group members | 7 | — | — |  |
| nesting | 0 | — | — |  |
| highlighted | 0 | — | — |  |

21 facts · read 18 · missed 3 · invented 3 · fidelity 0.75

layout defects — geometry: none · reader: none

notes: All plain arrows are solid black (no grey dashed arrow present). The HTTP handler->Repository port (interface) arrow runs a long path down the left side, close alongside the Domain model box, which made its endpoint slightly easy to confuse with Domain model at a glance, though it does not appear to cross the box itself.
