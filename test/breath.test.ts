// Drowning has to SAY it is drowning.
//
// Reported as "In the underwater level the player character seems to randomly
// get hurt after passing a bubble, very odd?" -- and the bubbles are innocent:
// they live in the renderer, no engine has ever read one, and hard rule 4 says
// they never will. What was happening is that the air ran out at AIR_TICKS and
// a heart went every DROWN_TICKS, announced by the engine as "That hurt." --
// the same three words an urchin uses, on a tick with nothing anywhere near.
//
// The engine is right and shipped; this is what the PAGE says about it.
//
// AIR IS GONE FROM swim/3 -- see adr/0042 -- and every line below still has to
// hold, because swim/1 and swim/2 are shipped forever and every reef link
// already sent pins one of them. So this stops asking the PACK (which is on v3
// now and does not drown anybody) and pins its own swim/2 level instead.

import { expect, test } from "bun:test";
import {
  AIR_OUT, AIR_QUIET, AIR_WARNED, LOW, breathPips, breathWarning,
} from "../src/web/play/breath.ts";
import { AIR_TICKS, DROWN_TICKS } from "../src/engines/swim/v2.ts";
import { parseLevel } from "../src/core/level.ts";
import { engineFor } from "../src/engines/registry.ts";
import { PRESETS } from "../src/core/creature.ts";
import { HELD_NONE, HELD_UP } from "../src/engines/types.ts";

const full = AIR_TICKS;

test("nothing is said while there is air to spare", () => {
  for (const left of [full, (full * 3) / 4, full / 2, full / LOW + 1]) {
    expect(breathWarning({ left, full }, AIR_QUIET).text).toBeNull();
  }
});

test("one warning on the way down, not one a tick", () => {
  const low = { left: full / LOW, full };
  const first = breathWarning(low, AIR_QUIET);
  expect(first.text).toBe("come up for air");
  expect(first.said).toBe(AIR_WARNED);
  // ...and then silence, all the way to empty.
  expect(breathWarning(low, first.said).text).toBeNull();
  expect(breathWarning({ left: 1, full }, first.said).text).toBeNull();
});

test("out of air it speaks every tick, because the damage does too", () => {
  // A one-shot here got 900ms of screen and was then buried under "That hurt."
  // arriving every DROWN_TICKS for the rest of the dive.
  let said = AIR_WARNED;
  for (let tick = 0; tick < DROWN_TICKS * 3; tick++) {
    const heard = breathWarning({ left: 0, full }, said);
    said = heard.said;
    expect(heard.text).toBe("no air -- swim up!");
  }
  expect(said).toBe(AIR_OUT);
});

test("surfacing rearms it, so the next dive is warned too", () => {
  const back = breathWarning({ left: full, full }, AIR_OUT);
  expect(back.said).toBe(AIR_QUIET);
  expect(breathWarning({ left: full / LOW, full }, back.said).text).toBe("come up for air");
});

test("an engine that does not breathe is never nagged about air", () => {
  const quiet = breathWarning(undefined, AIR_QUIET);
  expect(quiet.text).toBeNull();
  expect(quiet.said).toBe(AIR_QUIET);
});

test("the meter turns colour at the same moment the warning speaks", () => {
  // The word and the colour together, or the colour goes first and the word
  // arrives too late to swim anywhere.
  const { state } = breathPips({ left: full / LOW, full }, 6);
  expect(state).not.toBe("air");
  expect(breathPips({ left: full, full }, 6)).toEqual({ lit: 6, state: "air" });
  expect(breathPips({ left: 1, full }, 6).state).toBe("air-0");
});

/** A swim/2 room: open along the top, rock everywhere else. */
const DROWNABLE = [
  "hoppa/1 swim seed=0 tiles=1 behaviour=2",
  "........................",
  "#.@...................>#",
  ...Array.from({ length: 11 }, () => "#......................#"),
  "########################",
].join("\n");

test("swim/2 really does drown you, which is what all of this is about", () => {
  const level = parseLevel(DROWNABLE);
  expect(level.behaviourVersion).toBe(2);
  const engine = engineFor(level, PRESETS[0] as (typeof PRESETS)[number]) as unknown as {
    step(held: number): number;
    breath(): { left: number; full: number };
    health(): { hp: number; max: number };
  };

  const hearts = engine.health().max;
  for (let tick = 0; tick < AIR_TICKS + DROWN_TICKS + 2; tick++) engine.step(HELD_NONE);
  expect(engine.breath().left).toBe(0);
  expect(engine.health().hp).toBeLessThan(hearts);

  // ...and that swimming up is the answer, so the words are not a lie.
  for (let tick = 0; tick < 120; tick++) engine.step(HELD_UP);
  expect(engine.breath().left).toBe(engine.breath().full);
  const held = engine.health().hp;
  for (let tick = 0; tick < DROWN_TICKS * 2; tick++) engine.step(HELD_UP);
  expect(engine.health().hp).toBe(held);
});
