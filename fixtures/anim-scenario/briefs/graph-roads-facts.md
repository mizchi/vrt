# Brief: the shortest route, checked against what the algorithm actually does

Produce `scene.json` (kind `graph`) that runs Dijkstra on this road map and
shows the shortest route from `S` to `T`.

Nodes (use these ids): `S`, `A`, `B`, `C`, `D`, `T`. Roads (undirected, with
lengths): S–A 2, S–B 5, A–B 2, A–C 6, B–C 1, B–D 5, C–T 2, D–T 1. Title:
"Shortest route S → T".

A fact sheet is at `facts/graph-roads-facts.expect.json`. It fixes what the
animation must do, not only what it draws: which nodes exist and which roads,
the **order the algorithm visits the nodes**, the **path lit at the end**, and
the **distance labels** left beside the nodes. Write the scene so that it does
these things; do not copy the visit order into hand-written ops unless the
guide leaves you no other way — record which way you chose.

Deliver `scene.json` and `log.md`.

Success: `vlmkit-anim check scene.json --expect facts/graph-roads-facts.expect.json`
exits 0 with no ✗ and no ⚠; `vlmkit-anim layout scene.json` reports no issue;
`explain` reads as Dijkstra.

Also record in `log.md`: the exact output of the first `check --expect` run;
each line the sheet reported, and whether the line told you what to change
(quote it and say what you edited); how you produced the visit order (a field,
or ops by hand); every coordinate, colour or canvas size you typed by hand;
anything you wanted and could not express.
