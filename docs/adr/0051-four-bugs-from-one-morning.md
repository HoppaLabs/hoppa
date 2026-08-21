# 0051 — Four bugs from one morning

Day 20. Accepted.

Four reports, in the order they arrived. Three of them were mine from the day
before, which is what a night of real children does to a day's work.

## "I can't scroll in the creature editor"

`touch-action: none` on `<body>`.

It went on the day before to stop accidental pinch-zoom (adr/0046), and the
note written next to it said `none` "is the value that says this page handles
its own touches". That is true, and it includes **scrolling**. The creature
editor is six rows of characters taller than a phone, so it simply stopped.

Three values, and only the third is right:

| | double-tap | pinch | scroll |
|---|---|---|---|
| `manipulation` | off | **on** | on |
| `none` | off | off | **off** |
| `pan-y` | off | off | on |

`pan-y` is what both halves wanted all along. Every surface that must swallow a
drag — the paper, the pad, the grid, the canvases — already asks for `none` for
itself, because `touch-action` is not inherited.

The test that guarded this asserted `none` on two pages, so it was **pinning
the bug as the rule**. That is the fourth time this has happened here; the test
now reads the `body` rule specifically rather than grepping the file, so the
`none`s further down cannot satisfy it.

## "The beach example level actually looks like a garden"

`retarget(draft, engine, behaviourVersion, tilesetId = 0)`.

The default was the whole bug. `retarget` means "change which GAME this is",
and every caller that only wanted to bring a draft up to the current engine
version silently threw the skin away with it. `freshen()` is exactly such a
caller, and it runs on everything the level editor opens — so tapping "the
beach" on the shelf handed back a garden.

The default is `draft.tilesetId` now: a skin is not a rule, so changing the
rules has no business changing it. The tab strip still passes its own number,
which is how tapping "underwater" on a beach still gets you the reef.

Worth naming the shape of this: **a default argument that silently discards
state is a landmine with a timer on it**. The call site reads correctly, the
types check, the tests pass, and the data is gone.

## "The shark looks like it has two eyes from the side"

It did. One white pixel for the eye's highlight, and two more white pixels for
teeth on the jaw two rows below — and at the size a shark is actually drawn,
white-on-dark is white-on-dark. The mouth is a plain dark line now.

**One bright mark per face.** At sixteen pixels a second one is not detail, it
is a second eye.

## "That gull icon could look more like a bird"

Two drafts from overhead — wings spread, seen from above — came out as a paper
aeroplane and then as a dart. Seen from overhead a bird is a triangle with a
lump on it, and there is nothing in that shape a child recognises.

From the SIDE there is: a beak, an eye, a folded wing, two legs. Every one of
those says *bird* on its own, and all four fit. The shark next door is drawn
from the side too, so it was never a house rule that a top-down world needs
top-down animals — only that the silhouette has to be one somebody knows.

## And one measured while fixing the others

The shell's widest frame ran off the left edge of its tile with no rim on it
while the right edge had one. An outline that stops on one side reads as a
picture that has been cut — reported as "the shell icon looks cropped on its
left side when placed", which is exactly what it looked like.
