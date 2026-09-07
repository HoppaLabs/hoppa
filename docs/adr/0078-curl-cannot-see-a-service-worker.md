# 0078 — curl cannot see a service worker

**Accepted, day 24.** Follows `adr/0077`, which published the pages this one
made reachable.

## The report

> "the links are not working, they are loading a blank hoppa game
> https://hoppalabs.github.io/hoppa/pippette/privacy/"

## What was true at the same time

    curl https://hoppalabs.github.io/hoppa/pippette/privacy/
      200, text/html, the privacy policy, no placeholders, DRAFT banner present

    a browser that had ever loaded the game
      the play page, with no level in the fragment: a blank hoppa game

Both are correct. They are answers to different questions, and every check this
project had — the deploy smoke test, `adr/0001`'s byte comparison, the manual
verification of 0077 — asked the first one. **A fetch cannot run a service
worker**, so no fetch could ever have caught this.

## The bug

`pageFor()` in `src/web/sw.ts` ended:

    if (rest.startsWith("level/")) return level/index.html
    if (rest.startsWith("make/"))  return make/index.html
    return index.html                    // <-- everything else

and the fetch handler consulted it for any navigation before going to the
network. So the worker answered **every** path under its scope with a cached
page, and the only three it knew about were the game's. A new page added to the
site was unreachable to everyone with the worker installed, no matter that it
was built, uploaded and served correctly.

The catch-all was there to make level links work offline, and it never needed
to be. A level lives in the URL **fragment**, a fragment is never sent, so an
unseen level link arrives at the worker as the bare scope path — the empty
string. The three routes were always sufficient; the fallback was reaching
beyond what it was for.

## The rule now

`pageFor` moved to `src/web/routes.ts` as a pure function of `(scope, path)`
and returns **`null`** for a path the game does not own. On null the worker
does not answer from cache; the request goes to the network like any other.

It moved for the reason CLAUDE.md gives: *lift the decision out of the module
that needs a browser, so it can be read without one*. Inside `sw.ts` it needed
a registration, a cache and a worker to ask a question of. Outside, it is a
function and a table.

## Two tests, because there were two failures

1. **`test/routes.test.ts`** asks the rule, at both scopes the game runs at
   (`/hoppa/` on Pages, `/` on the dev server). The legal pages are read from
   `LEGAL`, so a new one joins the assertion by existing.

2. **`test/worker-navigation.test.ts`** asks **the built `dist/sw.js`** — loads
   it with a fake cache, a fake network and a fake registration, dispatches a
   real navigation, and reports which answered. The cache holds "PLAY PAGE" and
   the network returns "FROM THE NETWORK", so *where the answer came from* is
   in the answer instead of inferred.

Both were run against the old catch-all first and both go red on it. An
assertion that cannot fail is the second of the three failure modes in
CLAUDE.md, and this file would be worthless without that check.

## What this does not fix

A browser holding the old worker has already been told that this path is the
play page. It gets the new worker on its next navigation and the correct page
on the **reload after that**. There is no way to reach back into a worker that
is already installed; one refresh is the cost, once, per device.

## An unrelated thing that fell out

Importing `routes.ts` changed how the bundler treated the cache name: it stopped
inlining `` `hoppa-${VERSION}` `` and emitted `` hoppa-${x} `` with `x` beside
it. The worker still behaved identically, and `test/offline.test.ts` — which
finds the cache name with a regex — went red on a build that was fine.

The name is stamped in as a single `__CACHE__` define now, so it is a literal
whatever the minifier decides. Same reasoning as pinning bun in `deploy.yml`:
the build's output should not depend on the toolchain's mood.
