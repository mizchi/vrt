# Ports and adapters: dependencies point inward — the figure read back vs its facts

reader: ga.reading-sonnet.json

| fact | read | missed | invented | note |
|---|---|---|---|---|
| modules | 7 | — | — |  |
| deps | 6 | — | — |  |
| forbidden | 1 | — | — | read as plain: domain->postgres |
| group members | 7 | — | — |  |
| nesting | 0 | — | — |  |
| highlighted | 0 | — | — |  |

21 facts · read 21 · missed 0 · invented 0 · fidelity 1

layout defects — geometry: none · reader: crossed: the solid arrow from 'Application services' to 'Repository port' runs through the red label text 'never: domain must not import the driver'

notes: The 'Domain model->Postgres repository' edge is drawn dashed and in red (all other arrows are solid black); its label 'never: domain must not import the driver' sits directly on its own path, which reads as intentional annotation of that edge, not a defect. The label text is small and only legible because it's isolated in the empty band between the two box rows; it is the hardest part of the image to read at a glance since a second line (the Application services->Repository port arrow) passes directly through it, momentarily reading as one broken line.
