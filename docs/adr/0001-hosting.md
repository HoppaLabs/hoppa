# 0001 — Static hosting on GitHub Pages

**Status:** accepted (day 1)

## Decision

Deploy `dist/` to GitHub Pages from `.github/workflows/deploy.yml`, publishing on
every push to `main`. The repo stays **private**.

## Why

The spec (§16) says deploy from day 1 and names Pages, Cloudflare Pages and
Netlify. Pages is the only one of the three that needs no third-party account
and no API token in repo secrets, so it was the shortest path to a URL that
works while the dev machine is asleep.

## The cost of keeping the repo private

GitHub Pages on a **private** repository requires a paid plan (Pro, Team or
Enterprise) on the account. On a free plan the `deploy-pages` step fails with a
permissions error, and the fix is to make the repo public or upgrade. This was
chosen with that trade understood.

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

## Revisit when

Day 5 brings share links and day 11 brings result links. If Open Graph preview
*images* (§3, open question 2) turn out to matter before the trip ends, that
needs an edge function, and Cloudflare Pages becomes the better host. Moving is
cheap — the build output is plain static files.
