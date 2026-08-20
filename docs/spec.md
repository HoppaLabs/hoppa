# Hoppa — Levels That Live In A Link

**A two-week spec.** Codename `hoppa` is a placeholder.

---

## 0. The product, in one paragraph

Two kids on holiday, bored, with phones. One opens a website, draws a creature,
paints a small level, plays it until they beat it, and sends the link over
WhatsApp. The friend taps it — no install, no account — and plays the same level
with **their own creature**, who is good at different things. They send back
their time. Repeat.

The creature is the persistent object. Levels are disposable postcards.

**A Wreck-It Ralph rule governs everything:** the mismatch is the fun. When a
heavy creature enters a level built for a nimble one, the game must not quietly
compensate. It must let them be clumsy, and it must say so.

---

## 1. Four decisions that shape everything

### TypeScript on Bun, zero dependencies

The only real target is a browser, so build for it directly. No cross-compilation
step, no shim layer, no parity test suite, no toolchain unknown parked on day 2.
Bun runs TypeScript directly and has a built-in test runner, so there's no build
config to debug over SSH.

Zero runtime dependencies is a goal, not an aspiration — `util.parseArgs` covers
the CLI, canvas is native, SVG generation is string templating.

### The level lives in the URL

Not on a server. No database, no accounts, no uploads, no hosted user content,
and therefore no moderation infrastructure. A static site plus one small edge
function for previews. The link *is* the artifact.

### Engines emit tile indices, never pixels

`render()` returns a `Uint8Array` of **tile indices**. The presentation layer
maps them — glyphs in the CLI, sprites on canvas in the browser. ASCII is a debug
view, not the truth.

### No AI in v1

Dropped permanently for the fortnight. Kids making things by hand is the product.

---

## 2. Determinism in JavaScript

Same level + same creature + same input log ⇒ same final state hash, on any
device, forever. This gives replay, fair times, "watch how they beat it", and a
testable engine.

JavaScript has no integers, so this needs stated discipline rather than good
intentions. **`src/core` and `src/engines` are the determinism zone:**

- **No floating point in authoritative state.** All arithmetic through `| 0` and
  `Math.imul`. Grids and state in `Uint8Array` / `Int32Array`.
- **No floating point, ever.** Real-time positions are fixed-point integers,
  256 subcells to a cell (`core/fixed.ts`). A shift, never a divide.
- **Wall-clock time never enters the zone.** The page converts elapsed
  milliseconds into whole ticks (`core/clock.ts`) and calls the engine that many
  times. The engine counts ticks and knows nothing about seconds.
- **No `Math.random`, no `Date`, no `Intl`, nothing ambient.** All randomness
  from the level seed via `mulberry32`.
- **State hash is FNV-1a 32-bit** built on `Math.imul`. Covers authoritative
  state only — positions, cycle phase, treasure flags, alert level, turn counter.
  Never render output, never appearance.
- **No object iteration order dependence.** Keyed lookups go through explicit
  sorted arrays.

Enforce with a CI check on day 1 that greps the determinism zone for `Math.random`,
`Date`, `Number.parseFloat`, and float literals. It's crude and it works.

**Golden vectors are the durable asset.** A committed set of
`(level, creature, input log) → hash` fixtures means any future port — Swift for
an iOS app, or anything else — is verifiable against the original.

---

## 3. Distribution: what WhatsApp actually permits

No consumer WhatsApp API exists. WhatsApp is a transport for links.

**Available:** `https://wa.me/?text=…` share links; the native share sheet; Open
Graph previews.

**Not available:** reading messages, sending on a user's behalf, running a game
inside the chat. No mini-app platform.

**Avoid the WhatsApp Business API.** Built for company-to-customer messaging,
billed per delivered message. Wrong shape of business entirely.

### URL structure

```
https://hoppa.app/p/Bruks-Lair-118/#<level-data>        play a level
https://hoppa.app/r/Nim-beat-it-in-94/#<result-data>   a reply: watch how they did it
https://hoppa.app/c/Bruk/#<creature-data>              import a creature
https://hoppa.app/make
```

