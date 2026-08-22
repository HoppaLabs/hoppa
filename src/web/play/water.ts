// Which builds carry a bucket.
//
// roam/8 was asked for as "a water bucket to put out the fires" and got one.
// Every top-down engine written since copied the mechanism, because they are
// all copies of each other by design (hard rule 3: a new behaviour is a new
// build, not an edit) -- calm/1, calm/2, swim/1, swim/2, swim/3 and raze/1 all
// read HELD_SWING and put out the fire in front of you.
//
// The BUTTON did not. It asked `engine === "roam" && version >= 8`, so in the
// garden, underwater and the city the ability shipped and was unreachable:
// four builds' worth of children walking into a flame with a bucket in hand
// and no way to tip it up. Reported from the other end -- "can the wand put out
// fires, or at least make them cooler so they don't hurt?" -- by somebody who
// had every reason to think the answer was no.
//
// A TABLE, not a condition, and the reason is the bug: a condition that names
// one engine is a condition that silently excludes the next five. Adding an
// engine to this file is now the thing you cannot forget, because a new
// top-down engine with no entry shows no bucket and the test below says so.
//
// Out of the DOM module so it can be read without a browser.

/**
 * The first build of each engine whose step() actually douses.
 *
 * Per BUILD, not per engine, and that is hard rule 3 showing through: a level
 * pinned to roam/7 has no bucket, because the person who beat it did not have
 * one, and a proof recorded without one has to replay without one.
 */
const FIRST_WATERED: Readonly<Record<string, number>> = {
  roam: 8,
  calm: 1,
  swim: 1,
  raze: 1,
};

/** Does this build put fire out when the bucket button is pressed? */
export function hasWater(engine: string, version: number): boolean {
  const first = FIRST_WATERED[engine];
  return first !== undefined && version >= first;
}

/**
 * ...and is a bucket of water a sensible answer to what this world has?
 *
 * The engines all call it fire, and TILE_FIRE is what every shipped log means,
 * but a world draws it as whatever that world has, and only TWO of the six draw
 * an actual flame -- the cave and the city. The side-on game has metal spikes,
 * the reef has urchins, the garden has a pond and the beach has the sea.
 *
 * A bucket over a pond drains the lawn; a bucket over a spike does nothing to a
 * spike. Handing a child a tool that makes no sense where they are standing is
 * worse than handing them nothing, because they will spend the level wondering
 * what they did wrong with it.
 *
 * Those worlds need a different answer, not this one. See docs/adr/0055.
 */
export function bucketHelps(hazard: string): boolean {
  return hazard === "fire";
}

/** Every engine that has ever carried one, for tests to walk. */
export function wateredEngines(): readonly string[] {
  return Object.keys(FIRST_WATERED);
}
