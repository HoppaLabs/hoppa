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

export type WeaponArt = "sword" | "wand" | "trident" | "laser" | "coldlaser";

/** What to draw for this creature's weapon, in this game. */
export function weaponArt(weapon: string, engine: string): WeaponArt {
  // The city hands out lasers, and it goes FIRST -- before the wand -- because
  // a wand is the one thing that looks sillier in a jaeger's hand than a
  // broadsword does. Reported exactly that way: "it's weird for a jaeger to
  // have a wand, so maybe we have a blue laser instead of a wand?"
  //
  // So the CHOICE still decides what the weapon DOES, and the world decides
  // what it looks like doing it: a sword becomes a hot beam that cuts, a wand
  // a cold blue one that freezes. Which is, if anything, more legible than the
  // sword and the wand were -- a child can see at a glance which one they are
  // holding, and the colour says what it will do.
  if (engine === "raze") return weapon === "wand" ? "coldlaser" : "laser";
  if (weapon === "wand") return "wand";
  if (engine === "swim") return "trident";
  return "sword";
}

/** What the button says it does, for anybody reading the screen aloud. */
export function weaponSays(art: WeaponArt): string {
  if (art === "wand") return "wave your wand";
  if (art === "trident") return "jab your trident";
  if (art === "laser") return "fire your laser";
  // Not "fire your laser": it does what the wand does -- it freezes things --
  // and a child reading the button aloud has to be told which of the two they
  // picked, because the colour is the only other clue.
  if (art === "coldlaser") return "fire your freeze ray";
  return "swing your sword";
}