**The `/r/` reply link is not optional.** Without it the loop is one-directional
and the conversation dies after one message. A result carries the level data, the
winner's creature, the turn count and the input log — so the original sender
*watches* their level being beaten by a creature they've never seen, which is the
thing that provokes the next send. It's also the payoff for building
deterministic replay in the first place.

Result links are longer than level links because they carry the log, but they're
tapped rather than typed, so the budget is generous.

**Fragments after `#` are never sent to the server** — level and creature data
never touch your logs, which is a real privacy position for a children's product.
But the Open Graph crawler only sees the path, so the human-readable slug goes
before the fragment and carries the preview text: *"Bruk's Lair — beaten in 118
turns. Can you?"*

The preview *image* needs an edge function that can't see the fragment. Accept a
generic card for v1 and resolve properly post-trip; don't let it eat fortnight
days.

---

## 4. Colour: NES rules

One master palette of **54 colours**, defined once in `palette.json`.

Every sprite and every tile picks a **sub-palette of 3 colours plus
transparent** — 2 bits per pixel, exactly as the NES pattern tables worked.

This is doing three jobs at once:

- **Encoding.** 2bpp halves the data. A 16×16 creature is 64 bytes raw, ~30–40
  after RLE on transparent runs.
- **Art direction.** Three colours forces silhouette-first design. It's why NES
  sprites still read at 16px, and it's what stops a kid producing brown mush.
- **Coherence.** Creatures and tiles drawn under the same rule look like one
  world, even when a hundred different kids made them.

Semantic defaults for tiles: blue water, green grass, grey stone, brown crate,
sand floor, yellow treasure, red hazard, near-black void.

**No colour picker. No custom colours.** The constraint is the feature.

*Implemented for tiles as well as sprites (`src/core/tileset.ts`): the terrain
is 8×8 patterns, three colours plus transparent, drawn under exactly the rule a
creature is drawn under — which is what makes a level and the creature standing
in it look like one world. Two tilesets so far: stone and dark floor
underground, grass-topped earth under open sky for the side-on game. Purely
presentation, so it never touches `stateHash()` and no shipped link notices.*

---

## 5. Creature sprites

A creature is a **16×16 sprite at 2bpp** plus a sub-palette index.

```
sub-palette:  3 × 6 bits  = 18 bits
pixels:       256 × 2 bits = 64 bytes raw → ~30-40 RLE'd
```

Roughly **50 characters** in the creature link. Comfortable.

### Rules

- **Appearance never touches `stateHash()`.** This is where the rule will
  actually get violated, so E10 tests it explicitly.
- **Sprite and capabilities are independent.** A kid draws something spiky and
  menacing; it can still be a featherweight. Keep them separate — trading should
  be about what a creature *does*, not how it looks.
- The CLI falls back to a single ASCII `glyph` per creature.

The pixel editor and the level editor are the same canvas grid interaction with
different palettes. Build the paint behaviour once.

---

## 5b. Creature codes, storage and first run

### Storage will betray you

Creatures live in `localStorage` — and **Safari deletes localStorage, IndexedDB,
SessionStorage and service worker registrations after 7 days without interaction
with the site.** A kid who plays on Monday and comes back a fortnight later has
lost the one object the whole product says is permanent. This is the single
biggest threat to the premise and it needs three mitigations, not one:

1. **The creature code is the save file.** Every creature has a code that can be
   copied out and pasted back in, on any device, forever. Show it immediately
   after creation, framed as *"this is the only copy — send it to yourself."*

   To be explicit about what this is for: **when the browser throws the storage
   away, the code is how a kid gets their creature back.** Pasting it in
   rebuilds the character exactly — same drawing, same points — because the code
   carries the sprite and the build, not a reference to something on a server.
   There is no server. Nothing else can recover it, which is why the code is
   shown at the moment of creation rather than buried in a menu.
2. **Prompt "add to home screen."** Home screen web apps are exempt from the
   7-day counter and keep their own use timer. Prompt once, after a creature is
   made, when the value is obvious.
