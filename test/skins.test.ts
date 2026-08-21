// The skins, and the field that chooses them.
//
// "We have a request for beach levels", and then a city where the player is a
// jaeger and the thing on the street is a kaiju. Neither is a new GAME -- both
// are somewhere else to put one -- so both are SKINS: an existing engine drawn
// in another world, chosen by the level's `tiles=` field.
//
// The beach is the garden's engine at the seaside. The city is the adventure
// game downtown, where rescuing people and getting them to an evac zone is
// what "pick the treasure up and the door opens" already was.
//
// That field has been on the wire since day one and read by nobody, which is
// the whole risk here. Every level ever encoded carries a value in it. Start
// reading that value at the wrong number and every link ever sent renders as
// something else. Most of this file is about that.

import { expect, test } from "bun:test";
import { BEACH, CITY, FIRST_SKIN, GARDEN, REEF, UNDERGROUND, OUTSIDE, tilesetFor } from "../src/core/tileset.ts";
import { CASTS } from "../src/core/enemies.ts";
import { ENEMY_GLYPHS } from "../src/core/level.ts";
import { blankDraft, draftFromLevel, draftToText, retarget } from "../src/core/draft.ts";
import { parseLevel } from "../src/core/level.ts";
import { decodeLevel, encodeLevel } from "../src/core/codec.ts";
import { engineFor } from "../src/engines/registry.ts";
import { PRESETS } from "../src/core/creature.ts";
import { hashHex } from "../src/core/hash.ts";
import { PACK } from "../src/core/pack.ts";
import { newestBuild } from "../src/core/builds.ts";
import { GAMES, labelFor, toolsFor } from "../src/web/level/palette.ts";

test("every number below the reserved floor is the engine's own world", () => {
  // The one that matters. tiles=1 is what every level ever encoded carries,
  // and tileset 1 is the DUNGEON -- so reading the field from 1 would render
  // every reef and every garden ever sent as a cave.
  for (let tiles = 0; tiles < FIRST_SKIN; tiles++) {
    expect({ tiles, set: tilesetFor(false, "roam", tiles).name }).toEqual({ tiles, set: UNDERGROUND.name });
    expect({ tiles, set: tilesetFor(true, "dash", tiles).name }).toEqual({ tiles, set: OUTSIDE.name });
    expect({ tiles, set: tilesetFor(true, "swim", tiles).name }).toEqual({ tiles, set: REEF.name });
    expect({ tiles, set: tilesetFor(false, "calm", tiles).name }).toEqual({ tiles, set: GARDEN.name });
  }
});

test("...and the shipped rooms all sit under it, so none of them moved", () => {
  for (const room of PACK) {
    const level = decodeLevel(room.code);
    const asked = level.tilesetId;
    if (asked >= FIRST_SKIN) continue;      // the beach asks; the rest do not
    expect({ room: room.slug, asked: asked < FIRST_SKIN }).toEqual({ room: room.slug, asked: true });
  }
});

test("a skin is chosen by number, whatever engine is carrying it", () => {
  expect(tilesetFor(false, "calm", FIRST_SKIN).name).toBe(BEACH.name);
  expect(tilesetFor(false, "roam", FIRST_SKIN).name).toBe(BEACH.name);
  expect(BEACH.id).toBe(FIRST_SKIN);
  expect(tilesetFor(false, "roam", CITY.id).name).toBe(CITY.name);
  expect(tilesetFor(false, "calm", CITY.id).name).toBe(CITY.name);
  expect(CITY.id).toBeGreaterThan(FIRST_SKIN);
});

test("an unknown skin number falls back rather than failing", () => {
  // A link from a future build asking for tileset 9 should still play. It gets
  // its engine's world, which is what it would have got before skins existed.
  expect(tilesetFor(false, "calm", 9).name).toBe(GARDEN.name);
  expect(tilesetFor(false, "roam", 15).name).toBe(UNDERGROUND.name);
});

test("each skin has a cast of its own, in glyph order", () => {
  const want: Readonly<Record<string, readonly string[]>> = {
    [BEACH.name]: ["crab", "gull", "jellyfish"],
    [CITY.name]: ["kaiju", "swarmer", "crawler"],
  };
  for (const [world, names] of Object.entries(want)) {
    const cast = CASTS[world];
    expect({ world, defined: cast !== undefined }).toEqual({ world, defined: true });
    expect({ world, names: cast!.map((one) => one.name) }).toEqual({ world, names: [...names] });
    expect({ world, glyphs: cast!.map((one) => one.glyph) }).toEqual({ world, glyphs: [...ENEMY_GLYPHS] });
  }
});

