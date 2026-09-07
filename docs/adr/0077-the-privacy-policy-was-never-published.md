# 0077 — The privacy policy was never published

**Accepted, day 24.**

## The report

> "why is privacy policy not visible in github...
> https://hoppalabs.github.io/hoppa/pippette/privacy.md"

It is not visible because it was never published. Not the file, not the
directory:

    /hoppa/pippette/privacy.md   404
    /hoppa/pippette/privacy      404
    /hoppa/pippette/             404
    /hoppa/                      200

## Why nothing caught it

Pages for this repo is `build_type: workflow`, not branch-serving. The deploy
uploads **`dist/`**, and `tools/build.ts` opens with `rm -rf dist` and then
writes an explicit list into it: three `index.html`, three bundles, the icons,
the manifest, `sw.js`, `.nojekyll`.

`pippette/` is not on that list. It never was. The documents were committed,
correct, and unreachable, and **every job stayed green the whole time** —
because the smoke check asks whether the game is on Pages and had no opinion
about anything else. `adr/0001` compares the bytes of what was built against
the bytes on Pages; a file that is in neither matches perfectly.

This is the CLAUDE.md failure mode word for word: *nobody asserts the obvious.*
The obvious thing here was "the page we wrote is at the URL we gave Apple".

## `.md` was the wrong extension anyway

Even copied verbatim into `dist/`, the URL would not have worked. The build
writes `.nojekyll`, which is what stops Jekyll rendering Markdown — deliberately,
because Jekyll racing the workflow is how the game once 404'd. So Pages would
have served `privacy.md` as `text/markdown`, which a browser downloads rather
than displays. An App Store reviewer opening that gets a file in their
downloads folder, and the listing fails review.

## What we do now

`pippette/*.md` stays the source of truth. The build renders it:

    pippette/privacy.md  ->  dist/pippette/privacy/index.html
    pippette/terms.md    ->  dist/pippette/terms/index.html

**Directories, not `privacy.html`.** The URL goes on an App Store listing and
into the app, where it is effectively permanent. It should not carry a file
extension it might later want to change — the same reasoning as `make/` and
`level/` in `adr/0006`.

**Rendered by `tools/markdown.ts`, not a library.** Hard rule 2 is zero
dependencies, and a Markdown package whose output ships is a dependency whose
output ships. It handles the subset those two documents use and **throws on
anything else** rather than passing it through as text, because a silently
half-rendered clause is the failure worth spending sixty lines to avoid.

**Not in `SHELL`.** The service worker caches what a child needs with the radio
off. A privacy policy is not that, it is read once by an adult, and hashing it
into the worker's version would mean a typo fix in the terms invalidates the
whole game's offline cache.

## The placeholders, which are the actual problem

Both documents are unfilled templates — 21 slots between them: `[COMPANY NAME]`,
`[ADDRESS]`, `[EMAIL]`, `[DATE]`, `[REGION]`, `[APP NAME]`, `[UNLOCK NAME]`,
`[13/16]`.

**Publishing them would have been worse than the 404.** A notice reading
"[COMPANY NAME] ([ADDRESS]) is the controller of the personal data" is not a
weak privacy policy; as a notice under UK GDPR Article 13 it identifies no
controller and is void, and as a review URL it is a rejection with a live page
to point at. A 404 is an obvious, honest failure. A published template looks
finished.

So the build **fails** on an unfilled placeholder rather than shipping one, and
the smoke check fails again if one ever reaches Pages. This is the one place in
the repo where refusing to produce output is better than producing it.

Filling them needs facts nobody can infer — a registered company name, a real
contact address, the CloudKit region, the children's age threshold. Those are
answers, not decisions, and they came from the human.

## The three copies

The repo carried the same policy three times: `pippette/privacy.md`, a
byte-identical `privacy_policy.md` at the root, and `privaypolicy` — no
extension, a typo'd name, an earlier draft missing the "Last updated" line.
Three documents that must agree, in a repo where two of them are unreachable
and none were published.

Both root copies are deleted. `pippette/` is the source; git remembers the rest.
