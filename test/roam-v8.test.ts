import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { engineFor, knownBuilds } from "../src/engines/registry.ts";
import { PRESETS } from "../src/core/creature.ts";
import { HELD_DOWN, HELD_RIGHT, HELD_SWING, HELD_UP, STATUS_PLAYING } from "../src/engines/types.ts";
import { TILE_FIRE, TILE_GUARD } from "../src/core/tiles.ts";
import { POUR_TICKS } from "../src/engines/roam/v8.ts";
import { newestBuild } from "../src/core/builds.ts";

// roam/8: a bucket of water, and fire goes out. See docs/adr/0037.
//
// Asked for by the nine-year-old this is built for, twice: "need a water
// bucket to put out the fires". Fire arrived in v6 as the hazard that does not
// move, which is what makes it a ROUTE problem -- but a route problem whose
// only answer is "go the long way" is a wall. Water makes it a price.

const who = PRESETS[0] as (typeof PRESETS)[number];

/**
 * A room with a flame two cells right of where you start.
 *
 * Measured, because where the player is decides what these tests mean: from a
 * standing start, holding right, this creature is in cell 2 at 14 ticks --
 * beside the flame, facing it -- and standing IN cell 3, the flame, by 20.
 */
function room(behaviour: number): string {
  return [
    `hoppa/1 roam seed=0 tiles=0 behaviour=${behaviour}`,
    "########################",
    "#@.^..$...............>#",
    ...Array.from({ length: 11 }, () => "#......................#"),
    "########################",
  ].join("\n");
}

interface Watered {
  step(held: number): number;
  render(): Uint8Array;
  health(): { hp: number; max: number };
  currentStatus(): number;
  pouring?(): number;
  justDoused?(): boolean;
  firesLeft?(): { out: number; total: number };
}

function start(behaviour: number): Watered {
  return engineFor(parseLevel(room(behaviour)), who) as unknown as Watered;
}

/**
 * How many cells are still DRAWN as fire.
 *
 * Only trustworthy while the player is standing somewhere else: render() puts
 * the actor down last, so a player stood in a flame hides it. Where the engine
 * offers firesLeft(), prefer that -- it cannot be fooled by a sprite.
 */
function flames(engine: Watered): number {
  return [...engine.render()].filter((t) => t === TILE_FIRE).length;
}

test("standing beside a fire and pouring puts it out", () => {
  const engine = start(8);
  expect(flames(engine)).toBe(1);

  // Cell 2, facing right, flame in cell 3. Not standing in it.
  for (let tick = 0; tick < 14; tick++) engine.step(HELD_RIGHT);
  expect(flames(engine)).toBe(1);

  engine.step(HELD_SWING);
  expect(engine.justDoused?.()).toBe(true);
  expect(engine.firesLeft?.()).toEqual({ out: 1, total: 1 });
  expect(flames(engine)).toBe(0);
});

test("...and it stays out", () => {
  const engine = start(8);
  for (let tick = 0; tick < 14; tick++) engine.step(HELD_RIGHT);
  engine.step(HELD_SWING);
  for (let tick = 0; tick < 300; tick++) engine.step(0);
  expect(engine.firesLeft?.()).toEqual({ out: 1, total: 1 });
  expect(flames(engine)).toBe(0);
});

test("a fire that is out cannot burn you", () => {
  // Walk straight into the flame with no water: a heart goes.
  const burnt = start(8);
  for (let tick = 0; tick < 90; tick++) burnt.step(HELD_RIGHT);
  const hurt = burnt.health();
  expect(hurt.hp).toBeLessThan(hurt.max);

  // Same walk, but put it out on the way. Nothing touches you.
  const dry = start(8);
  for (let tick = 0; tick < 14; tick++) dry.step(HELD_RIGHT);
  dry.step(HELD_SWING);
  for (let tick = 0; tick < 90; tick++) dry.step(HELD_RIGHT);
  const whole = dry.health();
  console.log(`\n  walked through the flame: ${hurt.hp}/${hurt.max} hearts` +
    `\n  put it out first:         ${whole.hp}/${whole.max} hearts`);
  expect(whole.hp).toBe(whole.max);
});

test("the bucket also empties over the cell you are standing in", () => {
  // The moment a child reaches for the bucket is the moment they have just
  // walked into a flame. "Turn round and face the thing you are standing in"
  // is not a rule anybody would guess.
  const engine = start(8);
  for (let tick = 0; tick < 22; tick++) engine.step(HELD_RIGHT);
  // Standing IN it: the sprite is drawn over the flame, so ask the engine
  // rather than the picture.
  expect(engine.firesLeft?.()).toEqual({ out: 0, total: 1 });
  engine.step(HELD_SWING);
  expect(engine.firesLeft?.()).toEqual({ out: 1, total: 1 });
});

