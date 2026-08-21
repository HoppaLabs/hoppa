// Which weapon the picture shows.
//
// "The weapon in the underwater levels should be a spear trident." A child's
// sword-or-wand choice is theirs and stays theirs; only the DRAWING follows
// the world. Cosmetic, hard rule 4 -- the engine is never told which one it
// is, so a shipped link replays the same either way.

import { expect, test } from "bun:test";
import { weaponArt, weaponSays } from "../src/web/play/weapon.ts";
import { ENGINE_IDS } from "../src/core/codec.ts";

test("a sword is a trident underwater and a sword everywhere else", () => {
  expect(weaponArt("sword", "swim")).toBe("trident");
  for (const engine of ENGINE_IDS) {
    if (engine === "swim") continue;
    expect({ engine, art: weaponArt("sword", engine) }).toEqual({ engine, art: "sword" });
  }
});

test("a wand stays a wand, including underwater", () => {
  // The wand is not a weapon a world can overrule: it FREEZES rather than
  // kills, and a child who picked it would be shown a lie by a trident.
  for (const engine of ENGINE_IDS) {
    expect({ engine, art: weaponArt("wand", engine) }).toEqual({ engine, art: "wand" });
  }
});

test("the button says what it does, for anyone reading the screen aloud", () => {
  expect(weaponSays(weaponArt("sword", "swim"))).toBe("jab your trident");
  expect(weaponSays(weaponArt("sword", "roam"))).toBe("swing your sword");
  expect(weaponSays(weaponArt("wand", "swim"))).toBe("wave your wand");
});
