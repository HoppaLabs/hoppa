# 0033 — What a real user said about the editors

**Status:** accepted (day 16)

Somebody who is not us used the character editor. They liked the game and
found the editor too hard. Everything here comes from that.

## The slots were a second idea

The page held **two selections over the same three colours**:

- `ink` (0–3) — the pen you draw with
- `slot` (0–2) — which colour the palette was editing, on its own row of
  buttons numbered 1, 2, 3

Nothing tied them together. You could be drawing in colour 2 while the palette
quietly changed colour 3, and the page never said so. Reported as *"it's too
confusing picking the slots"*, which is exactly what it is: a whole second
thing to hold, for no gain.

There is one selection now. **Tap a pen; the palette is that pen.** The row of
numbered buttons is gone, not rearranged.

## The palette stays open, and day 15 was wrong

`docs/adr` day 15 folded it away with this reasoning:

> fifty-four swatches is a wall, and it is only wanted for the two seconds
> somebody spends changing what one of the three colours IS

That sentence describes a **settings panel**. This is not one. It is the paint
box, and choosing colours is most of what a child comes to this page to do. The
wrong assumption was written into a test, which now asserts the opposite.

Measured on a 390pt phone: the page is **1777px whichever pen is held**. It was
1635 with the palette shut and 1823 with it open — the row of numbered buttons
paid for most of the swatches.

The rubber is a pen with no colour, so the palette goes quiet rather than
disappearing, and the line above it is pinned to one line. A page that changes
height under a thumb is a page that gets mis-tapped — that was the reason the
palette stays put, and the first version of the hint broke it by 15px.

## Things that read as absences

The see-through pen was a chequered square and nothing else, which reads as a
colour that is **missing** rather than as the tool that takes colour away. The
chequer stays — it is what see-through looks like everywhere — and a rubber
sits on top of it. `clear` gets the same icon and says "rub it all out", which
does not sound like "forget this character" two sections below.

A text box was styled by the same CSS rule as a button — same raised fill, same
border, same corners, text centred like a label. Reported as *"the rename a
character looks like a button rather than a textbox"*. A field is a **hole**: it
sits below the page rather than on it, its edge is drawn rather than implied,
and the text starts where a caret would be. Fixed on both pages and both boxes,
because the question is never only where it was noticed.

## Sixteen characters to start from

A blank 16×16 grid is where most children stop.

Sixteen, not fourteen: fourteen leaves a hole in the last row, which was spotted
immediately and reads as a character that failed to load. Sixteen fills a grid
of two, four or eight.

The art took three passes, and the failures are the useful part:

1. Fourteen validated fine and **four were invisible** — palette indices picked
   by eye, and the star came out `#1a212b` on a `#222a35` square, which is
   1.1:1. The generator now *measures* the body against the square it is drawn
   on and refuses anything under 4:1.
2. On a light body the dark ink is nearly the page background, so every `3`
   reads as a **hole punched through the sprite** — right for a pupil, wrong for
   the bird's beak and wing, which came out as black squares. Those are drawn in
   the light ink now, as are the rabbit's inner ears.
3. Only then did they read.

Written as glyph rows in `tools/gallery.ts`, because that is the only form
anybody can read or change in a diff on a phone; shipped packed at 2 bits a
pixel, 2.5KB instead of ~4KB. Same trade as the level pack (`docs/adr/0030`).

Taking one moves the pens and the palette with it — otherwise they point at
colours no longer on the page.

## Asking before destroying, but only when there is something to lose

There is no undo on either editor; both say so. Replacing ten minutes of
drawing on one mis-tap is not a thing to do quietly. But asking a child who has
drawn nothing is a toll on exactly the person examples exist for.

So: tap an example on an untouched canvas and it just loads. Tap one over work
and it asks once, inline, with **keep mine** as the way out.

## The play page plays; the editors pick

The play page carried two lists — the six shipped rooms, and the levels you had
played before. Both are things to **pick**, on the page where you are already
doing something else.

The six are now example **levels** in the level editor, beside the sixteen
example characters on the drawing page, drawn through the renderer the game
itself uses. Two pages that pick things, one that plays.

What that bought, measured: on an iPhone SE the level went from **240×140** —
the hard floor — to **288×168**. Twenty per cent more game on the smallest
phone, from deleting two lists.

The storage behind "played before" went with it rather than being left to
accumulate for a list nobody can see. Old `hoppa.played.v1` entries in a
returning player's browser are simply never read again.
