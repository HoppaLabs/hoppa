// Behaviour version routing -- spec S13's E11: "a pinned behaviour version
// always routes to that engine build; unknown versions refuse politely".
//
// This table is append-only. Removing a row breaks every link that pinned it,
// which is the whole reason old builds stay in the bundle.

import type { Creature } from "../core/creature.ts";
import type { Level } from "../core/level.ts";
import { DelveV1, DELVE_V1_BEHAVIOUR } from "./delve/v1.ts";
import { DelveV2, DELVE_V2_BEHAVIOUR } from "./delve/v2.ts";
import { DelveV3, DELVE_V3_BEHAVIOUR } from "./delve/v3.ts";
import { DelveV4, DELVE_V4_BEHAVIOUR } from "./delve/v4.ts";
import { DelveV5, DELVE_V5_BEHAVIOUR } from "./delve/v5.ts";
import { RoamV1, ROAM_V1_BEHAVIOUR } from "./roam/v1.ts";
import { RoamV2, ROAM_V2_BEHAVIOUR } from "./roam/v2.ts";
import { RoamV3, ROAM_V3_BEHAVIOUR } from "./roam/v3.ts";
import { RoamV4, ROAM_V4_BEHAVIOUR } from "./roam/v4.ts";
import { RoamV5, ROAM_V5_BEHAVIOUR } from "./roam/v5.ts";
import { RoamV6, ROAM_V6_BEHAVIOUR } from "./roam/v6.ts";
import { RoamV7, ROAM_V7_BEHAVIOUR } from "./roam/v7.ts";
import { RoamV8, ROAM_V8_BEHAVIOUR } from "./roam/v8.ts";
import { SwimV1, SWIM_V1_BEHAVIOUR } from "./swim/v1.ts";
import { SwimV2, SWIM_V2_BEHAVIOUR } from "./swim/v2.ts";
import { SwimV3, SWIM_V3_BEHAVIOUR } from "./swim/v3.ts";
import { CalmV1, CALM_V1_BEHAVIOUR } from "./calm/v1.ts";
import { CalmV2, CALM_V2_BEHAVIOUR } from "./calm/v2.ts";
import { DashV1, DASH_V1_BEHAVIOUR } from "./dash/v1.ts";
import { DashV2, DASH_V2_BEHAVIOUR } from "./dash/v2.ts";
import { DashV3, DASH_V3_BEHAVIOUR } from "./dash/v3.ts";
import { DashV4, DASH_V4_BEHAVIOUR } from "./dash/v4.ts";
import { DashV5, DASH_V5_BEHAVIOUR } from "./dash/v5.ts";
import { DashV6, DASH_V6_BEHAVIOUR } from "./dash/v6.ts";
import { DashV7, DASH_V7_BEHAVIOUR } from "./dash/v7.ts";
import { DashV8, DASH_V8_BEHAVIOUR } from "./dash/v8.ts";
import type { Engine } from "./types.ts";

export class UnknownBehaviourError extends Error {}

// A creature is an input from day 4 on. Builds older than that ignore it: their
// rules were fixed before creatures existed and must stay that way.
type Build = (level: Level, creature: Creature | undefined) => Engine;

