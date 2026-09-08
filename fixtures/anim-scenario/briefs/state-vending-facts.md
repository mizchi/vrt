# Brief: a vending machine's states, checked against the trace

Produce `scene.json` (kind `state-machine`) for a vending machine, and walk
one afternoon's trace through it.

States (use these ids): `idle`, `has-coin`, `vending`, `sold-out`. The
machine starts in `idle`; `sold-out` is a final state (nothing leaves it).
Transitions, with the event that fires each:

- idle → has-coin on `coin`
- has-coin → idle on `refund`
- has-coin → vending on `select`
- vending → idle on `dispensed`
- vending → sold-out on `last-item`

The trace to walk, in order: `coin`, `refund`, `coin`, `select`, `dispensed`,
`coin`, `select`, `last-item`. Title: "Vending machine: the last item".

A fact sheet is at `facts/state-vending-facts.expect.json`. Besides the states
and the transitions **with their events**, it fixes the initial state, which
states are final, the **sequence of states the token walks** and the state it
**ends in**.

Deliver `scene.json` and `log.md`.

Success: `vlmkit-anim check scene.json --expect facts/state-vending-facts.expect.json`
exits 0 with no ✗ and no ⚠; `vlmkit-anim layout scene.json` reports no issue.

Also record in `log.md`: the exact output of the first `check --expect` run;
each line the sheet reported and what you changed for it (quote the line);
every coordinate, colour or canvas size you typed by hand; anything you wanted
and could not express.
