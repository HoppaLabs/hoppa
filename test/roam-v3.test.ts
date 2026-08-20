import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import { engineFor } from "../src/engines/registry.ts";
import { creatureFromBuild, type Build } from "../src/core/creature.ts";
import { starterSprite } from "../src/core/sprite.ts";
import {
  RoamV3, downTicksFor, hitsToKillFor, killsFor, heartsFor, reachFor, speedFor,
} from "../src/engines/roam/v3.ts";
import { RoamV2 } from "../src/engines/roam/v2.ts";
import {
  HELD_ACT, HELD_LEFT, HELD_RIGHT, HELD_UP, STATUS_PLAYING,
} from "../src/engines/types.ts";

const ROAM3 = (await Bun.file("levels/roam1.lvl").text()).replace("behaviour=1", "behaviour=3");
const level = parseLevel(ROAM3);

const armed = (build: Build, weapon: "sword" | "wand") =>
  creatureFromBuild("x", weapon, "@", build, starterSprite(), weapon);

const ARENA = parseLevel([
  "hoppa/1 roam seed=1a1a tiles=1 behaviour=3",
  "########################",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#.@...G...............$#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#.....................>#",
  "########################",
].join("\n") + "\n");

/** Swing at the guard until something happens, then report what. */
function fight(weapon: "sword" | "wand", build: Build) {
  const engine = new RoamV3(ARENA, armed(build, weapon));
  let status: number = STATUS_PLAYING;
  let killed = false;
  let froze = false;
  let firstEffectAt = -1;
  for (let t = 0; t < 900 && status === STATUS_PLAYING && !killed; t++) {
    status = engine.step(HELD_RIGHT | (t % 4 === 0 ? HELD_ACT : 0));
    if (engine.justKilled()) killed = true;
    if (engine.justFroze()) froze = true;
    if (firstEffectAt < 0 && (killed || froze)) firstEffectAt = t;
  }
  return { killed, froze, firstEffectAt, left: engine.enemiesLeft() };
}

// --- the two weapons do different things ------------------------------------------

test("a sword kills and a wand does not", () => {
  const strong: Build = { FORCE: 5, HASTE: 1 };
  expect(killsFor(armed(strong, "sword"))).toBe(true);
  expect(killsFor(armed(strong, "wand"))).toBe(false);
  expect(hitsToKillFor(armed(strong, "wand"))).toBe(0);

  const sword = fight("sword", strong);
  expect(sword.killed).toBe(true);
  expect(sword.left).toBe(0);

  const wand = fight("wand", strong);
  expect(wand.killed).toBe(false);
  expect(wand.froze).toBe(true);
  expect(wand.left).toBe(1); // still there, just not going anywhere
});

test("a wand always works first wave; a weak sword needs four", () => {
  const weak: Build = { FORCE: 0, HASTE: 5 };
  expect(hitsToKillFor(armed(weak, "sword"))).toBe(4);
  // One wave is one wave whatever your arms are like.
  expect(killsFor(armed(weak, "wand"))).toBe(false);
  expect(fight("wand", weak).froze).toBe(true);
});

test("a wand's freeze is far longer than a sword's stun, at every strength", () => {
  for (let pips = 0; pips <= 5; pips++) {
    const build = { FORCE: pips, HASTE: 0 } as Build;
    const freeze = downTicksFor(armed(build, "wand"));
    const stun = downTicksFor(armed(build, "sword"));
    expect(freeze).toBeGreaterThan(stun * 2);
    // At least three seconds at 30 ticks a second, or it is just a worse sword.
    expect(freeze).toBeGreaterThanOrEqual(90);
  }
});

test("strength still buys something whichever you carry", () => {
  const weak = { FORCE: 0, HASTE: 5 } as Build;
  const strong = { FORCE: 5, HASTE: 1 } as Build;
  // Sword: fewer swings. Wand: longer freeze. Neither leaves strength idle.
  expect(hitsToKillFor(armed(strong, "sword")))
    .toBeLessThan(hitsToKillFor(armed(weak, "sword")));
  expect(downTicksFor(armed(strong, "wand")))
    .toBeGreaterThan(downTicksFor(armed(weak, "wand")));
});

// --- neither is strictly better ------------------------------------------------------

test("the weapon changes nothing except what a swing does", () => {
  const build: Build = { FORCE: 3, HASTE: 3 };
  const sword = armed(build, "sword");
  const wand = armed(build, "wand");
  expect(reachFor(wand)).toBe(reachFor(sword));
  expect(speedFor(wand)).toBe(speedFor(sword));
  expect(heartsFor(wand)).toBe(heartsFor(sword));
  expect(wand.caps).toEqual(sword.caps);
});

