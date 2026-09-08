# Brief: a sprint plan that slips, shown as it happens

Produce `scene.json` (kind `gantt`) for a two-week sprint (unit: `day`,
days 0–10) of a small team, and play it day by day so the viewer sees where
the plan broke. Title: "Sprint 14".

Tasks (use these ids):

- `spec` — "Write spec", days 0–2, lane "Product"
- `api` — "API endpoints", days 2–6, lane "Backend", after `spec`
- `ui` — "Settings screen", days 2–7, lane "Frontend", after `spec`
- `wire` — "Wire UI to API", days 7–9, lane "Frontend", after `api` and `ui`
- `test` — "Regression run", days 9–10, lane "QA", after `wire`
- `demo` — "Sprint demo", a milestone at day 10, after `test`

What happens: on day 4 the API turns out to need a schema change and slips to
end on day 8 (say so in a caption). The wiring cannot start on day 7 any more:
mark it `late`, and slip it to days 8–10. The regression run is `blocked` at
day 9 and the demo is `late`. Play the cursor at least at days 2, 4, 7, 9 and
10. Add one `callout` at the wiring task saying it waited for the API.

Deliver `scene.json` and `log.md`.

Success: `vlmkit-anim check scene.json` exits 0 with no ✗ and no ⚠;
`vlmkit-anim layout scene.json` reports no issue; `explain` reads as the story
above, day by day.

Also record in `log.md`: the exact output of the first `check` run; each line
it reported and what you changed for it (quote the line); whether the slipped
bars, the statuses and the dependency arrows read correctly in a rendered
frame (`render --step N`), and what you looked at to decide; every coordinate,
colour or canvas size you typed by hand; anything you wanted and could not
express — a task that should move when its prerequisite slips, a way to show
who is assigned, a second axis.
