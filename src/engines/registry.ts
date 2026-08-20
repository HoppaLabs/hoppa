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
import { DashV1, DASH_V1_BEHAVIOUR } from "./dash/v1.ts";
import { DashV2, DASH_V2_BEHAVIOUR } from "./dash/v2.ts";
import { DashV3, DASH_V3_BEHAVIOUR } from "./dash/v3.ts";
import { DashV4, DASH_V4_BEHAVIOUR } from "./dash/v4.ts";
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
