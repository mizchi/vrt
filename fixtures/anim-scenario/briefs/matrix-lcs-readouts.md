# Brief: the LCS table, with the readouts where the reader looks

Produce `scene.json` (kind `matrix`) that fills the longest-common-subsequence
DP table for the strings `AB` (rows) and `BA` (columns): a 3×3 grid, first
row and first column zero, then `L[i][j] = L[i-1][j-1] + 1` when the letters
match, else `max(L[i-1][j], L[i][j-1])`. Row labels `∅`, `A`, `B`; column
labels `∅`, `B`, `A`. Title: "LCS(AB, BA) = 1".

Fill the table cell by cell, in row order, showing where each value comes
from (`from` on the `set`). Then the notes — each is asked for on a specific
side, and where it lands is the point of this round:

1. Before the first fill, a **callout above cell `0,0`**: "empty prefixes
   share nothing: 0". Hide it before the fills begin.
2. As each of rows `A` and `B` completes, a **`value` readout to the right of
   that row** (`at` the row, `side` `right`), labelled with the row's letter,
   text = the row's values as `[a, b, c]`. Two readouts, two ids, both stay.
3. When the last cell is set, a **callout to the left of cell `2,2`**: "the
   answer: one letter in common" — left, because the readouts are on the
   right.

Deliver `scene.json` and `log.md`.

Success: `vlmkit-anim check scene.json` exits 0 with no ✗ and no ⚠;
`vlmkit-anim layout scene.json` reports no issue; `explain` reads as the
algorithm.

Also record in `log.md`, **for each of the four annotations**: the side you
asked for and the side it landed on — render the frame where it is shown
(`vlmkit-anim render scene.json --step N --out f.svg`) and compare the box's
position with the cell's or the row's; whether a callout's pointer runs
through any other cell or label; and whether the canvas is wider or taller
than the bare table needs (compile the scene once with the annotation ops
removed and compare `canvas`). Then, as always: every coordinate, colour or
canvas size you typed by hand; anything you wanted and could not express, or
could only express by giving up on the side you wanted.
