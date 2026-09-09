# Brief: placing an order, as a sequence diagram with one retry

Produce `scene.json` (kind `sequence`) of a customer placing an order through
a shop's services, with a payment that fails once. Title: "Place order".

Participants (use these ids, left to right): `customer` (an actor), `shop`,
`stock`, `payment`, `mail`.

The messages, in order:

1. customer → shop `place order`
2. shop → stock `reserve(items)`
3. stock → shop `reserved` — a return
4. a `loop` frame labelled "until paid, max 2":
   - shop → payment `charge(card)`
   - an `alt` frame with two branches:
     - `declined`: payment → shop `declined` — a return
     - `approved`: payment → shop `receipt` — a return
5. shop → mail `send confirmation` — async, no reply expected
6. shop → customer `order #4711` — a return

A fact sheet is at `facts/sequence-checkout-facts.expect.json`: the participants,
and the messages **in order with their labels**, frames flattened.

Deliver `scene.json` and `log.md`.

Success: `vlmkit-anim check scene.json --expect facts/sequence-checkout-facts.expect.json`
exits 0 with no ✗ and no ⚠; `vlmkit-anim layout scene.json` reports no issue;
`explain` reads as the story above.

Also record in `log.md`: the exact output of the first `check --expect` run;
each line the sheet or the check reported and what you changed for it (quote
the line); in a rendered frame (`render --step N` or `still`), whether the
activation bars start and end where you expect (which participant is "busy"
while payment is charging?) and whether the two frames are drawn around the
right messages; every coordinate, colour or canvas size you typed by hand;
anything you wanted and could not express.