test("a skin is cosmetic: the same room plays the same in either world", () => {
  // Hard rule 4, at the level this feature actually risks breaking it. A skin
  // IS its engine's own rules, so the two levels differ in exactly one number
  // and that number must reach nothing.
  const log = [0, 2, 2, 4, 8, 1, 1, 0, 4, 4, 2, 8, 0, 1, 2, 4];
  const hashOf = (text: string): string => {
    const game = engineFor(parseLevel(text), PRESETS[0] as (typeof PRESETS)[number]) as unknown as {
      step(input: number): number;
      stateHash(): number;
    };
    for (const held of log) game.step(held);
    return hashHex(game.stateHash());
  };
  for (const [engine, skin] of [["calm", BEACH.id], ["roam", CITY.id]] as const) {
    const version = newestBuild(engine);
    const plain = draftToText(blankDraft(engine, version, 0));
    const skinned = draftToText(blankDraft(engine, version, skin));
    expect({ engine, same: skinned === plain.replace("tiles=0", `tiles=${skin}`) })
      .toEqual({ engine, same: true });
    expect({ engine, hash: hashOf(skinned) }).toEqual({ engine, hash: hashOf(plain) });
  }
});

test("the skin survives the round trip a shared link makes", () => {
  // draft -> text -> level -> code -> level -> draft. Anywhere along there
  // that drops the number, a beach a child sent arrives as a garden.
  const start = blankDraft("calm", newestBuild("calm"), FIRST_SKIN);
  const level = parseLevel(draftToText(start));
  expect(level.tilesetId).toBe(FIRST_SKIN);
  const back = decodeLevel(encodeLevel(level));
  expect(back.tilesetId).toBe(FIRST_SKIN);
  expect(draftFromLevel(back).tilesetId).toBe(FIRST_SKIN);
});

test("switching between the garden and the beach keeps every cell", () => {
  // They are one engine. Retargeting between two tabs that share an engine
  // used to be a no-op that ignored the skin, which would have made the beach
  // tab do nothing at all.
  const version = newestBuild("calm");
  const garden = blankDraft("calm", version, 0);
  const beach = retarget(garden, "calm", version, FIRST_SKIN);
  expect(beach.tilesetId).toBe(FIRST_SKIN);
  expect(beach.cells).toEqual(garden.cells);
  expect(retarget(beach, "calm", version, 0).tilesetId).toBe(0);
});

test("the city ships a room, and it is drawn as a city", () => {
  // The one that would catch the whole feature being wired up and then not
  // reaching a level anybody can open.
  const room = PACK.find((one) => one.slug === "the-city");
  expect(room).toBeDefined();
  const level = decodeLevel(room!.code);
  expect(level.tilesetId).toBe(CITY.id);
  expect(level.engine).toBe("roam");
  expect(tilesetFor(false, level.engine, level.tilesetId).name).toBe(CITY.name);
});

test("the city has its own way out, and its own thing to collect", () => {
  // A padlocked oak door is wrong twice over in a city -- nobody rescues
  // people through one, and there is no wall for it to be set into. The
  // drawings live in the renderer; what is checkable from here is that the
  // WORDS moved with them, which is the half that has been wrong before.
  const city = GAMES.find((one) => one.label === "city");
  expect(city).toBeDefined();
  const words = toolsFor(city!.engine).map((tool) => labelFor(tool, city!.engine, city!.tiles));
  expect(words).toContain("evac zone");
  expect(words).toContain("people");
  expect(words).not.toContain("door / exit");
  expect(words).not.toContain("treasure");
});

test("opening a skinned level from the shelf keeps its world", () => {
  // The bug this exists for: retarget()'s tilesetId defaulted to 0, so every
  // caller that only meant to change the ENGINE VERSION threw the skin away.
  // freshen() -- which is what the level editor runs on anything opened from
  // the shelf or a link -- is exactly such a caller, so tapping "the beach"
  // handed back a garden. Reported as "the beach example level actually looks
  // like a garden".
  //
  // The fix is retarget keeping the skin by default, so this walks the same
  // path the shelf does: a shipped code, decoded, drafted, freshened.
  for (const slug of ["the-beach", "the-city"]) {
    const room = PACK.find((one) => one.slug === slug);
    expect({ slug, found: room !== undefined }).toEqual({ slug, found: true });
    const drawn = draftFromLevel(decodeLevel(room!.code));
    expect({ slug, skin: drawn.tilesetId >= FIRST_SKIN }).toEqual({ slug, skin: true });
    // freshen(), in the two lines the editor uses.
    const freshened = retarget(drawn, drawn.engine, newestBuild(drawn.engine), drawn.tilesetId);
    expect({ slug, skin: freshened.tilesetId }).toEqual({ slug, skin: drawn.tilesetId });
    // ...and the plain three-argument call keeps it too, which is the actual fix.
    expect({ slug, skin: retarget(drawn, drawn.engine, newestBuild(drawn.engine)).tilesetId })
      .toEqual({ slug, skin: drawn.tilesetId });
  }
});

test("changing GAME still changes the world, because the tab says which", () => {
  // The other half: keeping the skin by default must not mean a beach stays a
  // beach when a child taps "underwater". The tab passes its own number.
  const beach = draftFromLevel(decodeLevel((PACK.find((o) => o.slug === "the-beach"))!.code));
  expect(retarget(beach, "swim", newestBuild("swim"), 0).tilesetId).toBe(0);
});
