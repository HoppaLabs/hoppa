// Vance carries the wand.
//
// THE FINDING
//
// Of the four creatures on the front page, two were the same creature. Bash and
// Vance had byte-identical caps AND the same weapon, so a child who picked the
// robot instead of the cat got a different picture and an identical game. It
// showed up as matching bot times in all fifteen shipped rooms, across all six
// engines, three runs in a row -- which is not a coincidence, it is a duplicate.
//
// It was not an oversight. adr/0050 measured it: there are two characteristics
// and six points, "very slow but incredibly strong" is 5/1, and that is exactly
// what Bash already spends. HASTE 0 was built and tried and lost nine of the
// fifteen rooms. So the caps were right, and the ADR closed by saying that
// making them differ in PLAY needs "a third characteristic or a bigger budget
// -- a spec change, and one to take on purpose."
//
// The weapon is neither. Every creature already carries one, a child already
// picks it in the character editor, and it costs nothing out of the six points.
//
// So the jaeger gets the wand, and the caps do not move.

import { expect, test } from "bun:test";
import { BRUK, NIM, PELL, PRESETS, VANCE, sameCreature } from "../src/core/creature.ts";
import { parseLevel } from "../src/core/level.ts";
import { engineFor } from "../src/engines/registry.ts";
import { newestBuild } from "../src/core/builds.ts";
import { GRID_H, GRID_W } from "../src/core/grid.ts";
import { HELD_ACT, HELD_NONE, HELD_RIGHT } from "../src/engines/types.ts";
import { weaponArt } from "../src/web/play/weapon.ts";

interface Fighter {
  step(held: number): number;
  enemiesLeft(): number;
  justKilled(): boolean;
  justFroze(): boolean;
  canKill(): boolean;
}

/** A room with a guard four cells to the right of the start. */
function room(engine: string, tiles: number): string {
  const rows = [`hoppa/1 ${engine} seed=vance tiles=${tiles} behaviour=${newestBuild(engine)}`];
  for (let y = 0; y < GRID_H; y++) {
    const edge = y === 0 || y === GRID_H - 1;
    rows.push(edge ? "#".repeat(GRID_W) : "#" + ".".repeat(GRID_W - 2) + "#");
  }
  const put = (y: number, x: number, ch: string): void => {
    const line = rows[y + 1] as string;
    rows[y + 1] = line.slice(0, x) + ch + line.slice(x + 1);
  };
  put(6, 3, "@");
  put(6, 7, "G");
  put(6, 16, "$");
  put(6, 20, ">");
  return rows.join("\n") + "\n";
}

/** Walk right, swinging all the way, and say what became of the guard. */
function haveAGo(who: typeof BRUK, engine = "roam", tiles = 0): {
  killed: boolean; froze: boolean; standing: number;
} {
  const game = engineFor(parseLevel(room(engine, tiles)), who) as unknown as Fighter;
  let killed = false;
  let froze = false;
  for (let tick = 0; tick < 200; tick = (tick + 1) | 0) {
    game.step(HELD_RIGHT | (tick % 12 === 0 ? HELD_ACT : HELD_NONE));
    if (game.justKilled()) killed = true;
    if (game.justFroze()) froze = true;
  }
  return { killed, froze, standing: game.enemiesLeft() };
}

test("the four starters are four different creatures", () => {
  // The property that was quietly false. sameCreature() compares everything a
  // child could tell apart -- the drawing, the build, the weapon and the name.
  for (let i = 0; i < PRESETS.length; i = (i + 1) | 0) {
    for (let j = i + 1; j < PRESETS.length; j = (j + 1) | 0) {
      const a = PRESETS[i] as typeof BRUK;
      const b = PRESETS[j] as typeof BRUK;
      expect({ a: a.name, b: b.name, same: sameCreature(a, b) })
        .toEqual({ a: a.name, b: b.name, same: false });
    }
  }
});

test("...and they differ in PLAY, not only in the picture", () => {
  // Two creatures with the same numbers and the same weapon play identically
  // however differently they are drawn, and that is the thing that was wrong.
  // Every pair now differs in something the engine actually reads.
  const reads = (c: typeof BRUK): string =>
    `${c.caps.FORCE}/${c.caps.HASTE}/${c.weapon}`;
  const seen = new Set(PRESETS.map(reads));
  expect(seen.size).toBe(PRESETS.length);
});

test("Vance's numbers are still Bash's, because that measurement stands", () => {
  // adr/0050 built HASTE 0 and it lost nine of fifteen rooms. Nothing about
  // that changed, so the caps do not move: this is a weapon change, not a
  // rebalance smuggled in behind one.
  expect(VANCE.caps).toEqual(BRUK.caps);
});

test("the jaeger carries the wand and nobody else does", () => {
  expect(VANCE.weapon).toBe("wand");
  for (const who of [BRUK, NIM, PELL]) {
    expect({ who: who.name, weapon: who.weapon }).toEqual({ who: who.name, weapon: "sword" });
  }
});

test("a sword finishes a guard; the wand freezes it and it is still there", () => {
  // The whole difference, in the one place a child will see it. A wand never
  // kills -- it makes the room safe for a while instead of clearing it out,
  // which is what a machine built for containing giant monsters would do.
  const bash = haveAGo(BRUK);
  const vance = haveAGo(VANCE);
  console.log(`  Bash:  killed=${bash.killed} froze=${bash.froze} guards left=${bash.standing}`);
  console.log(`  Vance: killed=${vance.killed} froze=${vance.froze} guards left=${vance.standing}`);
  expect({ killed: bash.killed, standing: bash.standing }).toEqual({ killed: true, standing: 0 });
  expect({ froze: vance.froze, standing: vance.standing }).toEqual({ froze: true, standing: 1 });
});

test("...and the engine agrees about which of them can kill at all", () => {
  const bash = engineFor(parseLevel(room("roam", 0)), BRUK) as unknown as Fighter;
  const vance = engineFor(parseLevel(room("roam", 0)), VANCE) as unknown as Fighter;
  expect(bash.canKill()).toBe(true);
  expect(vance.canKill()).toBe(false);
});

test("in the city the wand is already drawn as the freeze ray it was asked to be", () => {
  // "It's weird for a jaeger to have a wand, so maybe we have a blue laser
  // instead of a wand?" -- weaponArt() has drawn exactly that since the day the
  // city landed. Until now no default character could actually fire one.
  expect(weaponArt(VANCE.weapon, "raze")).toBe("coldlaser");
  expect(weaponArt(BRUK.weapon, "raze")).toBe("laser");
  // And it is still a wand everywhere the world has no opinion.
  expect(weaponArt(VANCE.weapon, "roam")).toBe("wand");
});
