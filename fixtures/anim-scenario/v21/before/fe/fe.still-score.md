# Ports and adapters: dependency flow — the figure read back vs its facts

reader: fe.reading-sonnet.json

| fact | read | missed | invented | note |
|---|---|---|---|---|
| modules | 7 | — | — |  |
| deps | 5 | app-svc->repo-port, domain->postgres | domain->repo-port | reversed: domain->postgres |
| group members | 7 | — | — |  |
| nesting | 0 | — | — |  |
| highlighted | 0 | — | — |  |

21 facts · read 19 · missed 2 · invented 2 · fidelity 0.83 · names that resolve to nothing drawn: "red X mark with the word "FORBIDDEN" beside it, sitting just left of/below the Domain model box"

layout defects — geometry: none · reader: other: the 'Core domain' container and the 'Adapters (driven side)' container do not nest cleanly — their borders overlap, and 'Repository port (interface)' sits inside both borders at once; crossed: the red X / 'FORBIDDEN' callout sits right where a line from Postgres adapter running up toward Domain model would cross close to the Domain model box's lower-left corner, marking that path as disallowed; overlap: the 'Core domain' label is written below the Repository port (interface) box rather than inside a clearly separate labeled band, so it reads as floating text under that box

notes: The line I read as 'Postgres adapter->Domain model' is my best-effort reading of a diagonal line passing through the red X/FORBIDDEN callout region; at this resolution I cannot fully confirm whether its tail is Postgres adapter and its head is Domain model versus Application services, or whether the callout marks a crossing of two other arrows rather than a distinct line of its own. All other arrows (converging into Application services, the vertical chain down to Repository port, and the two adapter arrows into Repository port) read as plain solid arrows, not dashed.
