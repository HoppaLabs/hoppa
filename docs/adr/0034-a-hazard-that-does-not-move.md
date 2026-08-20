# 0034 — A hazard that does not move

**Status:** accepted (day 16)

Fire below ground, spikes above it. One entity, one tile index, two ways of
drawing it. `roam/6` and `dash/6`.

## Why it was worth adding

Every danger in the game walked. A guard is a **timing** problem — wait, dodge,
or hit it. Fire is a **route** problem: it never moves, so the question becomes
which way you go, and that is a question a level's *shape* can pose.

It also lifts a constraint that was quietly shaping every room. Spec L5 caps a
guard's patrol at 8 turns, which means guards can only live in narrow shafts —
which is why three of the shipped rooms are built from the same three-band
skeleton (`docs/adr/0030`). A static hazard has no patrol, so L5 has nothing to
say about it, and an open room becomes designable again.

## It cost the wire format nothing

This is the fact that decided the shape of everything else. The entity kind
field is **3 bits** and only four values were ever used:

| kind | | |
| --- | --- | --- |
| 0–3 | start, exit, treasure, guard | in use since day 2 |
| **4** | **fire** | this change |
| 5–7 | — | still free |

So every link ever sent still decodes to exactly what it decoded to before, and
there was no format decision to agonise over. Fire is an *entity*, though, which
means it shares the 31-entity budget: a start, an exit, 8 treasure and 10 guards
is 20, leaving 11. `MAX_FIRE` is 10, which is codeable however the rest of a
level is filled.

The one real edge: a browser holding an old cached build, opening a new fire
link, gets "that link is broken" — the decoder rejects unknown kinds. The page
already handles that gracefully and the service worker updates on next load.

## What it does

**Costs a heart on contact, once**, using the mercy window a guard's hit already
gives. Without that, walking the width of one flame would take a heart a tick.

**Nothing puts it out.** The weapon already answers guards; giving it a second
use would make both weaker, and fire would stop being a question about routes.

**No knock-back.** A guard throws you clear because it is about to hit you
again. Fire cannot follow, and being flung out of it into a wall or a second
flame is worse than being left to walk out.

**Measured from the cell your middle is in**, not from the body's edges. A body
is three quarters of a cell, so edge overlap would set light to you while the
sprite is clearly beside the flame — and unlike a guard, this thing never moves,
so the player would have nothing to blame it on.

## It does not block the checks

Same posture the flood fill already takes for guards: a hazard makes a route
**expensive**, not impossible. You can walk through fire and carry on, so L3 and
L4 ignore it exactly as they ignore a patrol.

But "the only way to the door is through the fire" is worth *saying*, so the
editor says it — as a warning, not a refusal. That is the middle of the three
states the advice line already had.

## The art needed its own palette

Both tilesets have a three-colour sub-palette for terrain, and the flame
borrowed it. Underground that made fire **stone grey**, so it read as a rock
with a pointed top. It was drawn, rendered, and looked at before that was
obvious — which is the argument for looking at things.

So `Tileset.fireSub` exists: pale-core/orange/red below ground, dark metal with
a bright tip above it. Nothing else on screen needs its own palette, because
nothing else is trying to look hot.

Spikes rather than fire in the outdoor world was the user's call and the right
one — a flame standing on a grass ledge looks like a mistake. Hard rule 5 makes
it free: the engine emits one index and knows nothing about which is drawn. The
editor's tool renames itself too, because a button labelled "fire" that paints
spikes is a button that lies.

## Three more rooms, and two of them were wrong first

The pack goes from six to nine — which also fills the editor's three-wide grid,
the same reason the characters went to sixteen.

`the hot floor` and `the narrow way` teach it from above. `mind the spikes`
teaches it from the side and took three drafts:

1. **Jump a bed of spikes on the ground.** Every creature timed out. A jump
   clears two cells and lands short of a third, so the room demanded a precision
   none of them have and no child would enjoy discovering.
2. **A hole in the deck with spikes under it.** Reads beautifully, kills the bot
   outright — it does not jump gaps, so it fell in every time.
3. **Two cells of spikes in the way on the deck.** Walk through for a heart or
   jump them. The bot jumps them, which is exactly the choice the room offers.

`the narrow way` failed L5 twice while being drawn, both times because its bands
were one row further apart than room 3's. A guard's shaft is bounded by the open
rows either side of its band, so three open rows gives a 7-cell run and the
check refuses it. The skeleton is not a house style; it is the only shape that
fits.

All nine rooms pass L1–L5 and are beaten by all three ready-made creatures, with
every winning run replayed cold.

## The bot had to learn two things

From above it now takes the **dry route if there is one and the burning one if
there is not** — refusing to cross would fail levels a child would finish, and
crossing when there is a way round would make the bot better than one, which is
the opposite of what it is for.

From the side there is no round, so the answer is **over**: it jumps when the
cell ahead is burning. Without that it walked into the same bed of spikes until
it ran out of hearts.
