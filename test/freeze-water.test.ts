// calm/3 and swim/4: a wand freezes water.
//
// "Use the wand to freeze water."
//
// It is the first answer either world has ever had to its own hazard. The
// bucket every top-down engine carries is the wrong tool for a pond and a joke
// underwater (adr/0055), so until now a garden pond and a bank of urchins were
// simply things you walked round, or paid a heart to cross.
//
// New BUILDS, not an edit: ice decides which cells you can stand on, so it
// decides the hearts, so it decides whether a log wins. Hard rule 3. Every
// calm/2 and swim/3 link ever sent still plays the game it was beaten under.

import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { engineFor, knownBuilds } from "../src/engines/registry.ts";
import { newestBuild } from "../src/core/builds.ts";
import { PRESETS, reskin, type Creature } from "../src/core/creature.ts";
import { GRID_H, GRID_W } from "../src/core/grid.ts";
import { TILE_FIRE, TILE_FROZEN } from "../src/core/tiles.ts";
import { HELD_ACT, HELD_NONE, HELD_RIGHT } from "../src/engines/types.ts";
import { toCell } from "../src/core/fixed.ts";

interface Player {
  step(held: number): number;
  where(): { x: number; y: number };
  render(): Uint8Array;
  stateHash(): number;
  health(): { hp: number; max: number };
}

/** Rows for an empty room on this build. */
function blank(engine: string, version: number): string[] {
  const rows: string[] = [`hoppa/1 ${engine} seed=oooo tiles=0 behaviour=${version}`];
  for (let y = 0; y < GRID_H; y++) {
    rows.push(y === 0 || y === GRID_H - 1 ? "#".repeat(GRID_W) : "#" + ".".repeat(GRID_W - 2) + "#");
  }
  return rows;
}

function put(rows: string[], y: number, x: number, ch: string): void {
  const line = rows[y + 1] as string;
  rows[y + 1] = line.slice(0, x) + ch + line.slice(x + 1);
}

/**
 * A room with the water DIRECTLY BELOW you, and a second pond across the room.
 *
 * Below, because a creature starts facing down (FACE_DOWN) and so a wand can be
 * waved at the water without taking a step -- which keeps the player off the
 * cells being counted. An actor is drawn over the tile it stands on, so a test
 * that walks up to a pond first is a test that cannot see one of its cells.
 */
function twoPonds(engine: string, version = newestBuild(engine)): string {
  const rows = blank(engine, version);
  put(rows, 5, 6, "@");
  put(rows, 6, 6, "^"); put(rows, 7, 6, "^"); put(rows, 7, 7, "^");  // the one below you
  put(rows, 2, 18, "^"); put(rows, 2, 19, "^");                      // and one across the room
  put(rows, 10, 14, "$");
  put(rows, 11, 20, ">");
  return rows.join("\n") + "\n";
}

/** A room with a pond walling off the gem, to be crossed rather than looked at. */
function crossing(engine: string, version = newestBuild(engine)): string {
  const rows = blank(engine, version);
  put(rows, 6, 4, "@");
  for (let x = 0; x < 2; x = (x + 1) | 0) {
    put(rows, 5, 8 + x, "^"); put(rows, 6, 8 + x, "^"); put(rows, 7, 8 + x, "^");
  }
  put(rows, 6, 18, "$");
  put(rows, 11, 20, ">");
  return rows.join("\n") + "\n";
}

const BASE = PRESETS[1] as Creature;
/** The same creature twice, differing only in what it carries. */
const WANDER = reskin(BASE, BASE.name, BASE.sprite, "wand");
const SWINGER = reskin(BASE, BASE.name, BASE.sprite, "sword");

function start(text: string, who: Creature): Player {
  return engineFor(parseLevel(text), who) as unknown as Player;
}

function counts(game: Player): { fire: number; ice: number } {
  const tiles = game.render();
  let fire = 0;
  let ice = 0;
  for (let i = 0; i < tiles.length; i = (i + 1) | 0) {
    if (tiles[i] === TILE_FIRE) fire = (fire + 1) | 0;
    if (tiles[i] === TILE_FROZEN) ice = (ice + 1) | 0;
  }
  return { fire, ice };
}

/** Wave the wand once, and let the tick settle. */
function wave(game: Player): void {
  game.step(HELD_ACT);
  game.step(HELD_NONE);
}

