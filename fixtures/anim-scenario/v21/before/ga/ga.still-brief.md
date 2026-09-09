# Read this figure: Ports and adapters: dependencies point inward

The image is one still figure: boxes (each a module), rounded containers drawn round some of them, and
arrows between boxes (each a dependency: from the arrow's tail to its head).

Read the figure back, exactly as drawn — do not infer what "should" be there:

- **modules**: the text in every box, spelled as written.
- **deps**: every plain arrow as `"tail->head"` using the box texts. The head is the end with the arrowhead.
  A grey dashed arrow counts as a dependency too; say so in notes if it looks different from the others.
- **forbidden**: every **red dashed** arrow, the same way — it draws a dependency that must not exist (often with
  a "✗" or "never" label). List it here, not in deps and not in highlighted.
- **groups**: for every container, its label and the boxes **directly** inside it — a box inside an inner
  container belongs to the inner one, not the outer.
- **nesting**: every container drawn inside another container: `"inner": "outer"`.
- **highlighted**: anything filled or outlined in a strong accent colour (not the plain box outline).
- **issues**: layout defects only — `overlap` (text on text, or text under a box that is not its own),
  `clipped` (text cut at the edge), `crossed` (a line or arrow through a label or through a box that is not
  one of its ends), `illegible` (too small to read), `other`. Say what and where.

If a name is hard to read, write what you see and add a note. If an arrow's direction is unclear, put your
best reading in deps and name the arrow in notes.

Return **only** JSON of this shape:

```json
{
  "modules": ["web app", "API gateway"],
  "deps": ["web app->API gateway"],
  "forbidden": ["domain model->Postgres"],
  "groups": { "clients": ["web app"], "backend": ["API gateway"] },
  "nesting": { "services": "backend" },
  "highlighted": [],
  "issues": [ { "kind": "crossed", "what": "the arrow from orders to Postgres runs through the label 'core'" } ],
  "notes": "optional"
}
```
