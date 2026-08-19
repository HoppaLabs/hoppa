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
]);

export function knownBuilds(): string[] {
  return [...BUILDS.keys()];
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