/**
 * Every build the wand freezes on: the one that introduced it, and the newest.
 *
 * BOTH, and that is not belt-and-braces. This list used to be just the engine
 * names, with the version defaulting to `newestBuild()` -- so the day calm/4
 * and swim/5 landed, four mutations in `calm/v3.ts` and `swim/v4.ts` started
 * SURVIVING. Those builds are still routed for every link that pinned them.
 * Nothing about them had changed; the tests had quietly walked away.
 *
 * Same lesson as roam/8's guards, the same afternoon. Moving forward is not
 * allowed to take the cover off what was left behind.
 */
const WORLDS = [
  { engine: "calm", version: 3 },
  { engine: "calm", version: newestBuild("calm") },
  { engine: "swim", version: 4 },
  { engine: "swim", version: newestBuild("swim") },
] as const;

const GARDENS = WORLDS.filter((w) => w.engine === "calm");
const REEFS = WORLDS.filter((w) => w.engine === "swim");

test("both new builds are routed, and the old ones never left", () => {
  // Freezing arrived in calm/3 and swim/4 and has been carried forward since,
  // so these are floors rather than fixed numbers: calm/4 kept the wand and
  // added a body. What must never change is that the OLD builds still route.
  expect(newestBuild("calm")).toBeGreaterThanOrEqual(3);
  expect(newestBuild("swim")).toBeGreaterThanOrEqual(4);
  for (const build of ["calm/1", "calm/2", "calm/3", "swim/1", "swim/2", "swim/3", "swim/4"]) {
    expect({ build, routed: knownBuilds().includes(build) }).toEqual({ build, routed: true });
  }
});

test("one wave turns the WHOLE pond to ice, and leaves the other pond alone", () => {
  // The whole pond, because freezing a cell at a time would mean standing in
  // the water to reach the next one -- which is not a way across, it is a
  // slower way of drowning. And flood-filled through touching water only, or
  // the wand would be a bucket with extra steps.
  for (const { engine, version } of WORLDS) {
    const game = start(twoPonds(engine, version), WANDER);
    expect({ engine, version, ...counts(game) }).toEqual({ engine, version, fire: 5, ice: 0 });
    wave(game);
    expect({ engine, version, ...counts(game) }).toEqual({ engine, version, fire: 2, ice: 3 });
  }
});

test("...and it wears off, which is what makes it a wand and not a bucket", () => {
  for (const { engine, version } of WORLDS) {
    const game = start(twoPonds(engine, version), WANDER);
    wave(game);
    expect({ engine, version, iced: counts(game).ice }).toEqual({ engine, version, iced: 3 });
    // Three seconds at no pips, and this creature has none in FORCE.
    for (let i = 0; i < 200; i = (i + 1) | 0) game.step(HELD_NONE);
    expect({ engine, version, ...counts(game) }).toEqual({ engine, version, fire: 5, ice: 0 });
  }
});

test("a sword freezes nothing at all, and that is the trade", () => {
  // The same shape as "a wand never kills": not a shortcoming, a trade.
  for (const { engine, version } of WORLDS) {
    const game = start(twoPonds(engine, version), SWINGER);
    for (let i = 0; i < 5; i = (i + 1) | 0) wave(game);
    expect({ engine, version, ...counts(game) }).toEqual({ engine, version, fire: 5, ice: 0 });
  }
});

test("in the garden the ice is a BRIDGE, because a pond there is solid", () => {
  // Two worlds, two different problems, one verb. calm makes water solid --
  // you walk round a pond or over a plank -- so ice is a way across rather
  // than a way to stop being hurt.
  for (const { version } of GARDENS) {
    const stuck = start(crossing("calm", version), WANDER);
    for (let i = 0; i < 90; i = (i + 1) | 0) stuck.step(HELD_RIGHT);
    // Hard against the water, all day.
    expect({ version, cell: toCell(stuck.where().x) }).toEqual({ version, cell: 7 });

    const over = start(crossing("calm", version), WANDER);
    for (let i = 0; i < 40; i = (i + 1) | 0) over.step(HELD_RIGHT);
    over.step(HELD_ACT);
    for (let i = 0; i < 90; i = (i + 1) | 0) over.step(HELD_RIGHT);
    expect({ version, past: toCell(over.where().x) > 12 }).toEqual({ version, past: true });
    // And it cost nothing.
    expect({ version, hp: over.health().hp }).toEqual({ version, hp: over.health().max });
  }
});

