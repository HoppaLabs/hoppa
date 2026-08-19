# 0006 — Share links: the wire format, and where it lives in the URL

**Status:** accepted (day 5) — **but nothing has been shared yet, so this is
still cheap to change. It stops being cheap the first time a link reaches a kid.**

## Decision

`src/core/codec.ts` encodes a level to base64url and back. `src/core/bits.ts`
holds the bit reader/writer and the alphabet. The layout is documented at the
top of the codec and pinned by `test/golden/codes.json`.

The measured sizes, against spec §10's budget of 150 characters of level data
and 300 for the whole URL:

| Level | Code | Whole URL | Wall encoding |
|---|---|---|---|
| day1 | 70 | 118 | raw bitmap |
| day2 | 82 | 130 | raw bitmap |
| day3 | 88 | 137 | raw bitmap |
| day4 | 76 | 125 | run lengths |

**The spec's encoding arithmetic is correct.** CLAUDE.md warned that the budget
was arithmetic rather than measurement and might not survive contact; it did.
§10 predicts "~60 bytes → ~80 characters of base64url" and the real numbers are
51–66 bytes and 70–88 characters. No spec change needed.

Both wall encodings are chosen per level by trying each and keeping the shorter,
and both are exercised by shipped fixtures, so neither branch can rot untested.

## The level goes in the fragment, not the path

Spec §3 writes links as `https://hoppa.app/p/Bruks-Lair-118/#<level-data>`. We
ship `<site>/#p/<slug>/<code>` instead: the slug moves into the fragment.

Two reasons, and only one is technical:

- **Static hosting has no router.** GitHub Pages would 404 on `/p/<slug>/`. The
  spec's shape assumes a host that can rewrite every path to one page. If the
  project ever moves to `hoppa.app` with rewrites, the path form can come back —
  the code is the same either way, so old links keep working.
- **A fragment is never sent to a server.** Kids' levels stay out of every
  access log between here and their friend's phone. That is worth having.

The slug is decoration: it is what makes the link readable in a group chat, and
nothing reads it back. The code alone is the level.

## A checksum, decided now because it cannot be decided later

One byte of FNV-1a over the payload, costing two characters.

Without it, the corruption test was blunt: of ~1400 single-character changes to
a valid code, **about 1200 decoded to a different, perfectly valid level** and
said nothing. A kid retyping a link off a screenshot would land in a level
nobody meant them to play — possibly unbeatable — with no way to tell. That is
precisely the "fails quietly rather than loudly" trap §10 warns about for
behaviour versions.

With the checksum: **0 of them decode silently. Every one is refused.**

This is the kind of thing that can only be added before links ship. Spec §13's
C2 asks for a check symbol on *creature* codes on day 8; level codes were never
given one, and waiting until day 13's red-team pass would have been too late.

## Behaviour version pinning, proved end to end

A link carries its behaviour version, and the page plays it under **that** build,
not the newest one. A day 2 link opened today runs on DelveV2: no guards, no
alarm in the HUD, and it hashes exactly as it did on day 2. That is what the
old builds in the bundle are for, and it is now covered by a test rather than an
intention.

This forced a real change to the play page. It had been written against the
newest engine and called `tookFreeStep()`, which DelveV2 has never had — so the
first day 2 link opened to a page full of exceptions. `web/play/readout.ts` now
sits between the page and whatever engine a link produces: every HUD read-out is
optional, and a missing one means "this version does not have that idea yet".
Old builds must never grow methods to satisfy a newer page; their rules are
frozen.

## Consequences and what is still open

- `seedText` cannot survive the round trip, only the seed's *value*: `03f7q` and
  `3f7q` encode identically and decode to the canonical spelling. `sameLevel()`
  compares the value, and `levelToText()` writes the canonical form.
- The format holds 31 entities and knows four kinds (start, exit, treasure,
  guard). Water and rafts arrive on day 7 and get kinds 4 and 5 — the 3-bit kind
  field has room, which is why it is 3 bits and not 2.
- **Day 8 is still a bake-off** (§10): this scheme against
  `CompressionStream('deflate-raw')` on the raw grid. These numbers are the
  baseline to beat.
- The share button copies a link for the level you are *on*. The share **gate**
  — you cannot share a level you have not beaten — is day 9, and is not here yet.
