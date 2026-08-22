// The Easter egg: the three worlds stack.
//
// "An interesting Easter egg if you go above the sea on the underwater level it
// loads a beach level" -- and "we could also do an Easter egg if you go above
// the beach you end up in the city".
//
// The reef is under the beach and the beach is under the city, and swimming up
// hard enough comes out somewhere else. For a game made of one room at a time
// that is a nice thing to be able to say.
//
// What it must NOT be is an outcome. "You escape you don't win, it acts as a
// new game" -- so no engine learns a new status, nothing reaches stateHash(),
// no behaviour version moves, and every reef and beach link already sent gains
// this without being re-shared. It is the page navigating, and these tests
// exist mostly to keep it that way.

import { expect, test } from "bun:test";
import { PUSH_TICKS, SURFACE_ROW, Surfacer, above, stackedWorlds, surfaceSays } from "../src/web/play/surface.ts";
import { PACK } from "../src/core/pack.ts";

test("the worlds stack, and the top of the sky has nothing above it", () => {
  expect(above("reef")).toBe("the beach");
  expect(above("beach")).toBe("the city");
  // Nothing is above a city, and a garden is not under anything either.
  for (const world of ["city", "garden", "underground", "outside", "nowhere"]) {
    expect({ world, up: above(world) }).toEqual({ world, up: null });
  }
});

test("every room the chain points at is actually in the pack", () => {
  // A destination that does not exist is a dead end that only shows up when a
  // child finds the secret -- which is the worst possible time.
  for (const world of stackedWorlds()) {
    const name = above(world) as string;
    const room = PACK.find((one) => one.name === name);
    expect({ world, name, found: room !== undefined }).toEqual({ world, name, found: true });
    expect({ world, code: (room as { code: string }).code.length > 0 })
      .toEqual({ world, code: true });
  }
});

test("the chain has no loop in it, so you cannot fall up for ever", () => {
  // Each world's destination is a room; that room's own world must eventually
  // run out of sky. Walked rather than eyeballed, because a two-entry table is
  // exactly the size at which somebody adds a third entry pointing home.
  const seen = new Set<string>();
  let world: string | null = "reef";
  while (world !== null) {
    expect({ world, twice: seen.has(world) }).toEqual({ world, twice: false });
    seen.add(world);
    const name = above(world);
    world = name === "the beach" ? "beach" : name === "the city" ? "city" : null;
  }
  expect([...seen]).toEqual(["reef", "beach", "city"]);
});

test("you have to PUSH: a second of holding up, at the surface", () => {
  const surfacer = new Surfacer();
  for (let i = 0; i < PUSH_TICKS - 1; i = (i + 1) | 0) {
    expect({ tick: i, through: surfacer.push(true, true) }).toEqual({ tick: i, through: false });
  }
  expect(surfacer.push(true, true)).toBe(true);
});

test("...and swimming along the top row does not do it, however long you take", () => {
  // The whole reason for the hold. Touching the top row happens constantly in
  // ordinary play -- a gem up there, a guard to dodge -- and a child yanked out
  // of their friend's level by accident has not found a secret, they have
  // found a crash.
  const surfacer = new Surfacer();
  for (let i = 0; i < 600; i = (i + 1) | 0) {
    expect(surfacer.push(true, false)).toBe(false);
  }
});

test("...nor does holding up in the middle of the room", () => {
  const surfacer = new Surfacer();
  for (let i = 0; i < 600; i = (i + 1) | 0) {
    expect(surfacer.push(false, true)).toBe(false);
  }
});

test("dropping away from the surface forgets the whole push", () => {
  // Not a running total. Drifting along the surface with up tapped now and
  // then would otherwise add up to a breakthrough nobody asked for.
  const surfacer = new Surfacer();
  for (let i = 0; i < PUSH_TICKS - 1; i = (i + 1) | 0) surfacer.push(true, true);
  expect(surfacer.push(false, true)).toBe(false);
  // Back at it, and it starts from nothing.
  for (let i = 0; i < PUSH_TICKS - 1; i = (i + 1) | 0) {
    expect(surfacer.push(true, true)).toBe(false);
  }
  expect(surfacer.push(true, true)).toBe(true);
});

test("breaking through once does not break through again on the next tick", () => {
  const surfacer = new Surfacer();
  for (let i = 0; i < PUSH_TICKS - 1; i = (i + 1) | 0) surfacer.push(true, true);
  expect(surfacer.push(true, true)).toBe(true);
  expect(surfacer.push(true, true)).toBe(false);
});

test("no engine is told about any of this, and no build moved", async () => {
  // The property that makes it free. If surfacing ever becomes something an
  // engine knows, it becomes something stateHash() could disagree about, and
  // every shipped reef link is a proof that stops proving.
  for (const file of ["src/engines/swim/v4.ts", "src/engines/calm/v3.ts"]) {
    const src = await Bun.file(file).text();
    // Not a word search: swim/4 says "surface" in a comment about breath, and a
    // test that trips over a comment is a test that gets deleted. What must not
    // be there is the COUPLING -- the module, the class, or any reach out of
    // the determinism zone into the page at all.
    expect({ file, imports: src.includes("Surfacer") || src.includes("surface.ts") })
      .toEqual({ file, imports: false });
    expect({ file, web: src.includes('from "../../web/') }).toEqual({ file, web: false });
  }
  const page = await Bun.file("src/web/play/main.ts").text();
  // ...and the page leaves by the same door every other level change uses.
  expect(page).toContain("window.location.hash = `#p/${up.slug}/${up.code}`;");
  expect(page).toContain('window.addEventListener("hashchange", () => window.location.reload());');
});

test("the surface is the first playable row, not the wall above it", () => {
  // Row 0 is the border and nothing stands in it. If this ever pointed at 0
  // the egg would simply never hatch, silently, on every level in the game.
  expect(SURFACE_ROW).toBe(1);
});

test("each hop says something that fits the place it is leaving", () => {
  // A beach has no surface to break. A line that does not fit what just
  // happened turns a secret back into a glitch.
  expect(surfaceSays("reef")).toContain("surface");
  expect(surfaceSays("beach")).not.toContain("surface");
  for (const world of stackedWorlds()) {
    expect({ world, said: surfaceSays(world).length > 0 }).toEqual({ world, said: true });
  }
});
