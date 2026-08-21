// The palette: what you can draw with, what it is called, and what it looks
// like -- for every game.
//
// Lifted out of the editor so it can be READ WITHOUT A BROWSER. Three separate
// defects came from the palette drifting away from the world it paints into: a
// button labelled "fire" that painted an urchin, a button drawn as a lizard
// that painted a shark, and a button labelled "lizard" over a picture of a
// crab. Each one could only be seen by opening the page on a phone. Now
// test/palette.test.ts reads this directly and checks the word and the picture
// agree, in all four worlds.

import { enemyByGlyph } from "../../core/enemies.ts";
import { MAX_FLOW, sideOn, type Glyph } from "../../core/draft.ts";
import {
  GLYPH_BAT, GLYPH_DRAGON,
  GLYPH_EXIT, GLYPH_FIRE, GLYPH_FLOOR, GLYPH_FLOW_RIGHT,
  GLYPH_GUARD, GLYPH_LADDER,
  GLYPH_START, GLYPH_TREASURE, GLYPH_WALL,
} from "../../core/level.ts";
import { tilesetFor } from "../../core/tileset.ts";

export interface Tool {
  readonly glyph: Glyph;
  readonly label: string;
  /**
   * Drawn with a rubber over its tile, the way the character editor draws its
   * see-through pen. Clearing a cell paints floor, so the tile underneath is
   * honest -- but "the tool that takes things away" is what it IS.
   */
  readonly rubber?: boolean;
  /**
   * What it is called in each world that calls it something else.
   *
   * One entity, three faces: the same hazard is a flame below ground, spikes
   * out in the open and an urchin on the seabed. A button labelled "fire" that
   * paints spikes is a button that lies.
   *
   * A map rather than a field per world. It began as one `skyLabel`, took a
   * second when the water arrived, and a third would have been a nested
   * ternary nobody could read -- so it is keyed by engine and the next world
   * costs a line.
   */
  readonly names?: Readonly<Record<string, string>>;
  /** Only offered for the games that have it. */
  readonly engines?: readonly string[];
  /** Shows "3 of 8" under the button when there is a limit worth knowing. */
  readonly limit?: number;
}

export const TOOLS: readonly Tool[] = [
  // The rubber first, the way it is first on the character editor. It is the
  // tool you reach for most and the one you want before you have decided what
  // you are drawing, and it was sitting second behind the wall.
  { glyph: GLYPH_FLOOR, label: "clear", rubber: true },
  { glyph: GLYPH_WALL, label: "wall", names: { swim: "rock", calm: "hedge" } },
  { glyph: GLYPH_START, label: "start" },
  // Every game but the garden. A garden has nowhere you are trying to get to,
  // so a door standing in one is a button that does nothing -- calm/1 draws it
  // and then never opens it, because there is no win to gate. A new garden is
  // laid out without one (see blankDraft); this stops a child putting one back.
  { glyph: GLYPH_EXIT, label: "door / exit", engines: ["roam", "dash", "swim"] },
  { glyph: GLYPH_TREASURE, label: "treasure", names: { calm: "flowers" }, limit: 8 },
  // Three enemies, one tool each. They walk, chase and die exactly alike --
  // what changes is what a child sees walking towards them, which at nine
  // years old is most of what an enemy IS.
  { glyph: GLYPH_GUARD, label: "goblin", names: { swim: "shark", calm: "bunny" }, limit: 10 },
  { glyph: GLYPH_BAT, label: "bat", names: { swim: "octopus", calm: "bird" }, limit: 10 },
  { glyph: GLYPH_DRAGON, label: "lizard", names: { swim: "crab", calm: "squirrel" }, limit: 10 },
  { glyph: GLYPH_LADDER, label: "ladder", names: { calm: "bridge" }, engines: ["dash", "calm"] },
  // One tool, four directions. Drag it and the water goes the way you dragged.
  { glyph: GLYPH_FLOW_RIGHT, label: "current", engines: ["swim"], limit: MAX_FLOW },
  // One tool, two names. It is the same entity either way -- what changes is
  // what the world draws, because a flame standing on grass looks like a
  // mistake and spikes in a cave look like a floor. See src/core/tileset.ts.
  { glyph: GLYPH_FIRE, label: "fire", names: { dash: "spikes", swim: "urchins", calm: "pond" }, limit: 10 },
];

/**
 * The three games, and the rules a NEW level is drawn under.
 *
 * The version comes from the registry, never from a number written here. A
 * hardcoded one went stale the moment dash/3 shipped, and every level drawn
 * afterwards was quietly still dash/2 -- so the sword a child had just been
 * given did nothing in the levels they made with it.
 *
 * The labels name the GAME, not the camera angle. They were "from above" and
 * "from the side", which describes how a level is drawn rather than what it is
 * to play -- and it stopped scaling the moment a third and fourth arrived,
 * because underwater is also from the side and a garden is also from above.
 *
 * A nine-year-old knows what a platformer is.
 */
export const GAMES = [
  { engine: "roam", label: "adventure" },
  { engine: "dash", label: "platformer" },
  { engine: "swim", label: "underwater" },
  { engine: "calm", label: "garden" },
] as const;

/** The world a game is drawn in, by name -- which cast of creatures it holds. */
export function worldFor(engine: string): string {
  return tilesetFor(sideOn(engine), engine).name;
}

/**
 * The enemy drawing a tool paints, as rows and inks, IN THIS WORLD.
 *
 * The world it is, not the world in general. A button that paints a shark has
 * to have a shark on it, and this asked the global list -- so the underwater
 * palette showed a lizard while the game itself showed a shark.
 */
export function enemyArtFor(glyph: string, engine: string): { rows: readonly string[]; inks: readonly string[] } | null {
  const world = worldFor(engine);
  const enemy = enemyByGlyph(glyph, world);
  if (enemy === undefined) return null;
  return { rows: enemy.frames[0] as readonly string[], inks: enemy.inks };
}

/**
 * What a tool is called in this game.
 *
 * The picture comes from the world (enemyArtFor, above) and the word comes
 * from here, and the two have to be the same creature. They were not: the
 * underwater palette drew a shark under the word "goblin", because the art had
 * been fixed and the labels had not.
 */
export function labelFor(entry: Tool, engine: string): string {
  return entry.names?.[engine] ?? entry.label;
}

/** The tools offered in a game, in order. */
export function toolsFor(engine: string): readonly Tool[] {
  return TOOLS.filter((entry) => entry.engines === undefined || entry.engines.includes(engine));
}