3. **QR on screen.** Two kids in the same room photograph each other's screens.
   It's the most natural transfer mechanism at that age and it costs nothing.

### Code format

Level and result codes are base64url — always tapped, never typed.

**Creature codes are different: they get typed.** So they use **Crockford
base32** — case-insensitive, no ambiguous `I`, `L`, `O` or `U`, with a check
symbol. Roughly 20% longer than base64url and worth every character, because a
code retyped off a screenshot has to survive a nine-year-old.

```
HOPPA-BRUK-4T7K9-M2XQZ-8VJR3-...-K9
```

Chunked in fives, prefixed with the creature name so it's recognisable in a chat
log. Expect ~130 characters total: fine to paste, fine as a QR, honest work to
type — which is why the QR and the self-message exist.

Rendering the sprite live beside the input box as they type lets a kid see
whether they've got it right before committing.

### Importing

- Importing **adds to the stable**, never overwrites. A kid can hold several
  creatures and pick an active one.
- Re-entering the same code is **idempotent** — same creature ID replaces rather
  than duplicating.
- A malformed or check-failed code says so plainly and changes nothing.

### First run

A recipient taps a level link with no creature. **Never block on creation** —
that's a wall in front of the hook.

Play immediately with a starter creature, then offer "make your own" once they've
seen what a creature actually *does*. Optionally the sender's creature travels in
the level link as a guest, so the recipient's first game is played as Bruk. That
explains the entire premise better than any onboarding screen could.

---

## 6. Capability vocabulary

Eight axes, `0–255`. Closed set — resist adding a ninth.

| Key | Meaning |
|---|---|
| `MOVE_GROUND` | Walking competence |
| `MOVE_AIR` | Jump, hover |
| `REACH` | Range of interaction |
| `FORCE` | Damage, shove, break |
| `GUARD` | Damage resistance |
| `HASTE` | Actions per turn |
| `MASS` | Weight |
| `SPARK` | Wildcard |

### `MASS` is gone. Superseded — see `docs/adr/0008`.

The original design made `MASS` mean something *opposite* in every engine: loud
in Delve, unbeatable in Shove, sinking in Run. It read well and did not survive
contact.

Two things killed it. Every sprite is the same 16×16, so "weight" was a number
with nothing behind it — a kid could not see why their creature was heavy. And
in Delve it only ever made a creature *worse*: there was nothing heavy was good
at, so it was a penalty rather than a trade.

**What replaced it is a budget.** Two characteristics, five pips each, **six
pips to spend**:

| Characteristic | Axis | What it always means |
|---|---|---|
| **Stronger** | `FORCE` | hit harder, jump higher, take more hits |
| **Faster** | `HASTE` | move quicker, jump further |

It started as four — strength, speed, nerve, reach. Nerve and strength turned out
to be the same word to most people ("stronger" and "tougher" pick out the same
creature), and reach was a number nobody could see. Two axes make the trade
legible in one glance: see `docs/adr/0012`.

You cannot be strong *and* fast. **Deciding what to give up is the design**, and
it is what makes one kid's creature different from another's — not a number that
means opposite things in different rooms.

Both mean **the same thing in every engine**, which is what makes a creature
worth carrying between them. The noun is fixed, the verb is the engine's:
strength is a harder sword from above and a higher jump from the side. A
creature is not good or bad; it is good at *some levels*.

A creature also carries a **weapon** — sword or wand. From `roam/3` it is a real
choice, not a costume: a **sword kills** (one to four swings, by strength) and a
**wand freezes** (always one wave, three to six seconds, by strength). Neither
is better — the sword is an investment, the wand is instant relief — so the
weapon interacts with the budget rather than going round it, and the picker says
what each does so it is never a hidden power. See `docs/adr/0015` and `0016`.

`MOVE_GROUND`, `MOVE_AIR`, `SPARK`, `MASS`, `GUARD` and `REACH` remain in the
vocabulary because engine builds up to `delve/5` read them and every link pinning
those builds must keep playing identically. A build can no longer *spend* on
`GUARD` or `REACH`; the axes stay, so old links replay byte-identically.

