// Which weapon the picture shows.
//
// "The weapon in the underwater levels should be a spear trident." A child's
// sword-or-wand choice is theirs and stays theirs; only the DRAWING follows
// the world. Cosmetic, hard rule 4 -- the engine is never told which one it
// is, so a shipped link replays the same either way.

import { expect, test } from "bun:test";
import { weaponArt, weaponSays } from "../src/web/play/weapon.ts";
import { ENGINE_IDS } from "../src/core/codec.ts";

test("a sword follows the world it is swung in", () => {
  // Two worlds overrule the drawing, and both for the same reason: nobody
  // swings a broadsword through water, and a jaeger does not fight a kaiju
  // with one either. Everywhere else a sword is a sword.
  expect(weaponArt("sword", "swim")).toBe("trident");
  expect(weaponArt("sword", "raze")).toBe("laser");
  for (const engine of ENGINE_IDS) {
    if (engine === "swim" || engine === "raze") continue;
    expect({ engine, art: weaponArt("sword", engine) }).toEqual({ engine, art: "sword" });
  }
});

/** The drawings that say "this kills things". A wand must never be one. */
const KILLING = ["sword", "trident", "laser"];

test("a wand is never drawn as something that kills, in any world", () => {
  // This is the rule, and it used to be written as "a wand is always drawn as
  // a WAND", which is a stricter thing that happened to imply it. The city
  // broke the stricter one for a good reason -- "it's weird for a jaeger to
  // have a wand, so maybe we have a blue laser instead" -- and the rule that
  // actually matters survives intact: whatever a wand is drawn as, it must not
  // be a drawing that promises a kill. A trident would be a lie. A cold blue
  // beam beside a hot orange one that cuts is not.
  for (const engine of ENGINE_IDS) {
    const art = weaponArt("wand", engine);
    expect({ engine, lies: KILLING.includes(art) }).toEqual({ engine, lies: false });
  }
});

test("...and a sword is never drawn as the thing that only freezes", () => {
  // The other direction, which is the same lie told backwards: a child who
  // picked a sword and was shown the freeze ray would stop swinging at things
  // they can actually kill.
  for (const engine of ENGINE_IDS) {
    const art = weaponArt("sword", engine);
    expect({ engine, art: art === "wand" || art === "coldlaser" }).toEqual({ engine, art: false });
  }
});

test("the city tells the two apart by colour, because it draws both as beams", () => {
  expect(weaponArt("sword", "raze")).toBe("laser");
  expect(weaponArt("wand", "raze")).toBe("coldlaser");
  // ...and they must not be the same drawing, or the whole distinction is gone.
  expect(weaponArt("sword", "raze")).not.toBe(weaponArt("wand", "raze"));
});

test("the button says what it does, for anyone reading the screen aloud", () => {
  expect(weaponSays(weaponArt("sword", "swim"))).toBe("jab your trident");
  expect(weaponSays(weaponArt("sword", "raze"))).toBe("fire your laser");
  expect(weaponSays(weaponArt("sword", "roam"))).toBe("swing your sword");
  expect(weaponSays(weaponArt("wand", "swim"))).toBe("wave your wand");
  // Not "fire your laser": it freezes, and the colour is the only other clue.
  expect(weaponSays(weaponArt("wand", "raze"))).toBe("fire your freeze ray");
});
