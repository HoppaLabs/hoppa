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

## Two settings this needs, once

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
   Without this the workflow uploads an artifact that nothing publishes.
2. Deployments to the `github-pages` environment are restricted to the default
   branch by default, so day-1 work on a feature branch cannot publish until it
   reaches `main`.

## Revisit when

Day 5 brings share links and day 11 brings result links. If Open Graph preview
*images* (§3, open question 2) turn out to matter before the trip ends, that
needs an edge function, and Cloudflare Pages becomes the better host. Moving is
cheap — the build output is plain static files.
