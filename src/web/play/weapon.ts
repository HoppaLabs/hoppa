// Which weapon is in the picture.
//
// A child picks a sword or a wand when they draw their character, and that
// choice is theirs; it is not the sort of thing a level should overrule. But
// underwater a sword is wrong -- reported as "the weapon in the underwater
// levels should be a spear trident", which is exactly right: nobody swings a
// broadsword through water, and the thing you fight a shark with has prongs.
//
// So the CHOICE stays (sword or wand, and a wand still freezes) and only the
// DRAWING changes with the world. Cosmetic, hard rule 4: the engine is never
// told, a swing does the same damage in the same tick, and a shipped link
// replays identically whether it was drawn as a sword or a trident.
//
// Out here rather than inside the renderer so it can be read without a
// browser: the decision is one line, and a decision you cannot run a test
// against is a decision nobody is checking.

export type WeaponArt = "sword" | "wand" | "trident";

/** What to draw for this creature's weapon, in this game. */
export function weaponArt(weapon: string, engine: string): WeaponArt {
  if (weapon === "wand") return "wand";
  return engine === "swim" ? "trident" : "sword";
}

/** What the button says it does, for anybody reading the screen aloud. */
export function weaponSays(art: WeaponArt): string {
  if (art === "wand") return "wave your wand";
  return art === "trident" ? "jab your trident" : "swing your sword";
}
