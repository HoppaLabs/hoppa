# 0024 — Ask for the home screen, once

**Status:** the prompt was **removed the same day** — see `docs/adr/0025`.
The icon, the PNG encoder and the manifest described here all still ship. Kept as
the record of what was built and what it cost.

## The threat this exists for

Spec §5b, unchanged since it was written:

> Safari deletes localStorage, IndexedDB, SessionStorage and service worker
> registrations after 7 days without interaction with the site.

A kid draws a creature on Monday, goes on holiday, comes back a fortnight later
and it is gone — along with the offline cache from `docs/adr/0023`. **A web app
on the home screen is exempt from that counter** and keeps its own use timer.
That is mitigation 2 of the three the spec asks for; the creature code (1) and
the QR (3) already ship.

## When it asks

Once, ever, and only when all three are true: a character has **just been
made**, the game is **not already installed**, and it has **not asked before**.

The ask happens on the *play* page rather than the drawing page, because the
drawing page saves and immediately sends you off to play. "Keep this safe" only
means something once you can see the thing you made running about.

## What it says

> **keep Sprocket safe**
> phones forget after a week. Tap share, then Add to Home Screen.

Named, and in terms of what a kid loses — not "enable persistent storage".

## Two platforms, no sniffing

Chrome hands the page a `beforeinstallprompt` event; Safari never has and
almost certainly never will. So the page does not ask *which browser is this*,
it asks *did anything hand me a prompt*:

- prompt held → an **add it** button that does it
- no prompt → say where the button is

The browser's own behaviour is the test. Sniffing user agents would be wrong the
day either vendor changes anything.

## Two things found by looking at it on a phone

- **It cost the level two thirds of its size.** As a row above the game it
  pushed the play area to the 140px floor — a poor way to show somebody the
  character they just drew. It is laid *over* the top of the level instead,
  where it takes no layout height at all. Over the **top**, because you start at
  the bottom of a level and covering the new creature is the one thing it must
  not do.
- **The clock ran while they read it.** A real-time level starts the moment the
  page does, so an offer a child is reading is an offer they read while a guard
  walks over. The loop is held until they answer, then started. Measured: 0s → 0s
  while it is up, running again the moment it is dismissed.

## The icon is the creature

Not a logo: a kid finds this among thirty apps, and what makes it findable is
that it looks like what they were playing. It is drawn at build time from the
real starter sprite and the real palette, so it cannot drift away from the game.

Which meant writing a PNG encoder — `tools/png.ts`, about a hundred lines, and
the same bargain as the QR encoder in `docs/adr/0012`: the format is small, the
part we need is smaller, and a build-time image is not worth a dependency.

Two details worth recording:

- **Deflate has a "stored" block type** — *here are N bytes, uncompressed* —
  which is entirely legal and trivial to emit. A real compressor would be
  hundreds of lines of Huffman coding.
- **...which made the first icon 110 KB**, because uncompressed truecolour is
  three bytes a pixel. A sprite has four colours, so the icons are written as
  **indexed 2bpp** instead: 9 KB at 192px, 66 KB at 512px. That matters because
  these sit in the offline cache, which a child downloads on mobile data.

The writer is tested against a PNG reader written separately in the test file —
signature, chunk order, header fields, palette, CRCs recomputed from the
polynomial, and every pixel read back out. A test that reuses the encoder's own
helpers proves only that it agrees with itself.

## Consequences of `display: standalone`

Launching from the home screen gives no address bar. That is fine here: sharing
is a button, not a copied URL. Links from WhatsApp still open in Safari rather
than the installed app — iOS does not capture in-scope links — so nothing about
sending a level changes.

`start_url` is `./`, so a home screen launch always starts on the built-in
level rather than on whatever link was open when it was installed.

No `maskable` icon is declared: the creature fills three quarters of the square
and Android's maskable safe zone would crop its legs off.