---

## 7. Engines

Two engines ship. Both are **real time** — the world runs on its own clock at 30
ticks a second and does not wait for you (see §2). Both read the same two
characteristics; the noun is fixed, the verb is the engine's.

A level's engine is pinned in its link, so both live in the same bundle forever.

### Roam — from above

Zelda-shaped. You look down on a room, walk in eight directions, swing a sword
(or a wand) at enemies that see you and come after you. Collect what's there,
find the way out.

- **Stronger** — fewer swings to put an enemy down, longer it stays down, more hearts
- **Faster** — you move quicker, so you can outrun what you cannot beat

Enemies **die** to a sword: enough hits and one is gone for the rest of the
attempt, and the room is full again when you start over — the Zelda/Mario rule,
not a timer. A **wand** never kills; one wave freezes an enemy where it stands
for several seconds.

`roam/1` and `roam/2` are retired but still shipped. v1's enemies could walk
through walls (`docs/adr/0013`); in v2 the wand was still a costume
(`docs/adr/0016`).

### Dash — from the side

Donkey-Kong-shaped. Platforms, ladders, gravity. You run, jump, and land on
enemies from above to squash them. Fall too far and it costs you.

- **Stronger** — you jump higher (1, 2 or 3 cells), and you have more hearts
- **Faster** — you run quicker, so a jump carries you further

You deal with an enemy two ways from the side: **land on it** (the Mario move)
or **swing at it**. The weapon works exactly as it does from above, with the
same reach, so what you built carries between both games (`docs/adr/0019`).
Jump and swing are separate buttons, because jump already owns the action key.

`dash/1` and `dash/2` are retired but still shipped: under `dash/1` a creature
with no strength could not climb a single step, which made spending everything
on speed a trap (`docs/adr/0018`); neither had a weapon at all.

The same creature plays both. A strong creature muscles through Roam and reaches
platforms a fast one has to route around; a fast one outruns Roam's enemies and
clears long gaps in Dash. **Neither is better** — that is the point of sending a
level to a friend whose creature is built the other way.

### Delve — retired, still shipped

Turn-based, `delve/1` … `delve/5`. Superseded by Roam when the game went real
time (`docs/adr/0009`). Every build stays in the bundle and stays byte-identical:
links that pinned them are permanent. Nothing new targets Delve.

### Shove, Run — not built

Block pushing and a side-scroller. Both existed to give `MASS` something to
invert; `MASS` is gone (`docs/adr/0008`) and Dash covers side-on play. Out of
scope.

---

## 8. Moving parts: behaviour derived from geometry

Guards and rafts move. **Neither stores movement data in the level.**

- **Guard** patrols the corridor it stands in, ping-ponging at walls
- **Raft** slides along water until blocked, then reverses

One-tap editing, zero bytes in the encoding, and a kid can see what a piece will
do from where they put it.

### The caps this creates

Moving parts multiply the solver's state space by cycle phase:

- **Movement periods capped at 8 turns**
- **Maximum 8 treasures per level** — the collected-treasure bitmask is the
  biggest term in the search state
- Solver state is `(position, phase, treasureMask, alertLevel)` — 336 × 8 × 256 ×
  4 ≈ 2.7M states, comfortable for BFS

These caps come *from the solver*, not from taste. Enforce them in the editor
rather than discovering them when `hoppa solve` hangs.

---

## 9. Level format on disk

`.lvl` is ASCII art — readable, diffable, **editable in vim over SSH**, which is
how levels get authored before the editor exists.

```
hoppa/1 delve seed=3f7q tiles=1
########################
#@..#......$....#.....G#
#...#.####.#....#.###..#
#....~~~~~..#...$..#...#
#.####~=~#..#.####.#..G#
#....$~~~~..#....#.....#
#..#...#.####....#.###.#
#..#...........G.#...$.#
#..#####.###.#####.###.#
#........#...#.........#
#.####...#...#..####...#
#.$..#...#####.....#..>#
#....#.............#...#
########################
```

