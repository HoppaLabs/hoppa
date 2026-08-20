# 0011 — The character code

**Status:** accepted (day 9)

## Decision

`src/core/chr.ts` encodes a character — its name, its drawing, and the points it
spent — as a code that can be typed back in on any device, forever:

```
HOPPA-BASH-38CCY-PJ9GM-W6A88-NGD1G-...-3
```

104–126 characters for the characters shipped so far, against spec §5b's
estimate of ~130. It is shown in the editor the moment a character exists, with
a QR code beside it, and there is a box to paste one back.

## Why this exists at all

Spec §5b is blunt: **Safari deletes localStorage after 7 days without a visit.**
A kid who plays on Monday and comes back a fortnight later has lost the one
object the whole product calls permanent. This is the single biggest threat to
the premise.

The code is the answer, and it is a *save file*, not a reference: it carries the
sprite and the build, so pasting it back rebuilds the character exactly. There
is no server to look anything up in.

## Crockford base32, not base64url

Level codes are base64url because they are always tapped. **Character codes get
typed** — off a screenshot, by a nine-year-old — so they use Crockford base32:

- no `I`, `L`, `O` or `U`, the four that get misread off a screen
- typing `I` or `L` for `1`, or `O` for `0`, decodes correctly anyway
- case-insensitive
- chunked in fives, so it can be read aloud
- prefixed with the name, so a chat log shows whose it is

It costs about 20% more characters than base64url and is worth every one.

## The check symbol, and what it actually catches

Crockford's check symbol: the payload read as a base-32 number, modulo 37. 37 is
prime and 32 is invertible under it, which is what makes it work.

Measured, not assumed:

| Slip | Caught |
|---|---|
| Any single character changed | **2604 of 2604** |
| Two adjacent characters swapped | **all of them** |
| Any two characters swapped | 3225 of 3281 (98%) |

The 2% are transpositions of characters far apart in the code, which is not a
mistake a person typing makes. A plain checksum over the bytes would have caught
none of the swaps at all.

**The name is deliberately not protected.** It sits outside the checksum, so
mistyping it gives you the same character under a different name — harmless, and
it doubles as a way to rename one. Stated here so nobody later assumes the whole
string is checked.

## The bug worth recording

After restoring a character from a pasted code, the box still displayed the code
for whatever was there *before* the paste. On a page whose entire promise is
"this code is your character", handing a kid a stale code is the worst possible
failure — they would have saved the wrong creature and never known until the day
they needed it.

Found by asserting that a code, once restored, re-encodes to itself.

## Consequences

- `CHR_VERSION` is 1. A code from a future version refuses politely rather than
  guessing.
- The sprite is run-length encoded, which is what keeps a 64-byte drawing inside
  a typeable code.
- Still to do from spec §5b: prompting "add to home screen" (home-screen apps
  are exempt from the 7-day counter), and showing the sprite live as a code is
  typed so a kid can see whether they have it right before committing.