test("...and on the reef it is a HELMET: the urchins stop biting", () => {
  // swim lets you swim straight over a bank of urchins and charges you a heart
  // for it. Ice is the answer to the hurt rather than to the wall.
  for (const { version } of REEFS) {
    const bare = start(crossing("swim", version), WANDER);
    const full = bare.health().max;
    for (let i = 0; i < 120; i = (i + 1) | 0) bare.step(HELD_RIGHT);
    expect({ version, hurt: bare.health().hp < full }).toEqual({ version, hurt: true });

    const iced = start(crossing("swim", version), WANDER);
    for (let i = 0; i < 20; i = (i + 1) | 0) iced.step(HELD_RIGHT);
    iced.step(HELD_ACT);
    for (let i = 0; i < 120; i = (i + 1) | 0) iced.step(HELD_RIGHT);
    expect({ version, hp: iced.health().hp }).toEqual({ version, hp: full });
  }
});

test("the ice is in the hash, or a shared level would not replay", () => {
  // The one thing that made this a new build rather than a fix: two runs of
  // the same log have to agree about which cells were solid when somebody
  // walked over them.
  //
  // The first version of this test could not fail, and check:mutants said so
  // within the hour. It compared a run that pressed the button against one
  // that did not -- and `swing` is hashed, so the two differed whether the ice
  // was hashed or not. Exactly the mistake raze/1 made (adr/0052).
  //
  // So: BOTH runs press the button and press it at the same tick, and the only
  // difference between them is what they are holding. A wand freezes and a
  // sword does not; the two creatures have the same build, so they walk the
  // same path at the same speed and every other hashed field agrees. Then wait
  // out the swing, so `swing` and `pour` are back to zero in both, and the ONLY
  // thing left that can differ is the ice.
  const AFTER_SWING = 40;
  for (const { engine, version } of WORLDS) {
    const iced = start(twoPonds(engine, version), WANDER);
    const bare = start(twoPonds(engine, version), SWINGER);
    iced.step(HELD_ACT);
    bare.step(HELD_ACT);
    for (let i = 0; i < AFTER_SWING; i = (i + 1) | 0) { iced.step(HELD_NONE); bare.step(HELD_NONE); }
    expect({ engine, version, ice: counts(iced).ice }).toEqual({ engine, version, ice: 3 });
    expect({ engine, version, ice: counts(bare).ice }).toEqual({ engine, version, ice: 0 });
    expect({ engine, version, same: iced.stateHash() === bare.stateHash() })
      .toEqual({ engine, version, same: false });
  }
});

test("...and the control: once it thaws, those same two runs agree again", () => {
  // Without this the test above could pass on some OTHER difference between a
  // wand and a sword that nobody intended to hash. If the only thing that
  // separated them was the ice, then outliving the ice has to bring them back
  // together -- and it does, exactly.
  for (const { engine, version } of WORLDS) {
    const iced = start(twoPonds(engine, version), WANDER);
    const bare = start(twoPonds(engine, version), SWINGER);
    iced.step(HELD_ACT);
    bare.step(HELD_ACT);
    for (let i = 0; i < 300; i = (i + 1) | 0) { iced.step(HELD_NONE); bare.step(HELD_NONE); }
    expect({ engine, version, ice: counts(iced).ice }).toEqual({ engine, version, ice: 0 });
    expect({ engine, version, same: iced.stateHash() === bare.stateHash() })
      .toEqual({ engine, version, same: true });
  }
});

test("the old builds are untouched: no wand freezes anything on calm/2 or swim/3", () => {
  // Hard rule 3, stated as the thing it protects. Every garden and reef link
  // sent before today pins one of these, and a wave on one of them has to go
  // on doing exactly nothing to the water.
  for (const [engine, version] of [["calm", 2], ["swim", 3]] as const) {
    const game = start(twoPonds(engine, version), WANDER);
    for (let i = 0; i < 5; i = (i + 1) | 0) wave(game);
    expect({ engine, version, ...counts(game) }).toEqual({ engine, version, fire: 5, ice: 0 });
  }
});