Max 16 tiles per engine. `~` water, `=` raft, `G` guard, `$` treasure, `@` start,
`>` exit.

---

## 10. Encoding

Target: **level data under 150 characters**, whole URL under 300. Roughly 2KB is
the safe floor across browsers and apps, so there's headroom — keep it short
anyway. A short URL survives screenshotting, reading aloud, and wrapping in a
group chat. And it does design work: a 24×14 grid forces levels beatable in two
minutes, and a level nobody finishes never gets a reply.

Naive 4-bits-per-tile is 168 bytes → 224 characters, over budget before
compression. So split structure from content:

- **Wall bitmap** — 336 bits = 42 bytes, bit-runs compress hard
- **Entity list** — start, exit, treasure, guards, rafts as sparse items, ~13
  bits each
- **Header** — schema version, engine ID, **engine behaviour version**, tileset
  ID, seed ≈ 6 bytes

Expect ~60 bytes → **~80 characters of base64url**.

### Links are permanent, so rules can't change

The **engine behaviour version** is separate from the schema version and matters
more. Tweak how guards detect or how `MASS` scales in month three and every proof
ever sent silently becomes invalid — but the link still decodes, so it fails
quietly rather than loudly.

Pin the behaviour version in the code and **keep old engine versions in the
bundle forever.** They're a few kilobytes each. This is the constraint most
likely to be discovered too late.

**Day 8 is a bake-off:** this scheme versus `CompressionStream('deflate-raw')` on
the raw grid. Take whichever wins on real fixtures; simplicity is worth a few
bytes.

The **tileset ID** is cheap insurance — links are permanent and unhosted, so
without it a future atlas redesign silently changes every level ever sent.

---

## 11. Creature (`.chr`)

Canonical form for hashing: keys sorted, no insignificant whitespace, integers
only.

```json
{
  "schema": 1,
  "id": "01J8XK4M2P7Q",
  "name": "Bruk",
  "glyph": "@",
  "sprite": { "palette": [12, 30, 47], "pixels": "<base64url 2bpp>" },
  "caps": {
    "MOVE_GROUND": 180, "MOVE_AIR": 40,  "REACH": 90,  "FORCE": 220,
    "GUARD": 200,       "HASTE": 60,     "MASS": 240,  "SPARK": 10
  },
  "marks": ["scorched", "unlucky"],
  "history": [
    { "level": "h:ab12", "outcome": "win", "turns": 412, "at": 7 }
  ]
}
```

`marks` — max 8, from a **closed vocabulary** so engines can branch on them:
`scorched`, `frozen`, `lucky`, `unlucky`, `veteran`, `fragile`, `stubborn`,
`hollow`.

`history` — last 32 entries locally; only the last few travel in a link. `at` is
a monotonic counter, never wall-clock.

Creatures live in browser storage and travel only when deliberately shared.

---

## 11b. The level editor

*Implemented — see `docs/adr/0014`.* A third page, `/level/`. Draw on the 24×14
grid with plain-word tools (**wall**, **clear**, **start**, **door**,
**treasure**, **enemy**, **ladder**), pick **from above** or **from the side**,
and tap **play it**.

The level reaches the game through the URL fragment — the same route a shared
level takes — so the share gate, the replay, the win screen and the QR all work
on a drawn level with nothing written for them. The reverse is the remix loop:
on a level somebody sent you the editor link reads **change this level** and
opens it for editing.

Aiming is the hard part on a phone: 24 cells across ~370 points is a 15 point
cell and a fingertip is nearer 40. Two things answer it. **Press and slide** —
walls paint under a moving finger, but anything you place one of waits for you
to lift, with a ring on the target cell and a crosshair running the full width
and height of the level so you can see where you are *past* your own finger.
And **bigger**, which redraws at a comfortable cell size (at least 34 points on
any screen) and scrolls, with arrows to look around.

The editor enforces only what keeps a draft drawable (one start, one door, the
treasure and enemy caps). Everything else is advice in plain sentences.

