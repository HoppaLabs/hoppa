import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { engineFor, knownBuilds } from "../src/engines/registry.ts";
import { PRESETS } from "../src/core/creature.ts";
import { HELD_DOWN, HELD_RIGHT, HELD_UP } from "../src/engines/types.ts";
import { ACCEL, AIR_TICKS, DRAG, DROWN_TICKS, pushed } from "../src/engines/swim/v1.ts";
import { blankDraft, draftToText, falls, paint, sideOn, underwater } from "../src/core/draft.ts";
import { newestBuild } from "../src/core/builds.ts";
import { ENGINE_IDS } from "../src/core/codec.ts";
import { REEF, tilesetFor } from "../src/core/tileset.ts";

// swim/1 -- the third game. Underwater, from the side, and nothing in it falls.
// Asked for as "we need an underwater level", then "from the side?", and
// settled as "swim and currents, like Echo the Dolphin". See docs/adr/0038.

const who = PRESETS[0] as (typeof PRESETS)[number];

interface Swimmer {
  step(held: number): number;
  where(): { x: number; y: number };
  breath(): { left: number; full: number };
  health(): { hp: number; max: number };
  stateHash(): number;
}

/** The room the editor actually makes for a swim level, not one typed here. */
function reef(): Swimmer {
  const level = parseLevel(draftToText(blankDraft("swim", 1)));
  return engineFor(level, who) as unknown as Swimmer;
}

const rowOf = (e: Swimmer): number => Math.floor(e.where().y / 256);

test("the frame is rock on three sides and open at the top", () => {
  // The only frame in the game that must be open somewhere. That row is the
  // surface; seal it and the level has no air in it at all.
  const rows = draftToText(blankDraft("swim", 1)).split("\n").slice(1).filter((r) => r.length > 0);
  expect(rows[0]).not.toContain("#");            // the surface
  expect(rows[1]?.startsWith("#")).toBe(true);   // rock down the sides
  expect(rows[1]?.endsWith("#")).toBe(true);
  expect(rows[rows.length - 1]).toBe("#".repeat(24));
  console.log(`\n  the surface: ${rows[0]}\n  the seabed:  ${rows[rows.length - 1]}`);
});

test("air is UP: dive and it drains, surface and it comes back", () => {
  const engine = reef();
  expect(engine.breath().left).toBe(AIR_TICKS);

  for (let tick = 0; tick < 240; tick++) engine.step(HELD_DOWN);
  const deep = engine.breath();
  const deepRow = rowOf(engine);
  expect(deep.left).toBeLessThan(AIR_TICKS);
  expect(deepRow).toBeGreaterThan(6);

  for (let tick = 0; tick < 240; tick++) engine.step(HELD_UP);
  console.log(
    `\n  8s down: row ${deepRow}, air ${deep.left}/${AIR_TICKS}` +
    `\n  8s up:   row ${rowOf(engine)}, air ${engine.breath().left}/${AIR_TICKS}`,
  );
  expect(rowOf(engine)).toBe(0);
  expect(engine.breath().left).toBe(AIR_TICKS);
  // ...and it never cost a heart, because the air ran to zero and no further.
  expect(engine.health().hp).toBe(engine.health().max);
});

test("running out of air costs hearts steadily, not all at once", () => {
  // Steadily and with a warning, because the first time a child runs out they
  // need to understand what happened in time to do something about it.
  const engine = reef();
  for (let tick = 0; tick < 200; tick++) engine.step(HELD_DOWN);
  const full = engine.health().max;

  // Hold under until the air is gone, then a little longer.
  for (let tick = 0; tick < AIR_TICKS; tick++) engine.step(HELD_DOWN);
  expect(engine.breath().left).toBe(0);
  const atZero = engine.health().hp;

  for (let tick = 0; tick < DROWN_TICKS * 2 + 2; tick++) engine.step(HELD_DOWN);
  const after = engine.health().hp;
  console.log(
    `\n  ${full} hearts full` +
    `\n  ${atZero} after 800 ticks under -- the air ran out at 600, so this is already 200 ticks of drowning` +
    `\n  ${after} three seconds after that`,
  );
  expect(after).toBeLessThan(atZero);
  // Two hearts in two DROWN_TICKS, not eight in one tick.
  expect(atZero - after).toBeLessThanOrEqual(3);
});

test("water does not stop you dead", () => {
  // The other half of what makes swimming unlike walking. Measured rather than
  // asserted: hold right, let go, and see how far the water carries you.
  const engine = reef();
  for (let tick = 0; tick < 30; tick++) engine.step(HELD_RIGHT);
  const from = engine.where().x;
  for (let tick = 0; tick < 24; tick++) engine.step(0);
  const glide = (engine.where().x - from) / 256;
  console.log(`\n  let go at full speed and coasted ${glide.toFixed(2)} cells`);
  // Far enough to feel like water, near enough to stop before the urchins.
  expect(glide).toBeGreaterThan(0.3);
  expect(glide).toBeLessThan(1.2);
});