test("the shipped level is playable with either, at every strength", () => {
  // Not a proof that every level is winnable both ways -- the share gate is
  // what guarantees a sent level was beaten. This is the weaker claim that
  // matters: neither weapon crashes, stalls, or is dead on arrival.
  for (const weapon of ["sword", "wand"] as const) {
    for (let pips = 0; pips <= 5; pips++) {
      const build = { FORCE: pips, HASTE: (5 - pips) as number } as Build;
      const engine = new RoamV3(level, armed(build, weapon));
      let status: number = STATUS_PLAYING;
      let ticks = 0;
      for (let t = 0; t < 1200 && status === STATUS_PLAYING; t++) {
        status = engine.step((t % 5 === 0 ? HELD_ACT : 0) | (t % 200 < 100 ? HELD_RIGHT : HELD_UP));
        ticks++;
      }
      expect(ticks).toBeGreaterThan(0);
      expect(engine.render()).toHaveLength(24 * 14);
    }
  }
});

// --- determinism and the older builds ---------------------------------------------------

test("v3 replays identically three times over, with either weapon", () => {
  for (const weapon of ["sword", "wand"] as const) {
    const hashes: string[] = [];
    for (let run = 0; run < 3; run++) {
      const engine = new RoamV3(level, armed({ FORCE: 3, HASTE: 3 }, weapon));
      let status: number = STATUS_PLAYING;
      for (let t = 0; t < 900 && status === STATUS_PLAYING; t++) {
        status = engine.step((t % 6 === 0 ? HELD_ACT : 0) | (t % 160 < 80 ? HELD_RIGHT : HELD_UP));
      }
      hashes.push(hashHex(engine.stateHash()));
    }
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[1]).toBe(hashes[2]);
  }
});

test("in v3 the weapon DOES change the hash -- it is no longer a costume", () => {
  const play = (weapon: "sword" | "wand") => {
    const engine = new RoamV3(level, armed({ FORCE: 3, HASTE: 3 }, weapon));
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 900 && status === STATUS_PLAYING; t++) {
      status = engine.step((t % 5 === 0 ? HELD_ACT : 0) | (t % 160 < 80 ? HELD_RIGHT : HELD_UP));
    }
    return hashHex(engine.stateHash());
  };
  expect(play("sword")).not.toBe(play("wand"));
});

test("v2 is untouched: there, a wand is still exactly a sword", () => {
  const v2level = parseLevel(ROAM3.replace("behaviour=3", "behaviour=2"));
  const play = (weapon: "sword" | "wand") => {
    const engine = new RoamV2(v2level, armed({ FORCE: 3, HASTE: 3 }, weapon));
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 900 && status === STATUS_PLAYING; t++) {
      status = engine.step((t % 5 === 0 ? HELD_ACT : 0) | (t % 160 < 80 ? HELD_RIGHT : HELD_UP));
    }
    return hashHex(engine.stateHash());
  };
  expect(play("sword")).toBe(play("wand"));
});

test("all three roam builds route", () => {
  for (const version of [1, 2, 3]) {
    const text = ROAM3.replace("behaviour=3", `behaviour=${version}`);
    expect(engineFor(parseLevel(text)).behaviourVersion).toBe(version);
  }
});


// --- the swing had a hole in it -----------------------------------------------------

test("a swing hits an enemy standing right on top of you", () => {
  // v1 and v2 measured from the blade's TIP, one and a half cells ahead, and
  // accepted anything within a cell of it. That is a ring with a hole in the
  // middle: an enemy pressed against you fell through it, so you took hits
  // while swinging and nothing happened. Found by playing, not by testing.
  const engine = new RoamV3(ARENA, armed({ FORCE: 5, HASTE: 1 }, "sword"));
  let status: number = STATUS_PLAYING;
  let touchedUs = false;
  let killed = false;

  // Walk into it without swinging until it is actually touching...
  for (let t = 0; t < 400 && status === STATUS_PLAYING && !touchedUs; t++) {
    status = engine.step(HELD_RIGHT);
    if (engine.justHurt()) touchedUs = true;
  }
  expect(touchedUs).toBe(true);

  // ...then swing. At this range the old rule missed every time.
  for (let t = 0; t < 200 && status === STATUS_PLAYING && !killed; t++) {
    status = engine.step(HELD_ACT);
    if (engine.justKilled()) killed = true;
  }
  expect(killed).toBe(true);
});

test("you still cannot hit something behind you at range", () => {
  const engine = new RoamV3(ARENA, armed({ FORCE: 5, HASTE: 1 }, "sword"));
  let status: number = STATUS_PLAYING;
  // Face and walk LEFT, away from the guard, swinging the whole time.
  for (let t = 0; t < 60 && status === STATUS_PLAYING; t++) {
    status = engine.step(HELD_LEFT | (t % 4 === 0 ? HELD_ACT : 0));
  }
  expect(engine.enemiesLeft()).toBe(1);
});
