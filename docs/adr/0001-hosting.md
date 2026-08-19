# 0001 — Static hosting on GitHub Pages

**Status:** accepted (day 1)

## Decision

Deploy `dist/` to GitHub Pages from `.github/workflows/deploy.yml`, publishing on
every push to `main`. The live URL is **https://hoppalabs.github.io/hoppa/**.

## Why

The spec (§16) says deploy from day 1 and names Pages, Cloudflare Pages and
Netlify. Pages is the only one of the three that needs no third-party account
and no API token in repo secrets, so it was the shortest path to a URL that
works while the dev machine is asleep.

## Private vs public

GitHub Pages on a **private** repository requires a paid plan (Pro, Team or
Enterprise); on a free plan the `deploy-pages` step fails with a permissions
error. Day 1 accepted that trade and kept the repo private.

**Superseded:** the repo now lives in the `HoppaLabs` organisation and is
public, so no paid plan is involved, and the site is served from the org:
`https://hoppalabs.github.io/hoppa/`. Nothing in the build had to change —
`index.html` loads `./app.js` relatively, so the project subpath works wherever
the repo lives. The pre-move URL is dead and GitHub does not redirect Pages
across the move, so anyone holding an old link needs the new one.

## Enabling Pages

The first deploy failed at `actions/configure-pages` with *"Get Pages site
failed … Not Found"* — Pages had never been switched on for the repo. The
workflow now passes `enablement: true`, so it turns Pages on itself using the
`pages: write` permission it already holds, rather than depending on someone
finding the right settings page. Doing it in the workflow means a fresh clone or
a new fork deploys without a manual step.

One thing this cannot paper over: deployments to the `github-pages` environment
are restricted to the default branch, so work on a feature branch cannot publish
until it reaches `main`.

## Two publishers race, and the wrong one can win

Day 2 merged, CI went green, every deploy job reported success -- and the live
URL served a Jekyll rendering of `README.md` with `app.js` 404ing.

The cause: the repo's Pages source is **"Deploy from a branch"**, so GitHub's
built-in `pages build and deployment` runs on every push to `main` *alongside*
this workflow. Both publish to the same site, and whichever finishes last wins:

| merge | our `deploy` finished | Jekyll finished | what was live |
|---|---|---|---|
| day 1 | 13:28:32 | 13:27:37 | the game |
| day 2 | 14:44:42 | 14:44:43 | README.md, by one second |

Nothing in the repo can settle this: a branch-source build publishes the
repository root, and a root `.nojekyll` would only turn a rendered README into a
404. **The fix is the repo setting** -- Settings > Pages > Build and deployment >
Source: **GitHub Actions** -- which stops the built-in build from running at all.

`actions/configure-pages` with `enablement: true` does not rescue this: both
workflows are triggered by the same push, so the built-in build has already
started by the time our workflow could change anything.

**Confirmed fixed.** The source was changed to GitHub Actions on day 2. The next
push to `main` (`d0eb58d`) ran `ci` and `deploy` only -- no
`pages build and deployment` -- and all three deploy jobs, including the new
smoke check, passed.

If it ever regresses, a re-run of this workflow via `workflow_dispatch`
republishes the game, because a manual dispatch triggers no competing build.

### What stops it shipping silently again

A `smoke` job now fetches the published URL after `deploy-pages` and fails the
run unless `index.html` loads `./app.js` and the bundle returns 200. A green
deploy and a working URL were not the same thing, and the kids only ever see the
second one.

## Revisit when

Day 5 brings share links and day 11 brings result links. If Open Graph preview
*images* (§3, open question 2) turn out to matter before the trip ends, that
needs an edge function, and Cloudflare Pages becomes the better host. Moving is
cheap — the build output is plain static files.
