# Brief: two-phase commit with one lost ack, checked message by message

Produce `scene.json` (kind `distributed`) that shows a two-phase commit between
a coordinator and two participants, where one acknowledgement is lost and the
coordinator resends the commit.

Nodes (use these ids): `coord` (the coordinator, the leader from the start),
`p1`, `p2`. Title: "Two-phase commit: a lost ack".

The messages, in this order:

1. coord → p1 `prepare`
2. coord → p2 `prepare`
3. p1 → coord `yes`
4. p2 → coord `yes`
5. coord → p1 `commit`
6. coord → p2 `commit`
7. p1 → coord `ack`
8. p2 → coord `ack` — **lost**: it never arrives
9. coord → p2 `commit again` (the coordinator times out and resends)
10. p2 → coord `ack again`

`p2` applies the resent commit slowly: when `commit again` lands, p2 becomes
`busy`, and it is still busy at the end. Everyone else ends as they started.

A fact sheet is at `facts/distributed-2pc-facts.expect.json`: the lanes, every
message **in order with its label**, which message is lost, and each node's
status in the final frame.

Deliver `scene.json` and `log.md`.

Success: `vlmkit-anim check scene.json --expect facts/distributed-2pc-facts.expect.json`
exits 0 with no ✗ and no ⚠; `vlmkit-anim layout scene.json` reports no issue;
`explain` reads as the protocol.

Also record in `log.md`: the exact output of the first `check --expect` run;
each line the sheet reported and what you changed for it (quote the line);
how you timed the resend (which field made "after the ack was lost" sayable);
every coordinate, colour or canvas size you typed by hand; anything you wanted
and could not express.
