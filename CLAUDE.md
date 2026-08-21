# CLAUDE.md

Working agreement for this project. Read `docs/spec.md` for the design; this file
is how we work. Both are binding.

## What this is

A web game where kids draw a creature, paint a small level, beat it, and send the
link to a friend over WhatsApp. The friend plays the same level with *their own*
creature, who is good at different things. No backend, no accounts — the level
lives in the URL fragment.

## How we work

**One playable increment per day.** Every session ends with something tappable on
a phone, however crude. Coloured squares are a fine day 1. Do not build ahead:
if the spec's day table says day 3 is guards, do guards, not guards plus rafts
plus the codec.

**The human cannot see the screen.** They are reviewing on a phone, often over
SSH, often on bad wifi. So:

- End every session with a short summary: what's playable now, what to tap, what
  to look for.
- Say loudly at the top if `bun test` is not green.
- Prefer printing a table over printing prose.
- Small commits, one concern each. Diff review happens on a 6-inch screen.

**Deploy every day.** Push to static hosting at the end of each session. The kids
testing this need a URL that works when the dev machine is asleep.

**Ask before deciding anything irreversible.** Hosting provider, repo layout
changes, dependency additions, grid size changes, anything that alters shipped
link compatibility.

## Hard rules

These are not style preferences. Breaking them costs days.

1. **`src/core` and `src/engines` are the determinism zone.** No `Math.random`,
   no `Date`, no `Intl`, no floating point in authoritative state. All arithmetic
   through `| 0` and `Math.imul`. Randomness only from the seeded PRNG. There is
   a CI check — do not weaken it to make a test pass.
2. **Zero runtime dependencies.** Including QR generation. Ask first, always.
   Still true and still the rule: nothing from `node_modules` reaches `dist/`.
   `typescript` and `@types/bun` are devDependencies, asked for and granted on
   day 18 so the typecheck could join the gate — see `docs/adr/0041`.
3. **Never change engine behaviour in place.** Add a new behaviour version and
   keep the old build. Shipped links are permanent; a movement tweak silently
   invalidates every proof ever sent.
4. **Cosmetics never touch `stateHash()`.** Sprites, palettes, tilesets are
   presentation only. There's a test for this; keep it passing.
5. **Engines emit tile indices, never pixels or ASCII.** Presentation maps them.
6. **Golden vectors are sacred.** If a change makes committed
   `(level, creature, log) → hash` fixtures fail, stop and flag it. Do not
   regenerate them to go green.

## A green suite is not the same as a working game

Four bugs in two days were visible on a phone and invisible to `bun test`.
They had three causes, and each has a tool now:

1. **Nobody asserts the obvious.** Enemies had never moved in the side-on game
   -- six behaviour versions of it. The garden shipped with a working sword.
   `test/liveness.test.ts` walks the cross-product -- every engine, every
   creature, every kind of spot a child can drop one into -- so a new engine is
   covered by existing rather than by somebody remembering.

2. **An assertion that cannot fail.** "reach lifts a gem from further away"
   compared a number to itself for nine days. `bun run check:mutants` breaks
   nine real defects on purpose and demands the suite go red. A mutation that
   SURVIVES is a hole, and it names it.

3. **No page ever boots.** The editor shipped completely dead while 683 tests
   passed. `check:types` catches that class now. For the rest: **lift the
   decision out of the DOM module** so it can be read without a browser --
   `src/web/level/palette.ts` and `src/web/play/breath.ts` are the two worked
   examples.

When a measurement and the screen disagree, **check the measurement**. Net
displacement is not travel; a walker pacing a ledge and a walker jittering on
the spot are the same number and opposite things.

## Definition of done for a day

- The new thing works on a phone at the deployed URL
- `bun test` green
- Committed and pushed
- Summary written: what to tap, what changed, what's next
- Any spec disagreement flagged rather than worked around

## When the spec is wrong

It was written without touching the toolchain. Expect errors — the encoding
budget in particular is arithmetic, not measurement.

**Stop and flag it. Do not invent a workaround.** Propose the fix, wait for a
decision, then record it in `docs/adr/` as a short numbered file.

## Commands

```bash
bun install           # once, and after pulling: two DEV dependencies, see adr/0041
bun run check         # determinism + types + tests. The gate. Must be green.
bun run check:mutants # break nine things on purpose; the suite must notice. ~30s
bun test              # just the tests
bun run dev           # local dev server
bun run cli <cmd>     # terminal tools: verify, play, sim
bun run build         # static output
bun run deploy        # push to hosting
```

## Things that are deliberately not in scope

AI generation, accounts, a backend, a gallery, the Run side-scroller engine,
native apps. Don't add them, don't design for them.

**Sound was on this list and came off it on day 15**, by decision — see
`docs/adr/0027`. It is synthesised, off until asked for, and may never be read
by an engine: hard rule 4 still holds, and a run replays identically whether it
was played in silence or not.
