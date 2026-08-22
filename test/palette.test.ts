// The palette says what it paints -- the word AND the picture, in every game.
//
// Both halves have been wrong, separately. The underwater palette drew a
// lizard on the button that paints a shark (the art asked the global enemy
// list instead of the world's cast); once that was fixed it drew a shark under
// the word "goblin" (the labels had not been given an underwater column). Both
// were reported from a phone, because opening the page was the only way to see
// the palette at all. This reads it instead.

import { expect, test } from "bun:test";
import { CASTS, ENEMIES, enemyByGlyph } from "../src/core/enemies.ts";
import { ENEMY_GLYPHS } from "../src/core/level.ts";
import { GAMES, enemyArtFor, labelFor, toolsFor, worldFor } from "../src/web/level/palette.ts";

/**
 * What each game's palette should read, top to bottom.
 *
 * Written out rather than derived. A derived table would pass whatever the
 * code happened to say, which is the failure mode this exists to catch -- and
 * a child reads these words, so they are worth reading here too.
 */
// Keyed by the word on the TAB, not by the engine: the beach and the garden
// are one engine drawn in two worlds, and there is no longer one palette per
// engine to look up.
const EXPECTED: Readonly<Record<string, readonly string[]>> = {
  adventure: ["clear", "wall", "start", "door / exit", "treasure", "goblin", "bat", "lizard", "fire"],
  platformer: ["clear", "wall", "start", "door / exit", "treasure", "goblin", "bat", "lizard", "ladder", "spikes"],
  underwater: ["clear", "rock", "start", "sea chest", "treasure", "shark", "kraken", "squid", "current", "urchins"],
  garden: ["clear", "hedge", "start", "door / exit", "flowers", "bear", "bunny", "squirrel", "bridge", "pond"],
  beach: ["clear", "dune", "start", "door / exit", "shells", "crab", "gull", "jellyfish", "jetty", "sea"],
  city: ["clear", "building", "start", "evac zone", "people", "kaiju", "swarmer", "crawler", "fire"],
};

test("every game's palette reads the way it should", () => {
  for (const game of GAMES) {
    const words = toolsFor(game.engine).map((tool) => labelFor(tool, game.engine, game.tiles));
    expect({ tab: game.label, words }).toEqual({ tab: game.label, words: EXPECTED[game.label] as string[] });
  }
});

test("an enemy button is labelled with the creature it draws", () => {
  for (const game of GAMES) {
    const world = worldFor(game.engine, game.tiles);
    for (const glyph of ENEMY_GLYPHS) {
      const creature = enemyByGlyph(glyph, world);
      expect(creature).toBeDefined();

      const tool = toolsFor(game.engine).find((one) => one.glyph === glyph);
      expect(tool).toBeDefined();

      // The word says shark, so the picture must BE the shark -- the same
      // frame, not merely some creature from the right world.
      expect(labelFor(tool!, game.engine, game.tiles)).toBe(creature!.name);
      expect(enemyArtFor(glyph, game.engine, game.tiles)?.rows).toEqual(creature!.frames[0] as string[]);
      expect(enemyArtFor(glyph, game.engine, game.tiles)?.inks).toEqual(creature!.inks as string[]);
    }
  }
});

test("each world's cast is in glyph order, because the game indexes it by number", () => {
  // A level stores an enemy as a NUMBER -- its index in ENEMY_GLYPHS -- and the
  // play page looks that number up in the world's cast. So a cast listed in a
  // different order does not draw a different-looking shark, it draws a squid.
  // Nothing else checks this: the number is the same in every world.
  for (const game of GAMES) {
    // The array itself, in the order it is written -- not a lookup by glyph,
    // which would agree with itself whatever order the list was in.
    const cast = CASTS[worldFor(game.engine, game.tiles)] ?? ENEMIES;
    expect(cast.map((one) => one.glyph)).toEqual(ENEMY_GLYPHS as string[]);
  }
});

test("no two buttons in a game say the same word", () => {
  for (const game of GAMES) {
    const words = toolsFor(game.engine).map((tool) => labelFor(tool, game.engine, game.tiles));
    expect(new Set(words).size).toBe(words.length);
  }
});

test("every game is a different world's worth of words", () => {
  // One palette per tab. If two of them read identically then one has been
  // added without being dressed, which is how "goblin" ended up on the seabed
  // -- and it is the specific risk of a skin, which shares its engine's rules
  // and has to be given every word of its own.
  const seen = new Set<string>();
  for (const game of GAMES) {
    seen.add(toolsFor(game.engine).map((tool) => labelFor(tool, game.engine, game.tiles)).join(","));
  }
  expect(seen.size).toBe(GAMES.length);
});
