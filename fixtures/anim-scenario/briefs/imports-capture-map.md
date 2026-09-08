# Brief: the capture package, drawn from its source and checked against its imports

Produce `scene.json` — a **still figure**, kind `modules` — that maps the
source directory `packages/vlmkit-capture/src` of this repository: one module
per top-level entry of that directory (a file is one module, named without its
extension; a directory is one module; test files — `*.test.ts` — are not part
of the map), and one dependency for every relative
import that crosses from one module to another. Read the source files to find
them; that is the task. Group the modules by role as you read them (the
Playwright side, the Crater side, configuration, the public surface — your
call), and give the figure a title.

A fact sheet is at `facts/imports-capture-map.expect.json`. It was written by
the tool from the same import statements, so `check --expect` compares your
reading of the code with the code. It fixes the modules and the dependencies;
groups are yours.

Deliver `scene.json`, `figure.svg` (`vlmkit-anim still`) and `log.md`.

Success: `vlmkit-anim check scene.json --expect facts/imports-capture-map.expect.json`
exits 0 with no ✗ and no ⚠; `vlmkit-anim layout scene.json` reports no issue.

Also record in `log.md`: the exact output of the first `check --expect` run;
each line the sheet reported — an import you missed, one you invented, one
drawn backwards — and what you changed for it (quote the line); how you read
the imports (by hand, with grep, …) and how long the reading took against the
drawing; every coordinate, colour or canvas size you typed by hand; anything
you wanted in the figure and could not express.
