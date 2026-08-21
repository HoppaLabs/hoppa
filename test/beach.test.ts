// The beach, and the field that chooses it.
//
// "We have a request for beach levels." A beach is not a new game -- it is
// somewhere else to put one -- so it is a SKIN: the garden's engine, drawn in
// another world, chosen by the level's `tiles=` field.
//
// That field has been on the wire since day one and read by nobody, which is
// the whole risk here. Every level ever encoded carries a value in it. Start
// reading that value at the wrong number and every link ever sent renders as
// something else. Most of this file is about that.

import { expect, test } from "bun:test";
import { BEACH, FIRST_SKIN, GARDEN, REEF, UNDERGROUND, OUTSIDE, tilesetFor } from "../src/core/tileset.ts";
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

test("tiles=5 is the beach, whatever engine is carrying it", () => {
  expect(tilesetFor(false, "calm", FIRST_SKIN).name).toBe(BEACH.name);
  expect(tilesetFor(false, "roam", FIRST_SKIN).name).toBe(BEACH.name);
  expect(BEACH.id).toBe(FIRST_SKIN);
});

test("an unknown skin number falls back rather than failing", () => {
  // A link from a future build asking for tileset 9 should still play. It gets
  // its engine's world, which is what it would have got before skins existed.
  expect(tilesetFor(false, "calm", 9).name).toBe(GARDEN.name);
});

test("the beach has a cast of its own, in glyph order", () => {
  const cast = CASTS[BEACH.name];
  expect(cast).toBeDefined();
  expect(cast!.map((one) => one.name)).toEqual(["crab", "gull", "jellyfish"]);
  expect(cast!.map((one) => one.glyph)).toEqual(ENEMY_GLYPHS as string[]);
});

test("a skin is cosmetic: the same room plays the same on either", () => {
  // Hard rule 4, at the level this feature actually risks breaking it. The
  // beach IS the garden's engine, so the two levels differ in exactly one
  // number and that number must reach nothing.
  const version = newestBuild("calm");
  const garden = draftToText(blankDraft("calm", version, 0));
  const beach = draftToText(blankDraft("calm", version, FIRST_SKIN));
  expect(beach).toBe(garden.replace("tiles=0", `tiles=${FIRST_SKIN}`));

  const log = [0, 2, 2, 4, 8, 1, 1, 0, 4, 4, 2, 8, 0, 1, 2, 4];
  const hashOf = (text: string): string => {
    const game = engineFor(parseLevel(text), PRESETS[0] as (typeof PRESETS)[number]) as unknown as {
      step(input: number): number;
      stateHash(): number;
    };
    for (const held of log) game.step(held);
    return hashHex(game.stateHash());
  };
  expect(hashOf(beach)).toBe(hashOf(garden));
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
