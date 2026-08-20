# 0015 — Sword or wand, and character code version 2

**Status:** accepted (day 10)

## Decision

A character carries a **weapon**: `sword` or `wand`. It is **cosmetic**. A wand
reaches exactly as far as a sword, hits exactly as hard, and swings on exactly
the same clock. The editor says so on the page:

> this is only how it looks. a wand reaches just as far as a sword.

Asked for directly: *"could we also cater for girls, they should be able to
choose between sword and magic wand."*

## Why it must stay cosmetic

The premise is: **the same level, two differently-built creatures, both can
win.** A weapon that behaved differently would be a third characteristic — and
one that is not on the points budget, so it could not be traded against
anything. A kid who picked the wand because they liked it would find some
levels unwinnable and others trivial, and the aesthetic choice would silently
have been a power choice. That is the opposite of what was asked for.

It is also hard rule 4: cosmetics never touch `stateHash()`. `weapon` sits
beside `sprite` on `Creature` for exactly that reason, and there is a test
saying a sword creature and a wand creature with the same build produce the
same hash.

## The code format

`CHR_VERSION` goes to 2, adding two bits for the weapon.

**Every version 1 code still reads**, and comes back carrying a sword — the only
thing there was when those codes were written. A real v1 code, captured from the
editor before this change, is pinned in `test/chr.test.ts` and decoded on every
run. A child who wrote their character on paper last week has to be able to type
it back in today; that is the entire reason the format carries a version, and
the reason the decoder now accepts a range rather than one number.

A v2 code pasted into a stale cached page gets *"that code was made by a newer
hoppa"*, which is what that message has always been for.

## Also in this change

The sword was redrawn after: *"the sword seems a little long, can we move it up
slightly at the pivot point, it could look a little rude, it should also be
silver. And the button icon doesn't look like a sword."*

- **Silver** (`#e2eaf2`), not pale gold — it read as brass.
- **Shorter**, and the arc now turns about a point above the body's centre,
  roughly where a hand would be. Swung from the centre, the downward part of
  the sweep came out from between the legs.
- **A crossguard**, so the shape says "sword" at the size a phone draws it.
- **A new button icon**: upright, with a guard and a pommel. The old one was a
  thin diagonal whose blade and grip were nearly the same colour, and it read
  as a pencil.
