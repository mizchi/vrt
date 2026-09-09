# Ports and Adapters (Hexagonal Architecture) — the figure read back vs its facts

reader: hb.reading-sonnet.json

| fact | read | missed | invented | note |
|---|---|---|---|---|
| modules | 7 | — | — |  |
| deps | 7 | — | — |  |
| forbidden | 1 | — | — | read as plain: domain->postgres |
| group members | 7 | — | — |  |
| nesting | 0 | — | — |  |
| highlighted | 0 | — | — |  |

22 facts · read 22 · missed 0 · invented 0 · fidelity 1 · names that resolve to nothing drawn: "postgres arrow (dashed, red, labeled 'never')"

layout defects — geometry: none · reader: none

notes: The domain->postgres arrow is dashed and red (unlike the plain black solid arrows elsewhere) and carries the label 'never' in red near its midpoint; its exact tail (domain vs. the domain/port boundary) is a little ambiguous but it clearly points up into postgres. Between app and domain there appear to be two separate black arrows (app->port->domain chain plus a direct app->domain line) rather than a single path; I read three distinct arrows in that column (app->port, port->domain, app->domain) but the two long parallel lines are close enough that a different count is plausible.
