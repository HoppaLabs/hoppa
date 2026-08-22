// Which weapon is in the picture.
//
// A child picks a sword or a wand when they draw their character, and that
// choice is theirs; it is not the sort of thing a level should overrule. But
// underwater a sword is wrong -- reported as "the weapon in the underwater
// levels should be a spear trident", which is exactly right: nobody swings a
// broadsword through water, and the thing you fight a shark with has prongs.
// The city wanted the same thing again, for the same reason: "the robot needs
// a laser instead of a sword", and a jaeger with a broadsword is a jaeger
// nobody would draw.
//
// So the CHOICE stays (sword or wand, and a wand still freezes) and only the
// DRAWING changes with the world. Cosmetic, hard rule 4: the engine is never
// told, a swing does the same damage in the same tick, and a shipped link
// replays identically whether it was drawn as a sword or a trident.
//
// Out here rather than inside the renderer so it can be read without a
// browser: the decision is one line, and a decision you cannot run a test
// against is a decision nobody is checking.

export type WeaponArt = "sword" | "wand" | "trident" | "laser";

/** What to draw for this creature's weapon, in this game. */
export function weaponArt(weapon: string, engine: string): WeaponArt {
  if (weapon === "wand") return "wand";
  if (engine === "swim") return "trident";
  // A jaeger does not swing a sword at a kaiju. Same rule as the trident, one
  // world along: "the robot needs a laser instead of a sword".
  if (engine === "raze") return "laser";
  return "sword";
}

/** What the button says it does, for anybody reading the screen aloud. */
export function weaponSays(art: WeaponArt): string {
  if (art === "wand") return "wave your wand";
  if (art === "trident") return "jab your trident";
  if (art === "laser") return "fire your laser";
  return "swing your sword";
}
