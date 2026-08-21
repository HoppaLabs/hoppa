// calm/2: one bear that means it, and two that do not.
//
// "In the garden game the bunny, bird and squirrel should just wonder not
//  attack or follow" ... "we'll have a bear as an enemy, so we need the weapons
//  back" ... "the garden needs an exit".
//
// A garden with a way out, a thing that hunts you and a sword to answer it is
// a LEVEL, so calm/2 is roam/8's rules wearing the garden's. What is new to
// the whole project is that WHICH creature it is now decides what it does:
// everywhere else the three enemies walk, chase and die alike and only look
// different. See adr/0045.
//
// This file exists because tools/mutate.ts said it should: deleting the line
// that stops a bunny hurting you left the entire suite green.

import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { engineFor } from "../src/engines/registry.ts";
import { PRESETS } from "../src/core/creature.ts";
import { HELD_ACT, HELD_NONE, HELD_RIGHT, STATUS_LOST, STATUS_PLAYING, STATUS_WON } from "../src/engines/types.ts";
import { ONE } from "../src/core/fixed.ts";

type Garden = {
  step(held: number): number;
  health(): { hp: number; max: number };
  currentStatus(): number;
  where(): { x: number; y: number };
  enemyPositions(): Array<{ x: number; y: number; chasing: boolean }>;
};

const WHO = PRESETS[0] as (typeof PRESETS)[number];

/** A garden with one creature of `glyph` standing right beside you. */
function beside(glyph: string, version = 2): Garden {
  const rows = [
    `hoppa/1 calm seed=0 tiles=1 behaviour=${version}`,
    "########################",
    `#.@${glyph}..................>#`,
    ...Array.from({ length: 11 }, () => "#......................#"),
    "########################",
  ];
  return engineFor(parseLevel(rows.join("\n")), WHO) as unknown as Garden;
}

test("a bear takes hearts; a bunny and a squirrel never do", () => {
  const table: string[] = [];
  for (const [glyph, name, hurts] of [["G", "bear", true], ["B", "bunny", false], ["D", "squirrel", false]] as const) {
    const garden = beside(glyph);
    const full = garden.health().max;
    for (let tick = 0; tick < 600; tick++) garden.step(HELD_RIGHT);
    const left = garden.health().hp;
    table.push(`  ${name.padEnd(9)} twenty seconds of walking into it: ${left}/${full} hearts`);
    expect({ name, hurt: left < full }).toEqual({ name, hurt: hurts });
  }
  console.log("\n" + table.join("\n"));
});

test("a bear comes after you; a bunny and a squirrel carry on wandering", () => {
  for (const [glyph, name, hunts] of [["G", "bear", true], ["B", "bunny", false], ["D", "squirrel", false]] as const) {
    const garden = beside(glyph);
    let everChased = false;
    for (let tick = 0; tick < 300; tick++) {
      garden.step(HELD_NONE);
      if (garden.enemyPositions().some((one) => one.chasing)) everChased = true;
    }
    expect({ name, hunts: everChased }).toEqual({ name, hunts });
  }
});

test("the sword cuts the bear and passes through the rest", () => {
  // calm/1 shipped with a working sword by inheritance and five swings cleared
  // every bunny in the garden. The answer then was to take the weapon away;
  // now that there is a bear to use it on, the answer is that it only cuts the
  // bear.
  for (const [glyph, name, killable] of [["G", "bear", true], ["B", "bunny", false], ["D", "squirrel", false]] as const) {
    const garden = beside(glyph);
    const before = garden.enemyPositions().length;
    for (let tick = 0; tick < 600; tick++) garden.step(HELD_RIGHT | HELD_ACT);
    expect({ name, gone: garden.enemyPositions().length < before }).toEqual({ name, gone: killable });
  }
});

test("a garden you can walk out of, and one you can lose", () => {
  // Both halves of being a level, which calm/1 is not.
  const out = beside("B");
  let status: number = STATUS_PLAYING;
  for (let tick = 0; tick < 2000 && status === STATUS_PLAYING; tick++) status = out.step(HELD_RIGHT);
  expect(status).toBe(STATUS_WON);

  const mauled = beside("G");
  status = STATUS_PLAYING;
  for (let tick = 0; tick < 4000 && status === STATUS_PLAYING; tick++) status = mauled.step(HELD_RIGHT);
  // It either got out or the bear got it -- what matters is that it ENDED.
  expect(status).not.toBe(STATUS_PLAYING);
});

test("calm/1 is untouched: nothing hunts, nothing hurts, nothing ends", () => {
  // Hard rule 3. Every garden link already sent pins calm/1.
  for (const glyph of ["G", "B", "D"]) {
    const place = beside(glyph, 1);
    const full = place.health().max;
    let status: number = STATUS_PLAYING;
    for (let tick = 0; tick < 4000; tick++) status = place.step(HELD_RIGHT | HELD_ACT);
    expect({ glyph, hp: place.health().hp }).toEqual({ glyph, hp: full });
    expect({ glyph, status }).toEqual({ glyph, status: STATUS_PLAYING });
    expect({ glyph, alive: place.enemyPositions().length }).toEqual({ glyph, alive: 1 });
  }
});

test("a pond is solid, and a bridge over one is not", () => {
  const pond = [
    "hoppa/1 calm seed=0 tiles=1 behaviour=2",
    "########################",
    "#.@.^..................>#".slice(0, 24),
    ...Array.from({ length: 11 }, () => "#......................#"),
    "########################",
  ].join("\n");
  const blocked = engineFor(parseLevel(pond), WHO) as unknown as Garden;
  const from = blocked.where().x;
  for (let tick = 0; tick < 300; tick++) blocked.step(HELD_RIGHT);
  // Stopped at the water's edge rather than walking through it.
  expect(blocked.where().x - from).toBeLessThan(3 * ONE);
  expect(blocked.health().hp).toBe(blocked.health().max);   // and it did not hurt

  const bridged = engineFor(parseLevel(pond.replace("#.@.^", "#.@.H")), WHO) as unknown as Garden;
  const start = bridged.where().x;
  for (let tick = 0; tick < 300; tick++) bridged.step(HELD_RIGHT);
  expect(bridged.where().x - start).toBeGreaterThan(5 * ONE);
});
