# Ports and adapters: dependencies point inward — the figure read back vs its facts

reader: ga.reading-sonnet.json

| fact | read | missed | invented | note |
|---|---|---|---|---|
| modules | 7 | — | — |  |
| deps | 6 | — | — |  |
| forbidden | 1 | — | — |  |
| group members | 7 | — | — |  |
| nesting | 0 | — | — |  |
| highlighted | 0 | — | — |  |

21 facts · read 21 · missed 0 · invented 0 · fidelity 1

layout defects — geometry: none · reader: crossed: the CLI command->Application services arrow cuts across the top border of the 'Application & domain' container on its way in; crossed: the red dashed forbidden arrow (Domain model->Postgres repository) crosses the solid Application services->Repository port arrow right where its 'never: domain must not import the driver' label sits

notes: All six plain dependency arrows render as solid black; no arrow was visibly grey/dashed apart from the one red-dashed forbidden arrow, so none is reported as a grey-dashed dependency. The forbidden arrow's tail sits right at the Domain model/Application services boundary; read as Domain model->Postgres repository based on the label text 'domain must not import the driver'.
