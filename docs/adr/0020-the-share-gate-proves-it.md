# 0020 — The share gate proves it

**Status:** accepted (day 11)

## What was wrong

The share button appeared when the page **believed** you had won. That is not
the same thing as having won, and the difference is the whole value of the
mechanic. Spec S12 always said what it should be:

> Beat your own level → input log verified locally → only then does the site
> produce a link.

## Decision

Every input handed to `engine.step()` is kept. On a win the whole run is
**replayed into a fresh engine**, and the button appears only if that replay
also wins.

So the claim behind a link is no longer "somebody's browser said they won". It
is "here is a sequence of button presses that finishes this level" — and the
level is beatable because something just beat it, twice.

This costs almost nothing, because deterministic replay was already the
foundation everything else stands on. It is the payoff for `stateHash()` on
day 1 and for never editing a shipped engine.

### One mechanism for both kinds of engine

A turn-based engine takes a move per press; a real-time one takes a
held-button mask per tick. A log is just the list of what was handed to
`step()`, in order, so both work with the same recorder and the same replay.

Runs are stored run-length encoded — holding right for a second is thirty
identical ticks — so a two-minute run is a few dozen numbers.

### Storage is re-checked, never trusted

A proof kept from an earlier visit is **replayed again on load** before it
counts. Editing it in devtools, or keeping one from a build whose rules have
changed, simply does not open the button. Tested by doing both.

The proof is tied to level *and* creature: switching creature is a different
run and is re-checked. Restarting clears the log, so a losing attempt cannot
inherit the presses of a winning one.

### The proof never travels

Spec S10's URL budget has no room for it, and it does not need one: the gate
exists to stop the **sender** posting rubbish. A receiver who wants to know a
level is finishable can see that somebody finished it.

## What "verified" does and does not mean

It means: these presses, replayed cold, finish this level. Nothing more.

It is **not** anti-cheat. A child who wants to hand-craft a winning input log
can, and is welcome to — that log still finishes the level, which is the only
thing the gate cares about. These are kids on holiday, not an adversarial
ladder (spec S12 says so outright).

A different winning route is also fine. There is a test that asserts exactly
this: across every single-move edit of a golden log, the gate's answer agrees
with what a replay actually does — 192 edits broke the run, none produced a
false pass.

## A regression this turned up

The level editor's bundle had tripled — 91.5 KB, up from 34 KB — because it
imported the engine registry to read one integer, and that dragged all eleven
engine builds into a page a child loads on mobile data. It happened two
changes ago and nothing noticed, because nothing was watching the size.

`src/core/builds.ts` now holds that integer, and `test/registry.test.ts`
asserts it matches the registry, so the shortcut cannot go stale — which was
the whole reason for reading it from the registry in the first place.
