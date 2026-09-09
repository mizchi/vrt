# Brief: the checkout flow, as a flowchart the reader can follow

Produce `scene.json` (kind `flowchart`) that walks one customer through an
online checkout. Title: "Checkout".

The steps and questions (use these ids):

- `start` — "cart" (where the flow begins)
- `login` — "logged in?" (a question)
- `signin` — "sign in"
- `address` — "enter address"
- `stock` — "all in stock?" (a question)
- `remove` — "remove missing item"
- `pay` — "pay"
- `paid` — "payment ok?" (a question)
- `retry` — "retry card"
- `done` — "order placed" (the end)

The flow: cart → logged in? — if no, sign in and then continue to the address;
if yes, straight to the address. Address → all in stock? — if no, remove the
missing item and ask again; if yes, pay. Pay → payment ok? — if no, retry the
card and pay again; if yes, order placed.

The walk to show: this customer is not logged in, one item is out of stock, and
the first payment fails once. Write the walk so that every hop follows an edge.

A fact sheet is at `facts/flowchart-checkout-facts.expect.json`: the nodes,
every edge with the answer it carries, the walk in order, and where it ends.

Deliver `scene.json` and `log.md`.

Success: `vlmkit-anim check scene.json --expect facts/flowchart-checkout-facts.expect.json`
exits 0 with no ✗ and no ⚠; `vlmkit-anim layout scene.json` reports no issue;
`explain` reads as the story above.

Also record in `log.md`: the exact output of the first `check --expect` run;
each line the sheet or the check reported and what you changed for it (quote
the line); which shapes you gave which nodes and how you decided; every
coordinate, colour or canvas size you typed by hand; anything you wanted and
could not express — a step that needed a shape the kind does not have, a loop
you could not draw, a caption you could not phrase.
