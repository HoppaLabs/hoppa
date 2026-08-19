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

## The repo is public

It started private. GitHub Pages on a private repository requires a paid plan
(Pro, Team or Enterprise), so the repo was made public on day 1 to get a URL
without one. Nothing user-generated is hosted — the design's whole premise is
that levels live in URL fragments and never reach a server — so going public
exposes the source and the spec, and nothing else.

## Enabling Pages is a manual step, and cannot be automated

The first deploy failed at `actions/configure-pages` with *"Get Pages site
failed … Not Found"*: Pages had never been switched on for the repo.

The obvious fix — the action's own `enablement: true` parameter — **does not
work**, and was tried and reverted. It fails with:

```
HttpError: Resource not accessible by integration
  https://docs.github.com/rest/pages/pages#create-a-apiname-pages-site
```

Creating a Pages site needs admin rights, and `GITHUB_TOKEN` does not have them
however the workflow's `permissions:` block is written. `pages: write` is enough
to *deploy* to an existing site, not to *create* one.

So this stays a one-off manual step, recorded here so nobody spends the same
hour on it:

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

Deployments to the `github-pages` environment are also restricted to the default
branch, so work on a feature branch cannot publish until it reaches `main`.

## Revisit when

Day 5 brings share links and day 11 brings result links. If Open Graph preview
*images* (§3, open question 2) turn out to matter before the trip ends, that
needs an edge function, and Cloudflare Pages becomes the better host. Moving is
cheap — the build output is plain static files.
