# 0007 — Drawing your own creature

**Status:** accepted (day 6)

## Decision

`src/web/make/` is the sprite editor: 16×16 at 2 bits per pixel, three colours
plus transparent, chosen from a 54-colour master palette (spec §4, §5). What you
draw is saved in browser storage and appears first in the creature picker, and
your creature is drawn as the actor in the dungeon.

Supporting pieces: `src/core/palette.ts` (the 54 colours),
`src/core/sprite.ts` (the 16×16 2bpp model and its packing), and
`src/web/stash.ts` (browser storage, deliberately outside the determinism zone).

## What you draw can never change what you can do

Spec §5 is explicit: *"Sprite and capabilities are independent. A kid draws
something spiky and menacing; it can still be a featherweight."*

This was worth resisting, because the obvious idea is a good one: derive `MASS`
from how many pixels you filled, so a big blocky creature is heavy and loud and
a small one is quiet. It would be delightful, it would be visible, and it is
forbidden twice over — by §5, and by CLAUDE.md hard rule 4, since it would make
a cosmetic change move `stateHash()`.

So you draw the **look** and pick the **body** — whose caps you borrow from a
preset. The editor says so in as many words: *"the body decides what it can do.
what you draw never changes that."*

Spec §5 predicts this is where the rule will actually get violated, so the tests
are pointed straight at it: two creatures differing only in sprite, played
through the same log, must produce the same hash; recolouring must change
nothing; and a heavily inked sprite must not weigh more than a blank one. All
three presets gained sprites on this day and **not one committed golden hash
moved**, which is the same claim made at fixture level.

## Storage is assumed to betray you

Spec §5b's heading is "Storage will betray you", so `stash.ts` is written for
that: every read is wrapped, anything unparseable or half-written is treated as
absent rather than thrown, and a failed write is swallowed because the drawing is
still on screen and still playable — it just will not survive a reload. A kid
cannot clear their own localStorage, so a bad record must never be able to stop
the page loading.

Losing the store costs you a drawing. It can never cost you a level, because
levels live in links.

## `/make` is a directory, not a route

The editor is a second page built to `dist/make/index.html`, not a client-side
route. Same reasoning as ADR 0006's fragment decision: static hosting has no
router, and a real directory needs no rewrites. `tools/build.ts` now emits two
bundles.

## Three things the browser found that the tests could not

The engine tests were green throughout all of these.

1. **The title still said day 5.** Trivial, invisible to any test, and the first
   thing a person reads.
2. **Two creatures showed as selected at once.** A drawn creature borrows a
   preset's caps *and its id*, so a picker keyed on id lights up both. Identity
   in the picker is now a slot in the roster.
3. **There was no way to reach the editor from the game.** The editor could get
   you back, but nothing pointed the other way, so the whole day was
   unreachable unless you knew to type `/make/`. There is now a "draw your own"
   button next to share.

That is three days running where the failure was in the part no unit test
touches. The habit of replaying a committed log through the actual page — not
the engine — is earning its keep.

## Consequences

- The sprite is 64 bytes, 86 characters of base64url raw. Spec §5 predicts
  "~30–40 after RLE on transparent runs" and roughly 50 characters in a creature
  link. **Not yet done:** day 8 is creature codes, and that is where the RLE and
  the check symbol belong. 86 characters is the number to beat.
- Palette *colours* are cosmetic; palette *indices* are a compatibility surface,
  since a creature stores three 6-bit indices. The list is append-only —
  reordering it would silently repaint every creature ever saved.
- You can borrow a preset's body but not yet edit caps directly. Spec §14 has
  `new-creature --caps`, and day 8's codes will want it.