test("one axis of swimming, on its own", () => {
  // pushed() is pure, so the feel can be reasoned about without a level.
  expect(pushed(0, 1, 20)).toBe(ACCEL);
  expect(pushed(20, 1, 20)).toBe(20);        // capped
  expect(pushed(-20, -1, 20)).toBe(-20);
  expect(pushed(10, 0, 20)).toBe(10 - DRAG); // the water taking it back
  expect(pushed(-10, 0, 20)).toBe(-10 + DRAG);
  // It settles at rest rather than jittering round zero forever.
  expect(pushed(1, 0, 20)).toBe(0);
  expect(pushed(-1, 0, 20)).toBe(0);
  // Drag is the smaller of the two, which is what coasting means.
  expect(DRAG).toBeLessThan(ACCEL);
});

test("swimming into rock takes the speed with it", () => {
  // A wall that gave the momentum back would be a trampoline, not a wall.
  const engine = reef();
  for (let tick = 0; tick < 400; tick++) engine.step(HELD_RIGHT);
  const at = engine.where().x;
  for (let tick = 0; tick < 30; tick++) engine.step(0);
  expect(engine.where().x).toBe(at);
});

test("nothing falls, so a swimmer left alone stays put", () => {
  const engine = reef();
  const started = engine.where();
  for (let tick = 0; tick < 300; tick++) engine.step(0);
  expect(engine.where()).toEqual(started);
});

test("a run replays, breath and momentum and all", () => {
  const play = (): number => {
    const engine = reef();
    for (let tick = 0; tick < 300; tick++) {
      engine.step(tick % 7 === 0 ? HELD_DOWN : tick % 5 === 0 ? HELD_RIGHT : 0);
    }
    return engine.stateHash();
  };
  expect(play()).toBe(play());
});

// --- the two meanings of "from the side" -------------------------------------

test("drawn from the side is not the same question as things fall", () => {
  // One boolean did both jobs until swimming arrived, because until then
  // "seen from the side" and "things fall" were the same set of one engine.
  expect([sideOn("dash"), sideOn("swim"), sideOn("roam")]).toEqual([true, true, false]);
  expect([falls("dash"), falls("swim"), falls("roam")]).toEqual([true, false, false]);
  expect([underwater("swim"), underwater("dash")]).toEqual([true, false]);
});

test("no ladders underwater, and no one-deep platform rule either", () => {
  // Both are rules about GRAVITY, not about the camera. A ladder in water is
  // furniture and a stacked rock is just a rock.
  const draft = blankDraft("swim", 1);
  expect(draftToText(draft)).not.toContain("H");
  // Two rocks on top of each other: refused in dash, fine in a reef, because
  // "platforms are one deep" is a rule about jumping onto them.
  const first = paint(draft, 8, 8, "#");
  expect({ where: "reef, first rock", changed: first.changed, why: first.reason })
    .toEqual({ where: "reef, first rock", changed: true, why: "" });
  const second = paint(first.draft, 8, 7, "#");
  expect({ where: "reef, rock on rock", changed: second.changed, why: second.reason })
    .toEqual({ where: "reef, rock on rock", changed: true, why: "" });

  // The same two taps in a level that HAS gravity are refused.
  const dry = blankDraft("dash", 7);
  const one = paint(dry, 8, 8, "#");
  const two = paint(one.draft, 8, 7, "#");
  expect(two.changed).toBe(false);
  console.log(`\n  rock on rock underwater: allowed\n  rock on rock with gravity: "${two.reason}"`);
});

test("it is a world of its own, on the wire and on the screen", () => {
  // A free slot in a 4-bit field, so a fourth game cost every existing link
  // nothing at all.
  expect(ENGINE_IDS.indexOf("swim")).toBe(4);
  expect(ENGINE_IDS.slice(0, 4)).toEqual(["delve", "shove", "roam", "dash"]);
  // v1 and v2 are still routed; v3 is what a new level is drawn under. Nothing
  // ever leaves -- a link that pinned the drowning builds still finds them.
  expect(newestBuild("swim")).toBe(3);
  expect(knownBuilds()).toContain("swim/1");
  expect(knownBuilds()).toContain("swim/2");
  // Drawn from the side, and NOT the outdoors -- which is why the boolean that
  // used to pick a tileset could not go on doing it alone.
  expect(tilesetFor(true, "swim")).toBe(REEF);
  expect(tilesetFor(true)).not.toBe(REEF);
});