test("pouring costs you the clock, which is the whole price of it", () => {
  // A pour cannot be re-started until it has finished, exactly as a swing
  // works. Holding the bucket does not empty it faster.
  const engine = start(8);
  engine.step(HELD_SWING);
  // The countdown ticks down at the TOP of a step and the pour is started at
  // the bottom of it, exactly as a swing works -- so a fresh pour reads full.
  expect(engine.pouring?.()).toBe(POUR_TICKS);
  for (let tick = 0; tick < 4; tick++) engine.step(HELD_SWING);
  // Still counting the FIRST pour down, not starting a fifth.
  expect(engine.pouring?.()).toBe(POUR_TICKS - 4);
  for (let tick = 0; tick < POUR_TICKS; tick++) engine.step(0);
  expect(engine.pouring?.()).toBe(0);
});

test("water cannot put out a fire across the room", () => {
  // Cells, not distances, and only two of them: the one you face and the one
  // you are in. Otherwise a bucket is a fire extinguisher with infinite range
  // and fire stops being a route at all.
  const engine = start(8);
  for (let tick = 0; tick < 200; tick++) engine.step(HELD_SWING | HELD_UP);
  // Facing up, at the top of the room, nowhere near it.
  expect(flames(engine)).toBe(1);
});

test("roam/7 has no water, because that is how its links were played", () => {
  // Hard rule 3. HELD_SWING was unused from above, so pressing it in an older
  // build does nothing at all -- which is exactly what it did for the person
  // who beat that link and sent it to you.
  const engine = start(7);
  // Cell 2, beside the flame and facing it -- where v8 puts it out.
  for (let tick = 0; tick < 14; tick++) engine.step(HELD_RIGHT);
  for (let tick = 0; tick < 40; tick++) engine.step(HELD_SWING);
  expect(flames(engine)).toBe(1);
  expect(engine.currentStatus()).toBe(STATUS_PLAYING);
  expect(knownBuilds()).toContain("roam/7");
});

test("which fires are out is real state, so a level still replays", () => {
  // Two runs of the same log have to agree, or a shared level is not a proof.
  const play = (): number => {
    const engine = engineFor(parseLevel(room(8)), who) as unknown as {
      step(held: number): number; stateHash(): number;
    };
    for (let tick = 0; tick < 14; tick++) engine.step(HELD_RIGHT);
    engine.step(HELD_SWING);
    for (let tick = 0; tick < 60; tick++) engine.step(HELD_RIGHT | (tick % 9 === 0 ? HELD_DOWN : 0));
    return engine.stateHash();
  };
  expect(play()).toBe(play());

  // ...and a run that poured is NOT the same state as one that did not.
  const dry = engineFor(parseLevel(room(8)), who) as unknown as {
    step(held: number): number; stateHash(): number;
  };
  for (let tick = 0; tick < 14; tick++) dry.step(HELD_RIGHT);
  dry.step(0);
  for (let tick = 0; tick < 60; tick++) dry.step(HELD_RIGHT | (tick % 9 === 0 ? HELD_DOWN : 0));
  expect(dry.stateHash()).not.toBe(play());
});

test("a new top-down level is drawn with water in it", () => {
  // roam/8 brought the bucket; roam/9 kept it and gave the creature a body.
  expect(newestBuild("roam")).toBeGreaterThanOrEqual(8);
  // dash/9 is the newest now: weight. Spikes still do not go out.
  expect(newestBuild("dash")).toBe(9);
});

test("roam/8's guards still walk, now that no shipped room is on roam/8", () => {
  // This test exists because a MUTATION started surviving. "Enemies stop
  // moving at all" -- the day-17 bug -- had been caught for weeks by the pack
  // rooms being beaten by the bot. Re-pinning the pack to roam/9 quietly took
  // that cover away, and roam/8 is still routed for every link that pinned it.
  //
  // Retiring a build from the pack is not retiring it from the game.
  const room = [
    "hoppa/1 roam seed=walk tiles=0 behaviour=8",
    "########################",
    "#@....G...............>#",
    ...Array.from({ length: 11 }, () => "#......................#"),
    "########################",
  ].join("\n");
  const engine = engineFor(parseLevel(room), who) as unknown as {
    step(held: number): number;
    render(): Uint8Array;
  };
  const guardAt = (): number => [...engine.render()].indexOf(TILE_GUARD);
  const wasAt = guardAt();
  expect(wasAt).toBeGreaterThan(0);
  let moved = false;
  for (let tick = 0; tick < 60 && !moved; tick = (tick + 1) | 0) {
    engine.step(0);
    if (guardAt() !== wasAt) moved = true;
  }
  expect(moved).toBe(true);
});
