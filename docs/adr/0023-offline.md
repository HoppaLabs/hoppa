# 0023 — The whole loop, offline

**Status:** accepted (day 14)

## Why this matters more here than in most web apps

A level lives in the **URL fragment**, and a fragment is never sent to a server.

So a cached shell is not "the app minus the levels". It is **every level anybody
will ever send, including ones that do not exist yet**. Cache six files once and
`hoppa/#p/whatever` plays with the radio off — a level your friend makes next
week, opened in a car with no signal, on a phone that has never seen it.

That is the whole feature, and it falls out of a decision made on day 5.

## What is cached

The six files the game is made of: three pages and three bundles, 193 KB.

**Not the sourcemaps** — half a megabyte a child never opens, and the difference
between an install you don't notice and one you do.

## The cache name is a hash of the contents

`tools/build.ts` hashes the bytes of all six files (FNV-1a, the same hash the
engines use) and stamps the result into the worker as its cache name:

```
hoppa-758e55c6
```

Two consequences, both wanted:

- A build that changes nothing produces a **byte-identical worker**, so the
  deploy check can keep comparing bytes rather than grepping for strings.
- A build that changes **anything** produces a new cache name, and `activate`
  deletes every `hoppa-` cache that is not the current one. A stale cache cannot
  survive as something nobody thought to delete.

## Cache first, not network first

On a plane there is no second chance, and on holiday wifi "network first" means
waiting out a timeout before falling back. So every request is served from the
cache if it is there.

A new build therefore arrives as a **new worker**, which is the only way anything
in the cache changes. That is atomic: the page and its bundle update together,
never one without the other.

## The staleness that cost a review, and the fix

Cache-first is one build behind by definition. This visit comes from the cache;
the new worker installs behind it; the **next** visit is new.

For a game deployed every day and reviewed on a phone, that is a whole review
spent looking at yesterday — and it looks exactly like the change not working.

So: when a new worker takes over **and the screen has not been touched yet**,
the page reloads itself. You tapped a link and looked at it; swapping underneath
is invisible and correct. The instant anything is touched — a direction, a paint
stroke, a key — it stops, because reloading out from under somebody mid-game is
far worse than being one build behind.

Verified in a browser both ways:

| | what happens |
| --- | --- |
| tap the link, don't touch it | today's build appears by itself within a second or two |
| start moving first | no reload — the clock ran 0s → 4s straight through the update |

A first-ever visit does not count as an update: taking control for the first
time changes the controller too, and there is nothing stale to replace.

## Proved offline, not assumed

Driven in a real browser at a real subpath (`/hoppa/`, as Pages serves it), with
the network switched off after one visit:

| | offline |
| --- | --- |
| the play page | plays |
| a level link **never opened before** | plays |
| the level editor | opens |
| the character editor | opens |
| holding a direction | the clock runs, the world moves |

One cache, no console errors.

## What this does not fix

**Safari deletes service worker registrations after 7 days without interaction**
— the same eviction that takes `localStorage`, described in spec §5b. So
"offline forever" is really "offline for a week at a time", unless the game is
added to the home screen, which is exempt. That is spec §5b mitigation 2 and is
not built yet.

The creature code remains the save file. Offline is a convenience; the code is
the guarantee.

## Registration is never allowed to break the page

Service workers are unavailable in a surprising number of situations a kid will
actually hit: iOS private browsing, a page opened over plain `http` from another
device, an in-app browser with them switched off. None of those are errors a
nine-year-old can act on, and the game works perfectly without one — offline is
the only thing they lose. Every failure is silent.

The worker is registered by a **relative** path (`./sw.js` from the play page,
`../sw.js` from the two editors), because the game is served from `/hoppa/` on
Pages and from `/` on the dev server, and an absolute path would work in exactly
one of those.