Side-on levels get a **gravity-aware** reachability check (`docs/adr/0017`):
you cannot walk upwards, so a flood fill will promise a ledge nothing can jump
to. The jump heights it uses are measured from `dash/1` itself and re-measured
by the tests. It is deliberately generous — unreachable means unreachable for
certain, reachable might still be hard — because a false alarm on a good level
is worse than a missed problem. **The share gate is still the real filter**: you
cannot send a level you have not beaten.

---

## 12. The share gate

**You cannot share a level you haven't beaten.** *Implemented, and proved
(`docs/adr/0020`): every input is kept, and on a win the whole run is replayed
into a fresh engine. The button appears only if that replay also wins. A proof
kept from an earlier visit is re-replayed before it counts, so storage is never
taken at its word.*

The most valuable mechanic here, and nearly free once you have deterministic
replay. Beat your own level → input log verified locally → only then does the
site produce a link → your turn count travels in the preview text as the taunt.

Quality filter, difficulty signal and trash talk in one mechanic. And nobody
receives an impossible level, which is the fastest way to kill this kind of game.

The proof is enforced **sender-side and not embedded in the code** — including it
would blow the URL budget. These are kids on holiday, not an adversarial ladder.

---

## 13. Validation

### Level checks (`hoppa verify <lvl>`)

| # | Check |
|---|---|
| L1 | Parses; exactly 24×14; only palette tiles for the declared engine |
| L2 | Exactly one start and one exit |
| L3 | Exit reachable from start ignoring guards |
| L4 | Every treasure reachable |
| L5 | At most 8 treasures; all cycle periods ≤ 8 |
| L6 | Code round-trips: encode → decode → identical level |
| L7 | Code length within budget; warn above 150 |
| L8 | URL-safe; survives percent-encoding round trip |

### Engine checks

| # | Check |
|---|---|
| E1 | Playable with an **all-zero** creature — no crash, not unwinnable by construction |
| E2 | Playable with an **all-255** creature |
| E3 | Determinism: three replays of one log produce identical hashes |
| E4 | Terminates: reaches win/loss or turn cap |
| E5 | Fuzz: 200 seeded random input logs, no crashes |
| E6 | `MASS` sensitivity is non-trivial and in the declared direction |
| E7 | `render()` returns exactly `w*h` valid tile indices |
| E8 | Malformed codes rejected cleanly, never crash |
| E9 | Golden vectors: committed fixtures still hash identically |
| E10 | Changing sprite, palette or tileset ID does **not** change `stateHash()` |
| E11 | A pinned behaviour version always routes to that engine build; unknown versions refuse politely |
| E12 | Result links replay to the claimed turn count and win status |

### Creature code checks

| # | Check |
|---|---|
| C1 | Round-trips: creature → code → creature, byte-identical |
| C2 | Check symbol catches every single-character substitution and transposition in a fuzz run |
| C3 | Case-insensitive; `I`/`1`, `O`/`0` confusions decode correctly or fail cleanly |
| C4 | Import is idempotent — same code twice yields one creature, not two |
| C5 | Oversized, truncated and garbage codes are rejected without throwing |

E6 catches a boring engine. E9 catches accidental rule changes. E10 catches
cosmetics leaking into gameplay.

---

## 14. CLI

```
bun run cli new-creature --name Bruk --glyph @ [--caps MASS=240] [--random]
bun run cli new      --engine delve > lair.lvl
bun run cli verify   lair.lvl
bun run cli play     lair.lvl --creature bruk.chr     # interactive ASCII
bun run cli replay   lair.lvl --log run.log
bun run cli solve    lair.lvl --creature bruk.chr     # BFS bot
bun run cli link     lair.lvl --log run.log           # refuses without a valid log
bun run cli open     "https://hoppa.app/p/…" > lair.lvl
bun run cli sim      lair.lvl --creatures 200
bun run cli tiles    --emit svg|png
```

`sim` is the phone-shaped feedback loop:

