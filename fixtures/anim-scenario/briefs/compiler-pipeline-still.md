# Brief: a compiler's phases, as one still figure with three notes

Produce `scene.json` — a **still figure**, no walk — for the architecture page
of a small compiler. The picture is the module map; the point of *this*
picture is three notes a newcomer reads off it, each placed on a specific
side of the thing it is about.

Modules (use these ids): `lexer`, `parser`, `typeck`, `lower`, `codegen`,
`diagnostics`, `symbols`. Dependencies (a → b: a imports b): parser → lexer;
typeck → parser; typeck → symbols; lower → typeck; lower → symbols;
codegen → lower; parser → diagnostics; typeck → diagnostics. The one that must
not exist: codegen → parser (the backend never reads syntax). The dependency
the eye should land on: typeck → symbols — the table every later phase reads is
written here.

Groups (use these ids): `frontend` (lexer, parser), `middle` (typeck, lower),
`backend` (codegen), `shared` (diagnostics, symbols).

The three notes. Each is a `callout`, each must **coexist** with the others,
and each is asked for on the side named:

1. **Left of `lexer`**: "source text enters here" — the reader's eye starts at
   the left, so the entry point's note sits at the left edge of the figure.
2. **Right of `codegen`**: "machine code leaves here".
3. **Above `diagnostics`**: "every phase may report here; none may read it".

A fact sheet is at `facts/compiler-pipeline-still.expect.json`.

Deliver `scene.json`, `figure.svg` (`vlmkit-anim still`) and `log.md`.

Success: `vlmkit-anim check scene.json --expect facts/compiler-pipeline-still.expect.json`
exits 0 with no ✗ and no ⚠; `vlmkit-anim layout scene.json` reports no issue;
the three notes are visible in `figure.svg`.

Also record in `log.md`, **for each of the three notes**: the side you asked
for, and the side it actually landed on — open `figure.svg` and compare the
callout box's position with its module's (left means the box's right edge is
left of the module's left edge, and so on); whether its pointer runs through
any other module's box; and whether the figure's canvas is wider or taller
than the module map alone needs (compile the scene once with the `sequence`
removed and compare `canvas`). Then, as always: every coordinate, colour or
canvas size you typed by hand; anything you wanted in the figure and could not
express, or could only express by moving a note to a side you did not want.
