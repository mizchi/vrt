# Brief: a monorepo's map, with the containers inside containers

Produce `scene.json` — a **still figure**, kind `modules` — for a monorepo's
architecture page. The point of the picture is the nesting: the `platform`
container holds two containers of its own, and the reader must see which
packages live in which.

Modules (use these ids): `web`, `admin`, `api`, `auth`, `catalog`, `orders`,
`shared-types`, `logger`, `db`, `queue`. Dependencies (a → b: a depends on b):
web → api; admin → api; api → auth; api → catalog; api → orders;
auth → shared-types; catalog → shared-types; orders → shared-types;
catalog → db; orders → db; orders → queue; api → logger; auth → logger.

Containers (use these ids):

- `apps` — web, admin
- `platform` — api, and inside it two containers:
  - `services` (inside `platform`) — auth, catalog, orders
  - `kernel` (inside `platform`) — shared-types, logger
- `infra` — db, queue

A fact sheet is at `facts/modules-nested-still.expect.json`; it fixes the
modules, the dependencies and each container's **own** members.

Deliver `scene.json`, `figure.svg` (`vlmkit-anim still`) and `log.md`.

Success: `vlmkit-anim check scene.json --expect facts/modules-nested-still.expect.json`
exits 0 with no ✗ and no ⚠; `vlmkit-anim layout scene.json` reports no issue;
in `figure.svg`, the `services` and `kernel` boxes lie inside the `platform`
box and `api` lies inside `platform` but outside both.

Also record in `log.md`: the exact output of the first `check --expect` run;
each line it reported and what you changed for it (quote the line); how you
expressed the nesting and whether the guide told you how; what you looked at
in `figure.svg` to confirm the boxes nest; every coordinate, colour or canvas
size you typed by hand; anything you wanted and could not express.