```
lair.lvl — delve — 200 creatures, seed 3f7q

  MASS       0-63   64-127  128-191  192-255
  win rate    88%      74%      41%      15%

  GUARD      0-63   64-127  128-191  192-255
  win rate    22%      58%      77%      84%

  overall 52%   median turns 118   caught 71   timeouts 5
```

That table tells you whether a level is *interestingly* sensitive to the creature
or just noise.

---

## 15. Repo layout

```
hoppa/
  package.json  tsconfig.json  bunfig.toml
  src/
    core/       # creature, level, codec, hash, prng — DETERMINISM ZONE
    engines/    # Engine interface, delve, shove — DETERMINISM ZONE
    solve/      # BFS bots, proof generation
    cli/        # util.parseArgs front end
    web/
      play/     # canvas renderer, play page
      make/     # level editor + sprite editor
  art/
    palette.json  tiles.json  build-tiles.ts  atlas.png
  levels/       # committed .lvl fixtures
  test/
    golden/     # (level, creature, log) → hash vectors
  docs/adr/
```

```ts
interface Engine {
  readonly id: EngineID;
  readonly consumes: ReadonlySet<Capability>;

  step(input: number): Status;
  render(): Uint8Array;      // TILE INDICES
  stateHash(): number;       // FNV-1a 32, authoritative state only
  message(): string | null;  // what the game says about your creature
}
```

`message()` is where the personality lives. *"Something this heavy was never
meant to sneak"* costs nothing and is most of the emotional payload.

---

## 16. Two-week plan — one playable build every day

**The constraint that reorders everything: there must be something tappable at
the end of every day, however crude.** Kids are the audience and the testers, and
watching a thing thicken daily is most of the fun for them. Coloured squares on
day 1 is a perfectly good day 1.

This inverts the usual build order. Instead of core → engine → UI, every day is a
thin vertical slice through the whole stack that adds one *visible* thing.

**Deploy, don't tunnel.** There's no backend, so push to static hosting
(Cloudflare Pages, Netlify, GitHub Pages) from day 1 and give the kids a URL.
Tailscale to the home machine works for your own testing but breaks the moment
you're on a beach and the Mac has slept.

**What doesn't move:** the determinism rules in §2 apply from day 1 — they're
free if you start with them and miserable to retrofit. Tests accumulate
alongside; they just stop dictating the order.

| Day | The thing they can see | Underneath |
|---|---|---|
| 1 | A coloured square you move around a grid. Walls stop you. | Bun skeleton, determinism CI check, grid model, canvas renderer, deployed URL |
| 2 | Treasure to collect, an exit, a win screen, a turn counter | Turn model, win/loss status, `stateHash` |
| 3 | **Guards that patrol and catch you.** Now it's a game | Geometry-derived patrol cycles, alert state, capture |
| 4 | Pick from three preset creatures — heavy, quick, tough — that play visibly differently | Capability wiring, `MASS` as noise radius, `message()` lines |
| 5 | Send a level to another phone by link | Codec, URL path/fragment, behaviour version pinning |
| 6 | **Draw your own creature** in three colours | Sprite editor, 16×16 2bpp, NES sub-palettes |
| 7 | Water and rafts; the real tileset instead of flat squares | `palette.json`, `tiles.json`, generated atlas |
| 8 | Save and restore your creature with a code, or a QR | Crockford base32, check symbol, import flow, C1–C5 |
| 9 | A share button — but only once you've beaten it yourself | Input logs, replay verification, share gate, `wa.me` |
| 10 | **Paint your own level** and play it | Level editor, live validation, L1–L8 |
| 11 | Send back a result: they watch how you beat it | Result links, replay playback |
| 12 | **A second game.** Your heavy creature is suddenly the hero | Shove engine, reusing tick model |
| 13 | Whatever the kids asked for, plus everything they broke | Red team: truncated URLs, retyped codes, unsolvable levels, zero-cap creatures, cycle abuse, oversized sprites |
| 14 | The whole loop, offline, on a plane | Service worker, golden vectors, README |

### What this reordering revealed

