# A shop, with the backend's own layers — the figure read back vs its facts

reader: modules-nested.reading-sonnet.json

| fact | read | missed | invented | note |
|---|---|---|---|---|
| modules | 8 | — | — |  |
| deps | 10 | — | — |  |
| group members | 8 | — | — |  |
| nesting | 2 | — | — |  |
| highlighted | 0 | — | — |  |

28 facts · read 28 · missed 0 · invented 0 · fidelity 1

layout defects — geometry: none · reader: crossed: the six arrows fanning from 'orders' and 'billing' down to 'domain model', 'Postgres' and 'event bus' cross each other repeatedly in the open area below the services box, forming a dense X-hatch that makes it hard to trace which tail goes with which head; other: the container label 'core' sits at the bottom-left of its own box, under the 'domain model' box, instead of the top-left position used by every other container label (clients, backend, services, infrastructure) — at a glance it reads like a caption for the box above it rather than the container's name

notes: All arrowheads are clear at their destinations, so the ten dependencies above are read from arrowhead position, not just line endpoints; none of the six crossing lines in the services->core/infrastructure fan appeared to run through the 'domain model' or 'Postgres' boxes themselves or through the 'core' label — they pass just above the core container before diverging to Postgres and event bus.
