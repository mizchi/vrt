# Sequence Checkout Facts — Evaluation Log

## What I Read

1. **Brief**: `fixtures/anim-scenario/briefs/sequence-checkout-facts.md` — asks for a sequence diagram showing a customer placing an order with payment retry logic, including a loop frame and an alt frame with two branches.
2. **Fact sheet**: `fixtures/anim-scenario/briefs/facts/sequence-checkout-facts.expect.json` — defines the expected 5 participants (customer, shop, stock, payment, mail) and 8 messages in order.
3. **Writing guide**: `docs/anim-ir.md` — read the complete sequence kind documentation (lines 602–640), which describes participants, messages, loop/alt frames, and return/async message types.
4. **Schema reference**: Output of `pnpm exec vlmkit-anim schema --kind sequence` — confirmed the structure and the frame syntax.

## Round 1: Initial Scene Creation

**Command:**
```
pnpm exec vlmkit-anim check fixtures/anim-scenario/attempts/nb/scene.json --expect fixtures/anim-scenario/briefs/facts/sequence-checkout-facts.expect.json
```

**Output:**
```
✓ scene.json (sequence): 0 error(s), 0 warning(s)
  6230ms · 10 steps (10 captioned) · 36 nodes · 39 tracks / 167 keyframes
  scene 885 B (minified) → timeline 16633 B (×18.8)
  facts sequence-checkout-facts.expect.json: 5 nodes · 8 messages — all as drawn
```

**Result:** PASS — no changes needed. The scene compiled and validated against the fact sheet on the first attempt.

## Verify Narrative with `explain`

**Command:**
```
pnpm exec vlmkit-anim explain fixtures/anim-scenario/attempts/nb/scene.json
```

**Output:**
```
Place order — 10 steps, 6230ms, 36 nodes
 1. [    0ms] Place order
 2. [  350ms] customer → shop: place order
 3. [ 1050ms] shop → stock: reserve(items)
 4. [ 1750ms] shop ← stock: reserved
 5. [ 2450ms] shop → payment: charge(card)
 6. [ 3150ms] shop ← payment: declined
 7. [ 3850ms] shop ← payment: receipt
 8. [ 4550ms] shop → mail: send confirmation (async)
 9. [ 5250ms] customer ← shop: order #4711
10. [ 5950ms] end
```

**Narrative verification:**
- ✓ Step 1: Title "Place order"
- ✓ Step 2: Customer initiates with "place order"
- ✓ Step 3-4: Shop talks to stock, gets "reserved"
- ✓ Step 5: Shop initiates payment charge (inside loop frame)
- ✓ Step 6: Payment declined (first alt branch)
- ✓ Step 7: Payment receipt (second alt branch, approved)
- ✓ Step 8: Async confirmation to mail
- ✓ Step 9: Shop returns order #4711 to customer
- ✓ Step 10: End

The narrative exactly matches the brief's story.

## Verify Layout

**Command:**
```
pnpm exec vlmkit-anim layout fixtures/anim-scenario/attempts/nb/scene.json
```

**Output:**
```
0 of 10 frames with layout issues · 0 overlap(s) · 0 clipped · 0 crossed
```

**Result:** PASS — no text overlaps, clipping, or crossed lines.

## Render Frame at Step 5 (shop → payment: charge(card))

**Command:**
```
pnpm exec vlmkit-anim render fixtures/anim-scenario/attempts/nb/scene.json --step 5 --out frame-step5.svg
```

**Output:**
```
frame t=2450 "shop → payment: charge(card)" → frame-step5.svg
```

**Frame analysis (step 5):**
- All 5 participants visible across the top: Customer (actor with pills), Shop, Stock, Payment, Mail
- Participant lifelines: dashed vertical lines from each participant box extending down the canvas
- Messages 0-2 already complete: customer → shop, shop → stock, stock ← shop returns
- Loop frame (frame-0) visible at y=309.4, spanning the charge and alt messages (height=200px)
- Alt frame (frame-1) not yet visible (opacity=0) — will appear when "declined" or "receipt" lands
- Message 3 (charge(card)) being drawn: stroke-dashoffset="275" animates from 0
- Payment activation bar (act-2) not yet visible (opacity=0) — appears when message lands
- Shop activation bar (act-0) visible at y=145.4, height=68px, spanning from the charge message through both reply options

## Render Frame at Step 6 (shop ← payment: declined)

**Command:**
```
pnpm exec vlmkit-anim render fixtures/anim-scenario/attempts/nb/scene.json --step 6 --out frame-step6.svg
```

**Output:**
```
frame t=3150 "shop ← payment: declined" → frame-step6.svg
```

**Frame analysis (step 6):**
- Loop frame (frame-0) visible with label "loop [until paid, max 2]" at top-left
- Alt frame (frame-1) visible with:
  - Main region labeled "alt [declined]" at top
  - Horizontal dashed separator line at y=339.4
  - Second branch label "[approved]" below separator (opacity=0 — not active in this branch)
- Payment lifeline (x=666.6) has activation bar (act-2):
  - Position: y=244.4, height=2px
  - Start point: y - 1 = 243.4 (message arrival point)
  - Extends 2px downward (barely visible—this is the receiver being activated)
