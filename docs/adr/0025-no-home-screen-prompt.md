# 0025 — No home screen prompt

**Status:** accepted (day 15). Reverses the prompt from `docs/adr/0024`.

## The decision

Asked for and built one day; removed the same day, on the owner's call: *"I
don't want the home screen offer at all."*

So it is gone. Nothing on any page asks to be added to a home screen, and
nothing keeps a record of having asked.

## What that costs, stated plainly

Spec §5b mitigation 2 is **not implemented and will not be**. Safari still
deletes localStorage — and the offline cache from `docs/adr/0023` with it —
after 7 days without a visit, and a home screen app is still the only thing
exempt from that counter.

The mitigation that remains is the one the spec calls the important one:

> **The creature code is the save file.** Every creature has a code that can be
> copied out and pasted back in, on any device, forever.

That is mitigation 1, it ships, and it does not depend on a browser keeping
anything. Mitigation 3, the QR, ships too. A kid who loses their creature to
eviction gets it back by pasting the code — which was always the guarantee;
the home screen was only ever going to be a convenience on top of it.

## What was kept, and why

The **manifest and the icons stay**. They are not a prompt: nothing points at
them and nothing mentions them. They mean that a person who chooses to add the
page to a home screen — without being nagged into it — gets the creature as the
icon instead of a screenshot of the page, and gets the game without an address
bar across it.

`tools/png.ts` and `tools/icon.ts` therefore stay as well, along with their
tests. Cost: 84 KB in the offline cache.

## What was removed

- `src/web/install.ts` — the whole `beforeinstallprompt` / iOS-instructions fork
- the panel over the level, its markup and its styles
- holding the game's clock while the panel was up
- the `justmade` note passed from the drawing page to the play page
- the "asked before" record in localStorage

The play page starts its clock unconditionally again, exactly as it did before.

## The lesson worth keeping

A prompt is a thing you do *to* somebody. This one was measured, laid out
carefully, and tested on a phone — and it was still an interruption between a
child finishing a drawing and seeing it run about, in service of a storage
policy that is not their problem. Care in the execution does not make an
unwanted interruption wanted.