const BUILDS: ReadonlyMap<string, Build> = new Map<string, Build>([
  [`delve/${DELVE_V1_BEHAVIOUR}`, (level) => new DelveV1(level)],
  [`delve/${DELVE_V2_BEHAVIOUR}`, (level) => new DelveV2(level)],
  [`delve/${DELVE_V3_BEHAVIOUR}`, (level) => new DelveV3(level)],
  [
    `delve/${DELVE_V4_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new DelveV4(level) : new DelveV4(level, creature),
  ],
  [
    `delve/${DELVE_V5_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new DelveV5(level) : new DelveV5(level, creature),
  ],
  // Real time. Same level format, same links -- the world just stopped waiting.
  [
    `roam/${ROAM_V1_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new RoamV1(level) : new RoamV1(level, creature),
  ],
  // v2: enemies stay out of walls, and they can be killed. v1 is still here
  // and still exact -- every link that pinned roam/1 replays as it always did.
  [
    `roam/${ROAM_V2_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new RoamV2(level) : new RoamV2(level, creature),
  ],
  // v3: the weapon does something. A sword kills, a wand freezes.
  [
    `roam/${ROAM_V3_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new RoamV3(level) : new RoamV3(level, creature),
  ],
  // v4: enemies slower than every build, so no creature is trapped once seen.
  [
    `roam/${ROAM_V4_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new RoamV4(level) : new RoamV4(level, creature),
  ],
  // v5: treasure is picked up by going to it, not by being a sword's length away.
  [
    `roam/${ROAM_V5_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new RoamV5(level) : new RoamV5(level, creature),
  ],
  // From the side, one screen, everything falls.
  [
    `dash/${DASH_V1_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new DashV1(level) : new DashV1(level, creature),
  ],
  // v2: everybody can climb a step. In v1 a creature with no strength could
  // not, which made a whole build a trap.
  [
    `dash/${DASH_V2_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new DashV2(level) : new DashV2(level, creature),
  ],
  // v3: the weapon works from the side too. Swing OR stomp.
  [
    `dash/${DASH_V3_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new DashV3(level) : new DashV3(level, creature),
  ],

  // v4: treasure is picked up by going to it, not from a platform away.
  [
    `dash/${DASH_V4_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new DashV4(level) : new DashV4(level, creature),
  ],
  // v5: grabbing a ladder puts you on it, centred. A body is wider than the
  // gap a ladder comes up through, so until now you had to be within 32
  // subcells of the column to climb at all. See docs/adr/0031.
  [
    `dash/${DASH_V5_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new DashV5(level) : new DashV5(level, creature),
  ],
  // v6, both games: a hazard that does not move. Fire below ground, spikes
  // above it -- one entity, one tile index, two ways of drawing it. It costs a
  // heart and nothing puts it out. See docs/adr/0034.
  [
    `roam/${ROAM_V6_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new RoamV6(level) : new RoamV6(level, creature),
  ],
  // v7: a chasing enemy moves one direction at a time, the way a thumb does.
  // Up to v6 it applied both axes in a tick and cut diagonals at 1.41x the
  // speed anything else in the game could manage.
  [
    `roam/${ROAM_V7_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new RoamV7(level) : new RoamV7(level, creature),
  ],
  [
    `dash/${DASH_V6_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new DashV6(level) : new DashV6(level, creature),
  ],
  // v7: the enemies move. In dash/1 through dash/6 not one of them ever did --
  // they were placed 32 subcells above the floor they were standing on, so the
  // test that stops them walking off a ledge read their own empty cell and
  // turned them round on every tick. Reported as "the lizard enemy doesn't
  // move"; it was every enemy, in every side-on level, always.
  [
    `dash/${DASH_V7_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new DashV7(level) : new DashV7(level, creature),
  ],
  // v8, from above only: a bucket of water, and fire goes out. Asked for by the
  // child this is built for. Fire is a route problem; a route problem with no
  // answer but "go the long way" is a wall. Water makes it a price instead --
  // every fire can be put out, and putting one out costs you the clock.
  [
    `roam/${ROAM_V8_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new RoamV8(level) : new RoamV8(level, creature),
  ],
  // The third game. Underwater, from the side, and nothing in it falls: free
  // movement with momentum. v1 and v2 also give you a breath you have to go up
  // for; v3 takes it back out again. See adr/0038 and adr/0042.
  [
    `swim/${SWIM_V1_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new SwimV1(level) : new SwimV1(level, creature),
  ],
  // v2: the water goes somewhere. Currents are what give STRENGTH a job
  // underwater -- and they invert the obvious, because the slowest creature in
  // the game is the fastest one through a current. See docs/adr/0039.
  [
    `swim/${SWIM_V2_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new SwimV2(level) : new SwimV2(level, creature),
  ],
  // A place rather than a level. Nothing to win, nothing to lose, no clock and
  // no cap -- and so no share gate either, because there is nothing to beat.
  // Flowers to pick, bunnies to play with, ponds to walk round. See adr/0040.
  [
    `calm/${CALM_V1_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new CalmV1(level) : new CalmV1(level, creature),
  ],
  // v3: no air. You do not drown; you just swim. The clock that took a heart
  // for taking your time is gone, and the momentum and the currents that made
  // the water worth building are untouched. v2 is still here and still drowns
  // you, because every reef link already sent pins it. See docs/adr/0042.
  [
    `swim/${SWIM_V3_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new SwimV3(level) : new SwimV3(level, creature),
  ],
  // v8: an enemy in mid-air falls. Up to v7 it read both directions as a ledge
  // and flipped its facing on the spot, thirty times a second, for ever --
  // reported as "the enemies are not moving on the side app". See adr/0043.
  [
    `dash/${DASH_V8_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new DashV8(level) : new DashV8(level, creature),
  ],
  // calm/2: the garden stops being a place and becomes a level. An exit, a
  // bear that hunts you, a sword to answer it -- and bunnies and squirrels
  // that do neither. calm/1 is still a place and always will be. adr/0045.
  [
    `calm/${CALM_V2_BEHAVIOUR}`,
    (level, creature) =>
      creature === undefined ? new CalmV2(level) : new CalmV2(level, creature),
  ],
]);

export function knownBuilds(): string[] {
  return [...BUILDS.keys()];
}

/**
 * The newest behaviour version shipped for an engine, or 0 if it has none.
 *
 * Anything that AUTHORS a level should ask this rather than carry its own
 * table. The level editor used to hold a hardcoded `behaviour: 2` for the
 * side-on game; dash/3 shipped, the table was not bumped, and every level
 * drawn after that was still made under the old rules -- which meant the sword
 * a child had just been given did not work in the levels they made with it.
 *
 * Reading it from the registry means adding a build is the only step there is.
 */
export function newestBehaviour(engine: string): number {
  let newest = 0;
  for (const key of BUILDS.keys()) {
    const cut = key.lastIndexOf("/");
    if (key.slice(0, cut) !== engine) continue;
    const version = Number.parseInt(key.slice(cut + 1), 10);
    if (Number.isFinite(version) && version > newest) newest = version;
  }
  return newest;
}

/** The engine build a level pins, or a refusal that names what is on offer. */
export function engineFor(level: Level, creature?: Creature): Engine {
  const key = `${level.engine}/${level.behaviourVersion}`;
  const build = BUILDS.get(key);
  if (build === undefined) {
    throw new UnknownBehaviourError(
      `no engine build for "${key}" -- this link needs a newer hoppa. ` +
        `this build has: ${knownBuilds().join(", ")}`,
    );
  }
  return build(level, creature);
}