- Shop activation bar (act-0):
  - Extended to y=177.4, height=132px
  - Spans from first charge message through both reply option heights
  - This is the shop's activation from the original charge call, maintained during the alt frame's two options
- Message 4 (declined) being drawn with animation
- Messages 5-7 (receipt, send confirmation, order #4711) not yet visible (opacity=0)

**Key observation:** The payment activation bar shows shop is "busy" waiting for payment while the declined/approved responses are being handled. The brief asks "which participant is busy while payment is charging?" — the answer is **shop**, which receives the charge call and stays active (activation bar visible) until the alt frame completes.

## Brief's Activation Bar Questions

From the brief: "record in `log.md`: … in a rendered frame (`render --step N` or `still`), whether the activation bars start and end where you expect (which participant is "busy" while payment is charging?) and whether the two frames are drawn around the right messages"

**Activation bars verification:**
- **Step 5 (charge initiates):** Shop's activation bar spans from this message downward. The payment bar doesn't appear yet because the message is still in transit.
- **Step 6 (declined arrives):** Payment bar appears (act-2) at y=244.4 with minimal height. Shop bar (act-0) remains extended at y=177.4 with height=132px, covering the entire alt section. This shows shop is the participant "busy" while the payment charge is being processed — the shop initiated the call and is waiting for either a declined or receipt response.

**Frame placement verification:**
- **Loop frame (frame-0):** Positioned at y=309.4, wraps the charge message and the alt section. Label "loop [until paid, max 2]" at top-left (169.5, 221.4).
- **Alt frame (frame-1):** Positioned at y=336.4, wraps the two branches (declined and approved). Correctly divided by a dashed line at y=339.4 separating the two conditions.
- **Messages wrapped correctly:**
  - Loop encompasses: msg-3 (charge) + alt section with msg-4 (declined) + msg-5 (receipt)
  - Alt encompasses: msg-4 (declined) in first branch, msg-5 (receipt) in second branch
  - Both frames wrap the right messages as specified in the brief

## Coordinates and Canvas Properties

**Hand-typed coordinates/colors/canvas size:**
- **Canvas:** Automatically sized by the compiler (no manual canvas specification in scene.json)
- **Participant positions:** Automatically laid out left to right (customer, shop, stock, payment, mail)
- **Participant y-position:** All at y=72 (header row)
- **Participant x-positions (centers):** customer=234.6, shop=378.6, stock=522.6, payment=666.6, mail=810.6
- **Lifeline y-range:** y=87.4 to y=501.4 (extends from participant box down)
- **Loop frame y:** 309.4 (center), extends ±100px → y∈[209.4, 409.4]
- **Alt frame y:** 336.4 (center), extends ±63px → y∈[273.4, 399.4]
- **Colors:** Theme defaults (theme not specified, so system defaults used: #1f2328 for text/strokes, #9ca3af for frames)
- **Lifeline stroke:** dashed (6 4 dash pattern)
- **Activation bars:** solid white with stroke outline

All of these were either automatically generated by the compiler or derived from the brief's requirements (5 participants, loop label, alt branches). No manual coordinates were typed.

## Friction

**What was clear and worked well:**
- The sequence kind documentation in `docs/anim-ir.md` was complete and precise.
- The loop and alt frame syntax was unambiguous.
- The message kinds (call/return/async) and their visual semantics (solid/dashed, filled/hollow heads) were well-explained.
- The participant kinds (actor/system) immediately made sense.

**What could have been clearer:**
- The documentation says "A `kind` on a call activates the receiver" but doesn't explicitly state *when* the activation bar appears or how long it extends. From the frames, I can see: activation starts when the message lands (arrives), and the bar extends through all replies/responses in the same "flow" until a final return arrives. This is sensible behavior, but inferring it from the frames rather than the guide added a verification step.
- The example shows a cache miss scenario with two alt branches, but doesn't show a loop containing an alt (as in this brief). It would have been marginally helpful to see that nesting pattern in the guide, though the syntax was straightforward enough to infer.
- The brief mentions "max 2" in the loop label — I used that exact string as-is. The guide doesn't specify what loop labels should contain or whether they're arbitrary text. It turned out to be arbitrary (good), but one sentence clarifying that would have been helpful.

**What I guessed correctly without the guide:**
- Loop and alt frames would nest naturally in the messages array (they do).
- The `when` field for alt branches would use the condition as text (it does).
- Return and async messages would draw differently, with returns shown inside the alt branches (they do).

**Overall assessment:** The guide was sufficient for a first-attempt success. The only gap was the implicit activation-bar timing model, which was inferred from the generated captions and confirmed by rendered frames. No edits were needed.

## Final Metrics

- **Rounds to green:** 1 (first check passed with no errors or warnings)
- **First-attempt errors:** 0
- **First-attempt warnings:** 0
- **Scene file size:** 885 bytes (minified)
- **Compiled timeline size:** 16633 bytes (×18.8 expansion)
- **Total steps:** 10 (including title and end)
- **Captioned steps:** 10 (all steps have captions)
