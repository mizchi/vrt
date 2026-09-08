# Brief: the adapters, as one still figure

Produce `scene.json` — a **still figure**, no walk — for a team's architecture
page. It shows the same ports-and-adapters service as before, but this time
the point of the picture is the **adapters**: how they relate to the port and
to each other.

Modules (use these ids): `http`, `cli`, `app`, `domain`, `port`, `postgres`,
`memory`. Dependencies: http → app; cli → app; app → domain; app → port;
port → domain; postgres → port; memory → port. The one that must not exist:
domain → postgres.

What the reader must take from the figure, in the figure itself (not in a
caption, not in a legend):

1. The two adapters **implement** the port — they do not merely call it. A
   reader who knows UML should recognise the notation.
2. The in-memory adapter is a **test double**: it exists for tests and is
   visually secondary to the Postgres one.
3. The two adapters are **substitutable** — either can stand behind the port.
   Say so between the two, as a relation, not as a caption.
4. The one dependency every newcomer must respect, app → port, is the one
   the eye should land on: it is the rule of the architecture.
5. The forbidden dependency domain → postgres is shown as forbidden.

Groups (use these ids): `driving` (http, cli), `core` (app, domain, port),
`adapters` (postgres, memory).

A fact sheet is at `facts/modules-adapters-still.expect.json`; it names what
the final frame must have lit, so what you emphasise has to be what it lists.

Deliver `scene.json`, `figure.svg` (`vlmkit-anim still`) and `log.md`.

Success: `vlmkit-anim check scene.json --expect facts/modules-adapters-still.expect.json`
exits 0 with no ✗ and no ⚠; `vlmkit-anim layout scene.json` reports no issue;
points 1–5 are each visible in `figure.svg`.

Also record in `log.md`: for each of the five points, which field or op you
used and whether the guide told you it existed; every coordinate, colour or
canvas size you typed by hand; anything you wanted in the figure and could not
express, or expressed only by animating.