**The BFS solver may not be needed at all.** It was in the plan to generate
solvability proofs — but the share gate uses the *player's own* win log, so every
shared level is provably beatable by construction. Reachability checks (L3, L4)
are a flood fill, not a search.

That leaves the solver as a design tool only: `sim` and its `MASS` sensitivity
table. Valuable, but not on the critical path. **Move it to whenever you want it,
or drop it** — and take the day back.

### Slippage

Cut days 11 and 12 first — reply links and the second engine are the growth
mechanics, not the core loop. Never cut day 6: a kid's own creature is the whole
emotional payload.

### The real risk

Demo-driven days can leave thin foundations. The guard against that is narrow and
specific: the determinism rules, and a golden-vector test added the day any rule
changes. Everything else can be scrappy and get fixed later. Those two can't.

---

## 17. Working notes for Claude Code

- **Tests are the verification surface.** Assume the human sees only terminal
  output unless the dev server is reachable. Every feature lands with a test that
  prints or asserts something legible.
- **`src/core` and `src/engines` are the determinism zone.** No `Math.random`, no
  `Date`, no floats, no `Intl`. CI check on day 1.
- **Sprites and tiles are generated from data**, never hand-authored. NES rules:
  master palette of 54, 3 colours plus transparent per sprite, 2bpp. Commit the
  rendered atlas so it can be viewed from a phone.
- **Zero runtime dependencies.** Ask before adding any. That includes QR
  generation — a QR encoder is a few hundred lines and worth writing rather than
  pulling in.
- **Never change engine behaviour in place.** Add a new behaviour version and
  keep the old one. Shipped links are permanent.
- **Small commits, one concern each.** Diff review happens on a 6-inch screen.
- **`bun test` green at the end of every session.** If not, say so loudly at the
  top of the summary.
- **Record decisions in `docs/adr/`.**
- **When a spec detail is wrong or impossible, stop and flag it.** This was
  written without touching the toolchain; the encoding budget in §10 is
  arithmetic, not measurement.
- Prefer printing a table over printing prose.

---

## 18. Open questions

1. **Grid size.** 24×14 balances code length against interesting levels. Measure
   on day 8 and change it before two engines depend on it.
2. **Preview images.** The fragment is invisible to the crawler. Generic card for
   v1; resolve post-trip.
3. **Who awards marks?** Engine proposes on win, host validates against the
   closed vocabulary. Should an engine be able to *remove* a mark? A level that
   scrubs `scorched` off you is a nice idea.
4. **Should history affect capabilities?** Tempting — veterans get stronger.
   Dangerous: creatures diverge irreversibly and it breaks the "same creature,
   many levels" symmetry. Lean no for v1.
5. **Difficulty preview.** Should the code carry a declared difficulty so a
   sender sees "this will be brutal for your friend's creature"? That's what
   makes sending *intentional* rather than random — arguably the feature that
   turns this from a toy into a loop.
6. **Sprite moderation.** A 16×16 canvas is small, but kids can still draw
   something crude. Nothing is hosted and nothing is public, so this stays a
   private-message problem rather than a platform one — but be deliberate about
   it before any gallery or sharing hub is ever added.
7. **Creature code length.** ~130 characters is honest work to type. It could be
   halved by making the sprite procedural rather than painted — but painting is
   the point, so the length stands and the QR carries the burden. Revisit only if
   real kids refuse to use it.
8. **Guest creature in level links.** Carrying the sender's creature costs ~50
   characters and makes first run explain itself. It also slightly muddies the
   premise — you're playing as them before you play as you. Worth testing both
   ways once anyone other than you has used it.

---

## 19. What "done" looks like

```
$ bun run cli link levels/lair.lvl --log bruk-win.log
  verified: 118 turns, Bruk
  https://hoppa.app/p/Bruks-Lair-118/#D3f7qG4qX8mZ2vK9pLw0nR7tYbH
  62 chars of level data

$ bun run cli play levels/lair.lvl --creature nim.chr
  "You're small enough that nobody's listening for you."
```

And that link, opened in Safari on the same phone: a creature someone drew,
walking into a level someone else built, in three colours and getting told off
for it.
