// Level validation -- spec S13's L1-L5. L6-L8 are codec checks and arrive with
// share links on day 5.
//
// Parsing (level.ts) answers "is this the right shape". This answers "is this
// worth playing". Keeping them apart is what lets an exit-less day 1 level parse
// while still failing verification, and it puts the failures where a kid using
// the editor on day 10 can be shown them one at a time.

import { GRID_AREA, GRID_H, GRID_W, idx } from "./grid.ts";
import { LevelParseError, parseLevel, type Level } from "./level.ts";
import { patrolsFor, MAX_PERIOD, MAX_RUN } from "./patrol.ts";
import { reachableFrom } from "./reach.ts";

/** Engine bitmask width. A ninth treasure has no bit to live in. */
export const MAX_TREASURE = 8;

/** Engines whose enemies derive a patrol from the corridor they stand in. */
const CORRIDOR_PATROL_ENGINES: readonly string[] = ["delve", "roam"];

export function usesCorridorPatrols(engine: string): boolean {
  return CORRIDOR_PATROL_ENGINES.includes(engine);
}

export interface Check {
  readonly id: string;
  readonly title: string;
  /** null when an earlier failure means this could not be judged. */
  readonly ok: boolean | null;
  readonly detail: string;
}

export interface VerifyResult {
  readonly level: Level | null;
  readonly checks: readonly Check[];
  readonly ok: boolean;
  /** Open cells the start can actually walk to. Handy when L3 or L4 fails. */
  readonly reachableCells: number;
  /** Treasure cells the start cannot walk to. Empty when L4 passes. */
  readonly strandedTreasure: readonly number[];
}

function skipped(id: string, title: string): Check {
  return { id, title, ok: null, detail: "not run -- the level did not parse" };
}

export function verifyLevelText(text: string): VerifyResult {
  let level: Level;
  try {
    level = parseLevel(text);
  } catch (err) {
    if (!(err instanceof LevelParseError)) throw err;
    return {
      level: null,
      checks: [
        { id: "L1", title: "parses; 24x14; known glyphs only", ok: false, detail: err.message },
        skipped("L2", "exactly one start and one exit"),
        skipped("L3", "exit reachable from start"),
        skipped("L4", "every treasure reachable"),
        skipped("L5", "at most 8 treasures; all cycle periods <= 8"),
      ],
      ok: false,
      reachableCells: 0,
      strandedTreasure: [],
    };
  }

  const checks: Check[] = [
    {
      id: "L1",
      title: "parses; 24x14; known glyphs only",
      ok: true,
      detail: `${GRID_W}x${GRID_H}, schema ${level.schema}, ${level.engine} behaviour=${level.behaviourVersion}`,
    },
  ];

  // L2. The parser already refuses a second start or exit, so what is left to
  // check is that an exit exists at all.
  const hasExit = level.exitX >= 0;
  checks.push({
    id: "L2",
    title: "exactly one start and one exit",
    ok: hasExit,
    detail: hasExit
      ? `start (${level.startX},${level.startY}), exit (${level.exitX},${level.exitY})`
      : `start (${level.startX},${level.startY}), no exit glyph ">" -- nothing to reach`,
  });

  const seen = reachableFrom(level, level.startX, level.startY);

  const exitReachable = hasExit && seen[idx(level.exitX, level.exitY)] === 1;
  checks.push({
    id: "L3",
    title: "exit reachable from start",
    ok: hasExit ? exitReachable : null,
    detail: !hasExit
      ? "not run -- no exit"
      : exitReachable
        ? "the exit is on the same open region as the start"
        : `exit (${level.exitX},${level.exitY}) is walled off from the start`,
  });

  const strandedTreasure: number[] = [];
  const stranded: string[] = [];
  for (let i = 0; i < level.treasureCells.length; i = (i + 1) | 0) {
    const cell = level.treasureCells[i] as number;
    if (seen[cell] !== 1) {
      strandedTreasure.push(cell);
      stranded.push(`(${cell % GRID_W},${(cell / GRID_W) | 0})`);
    }
  }
  const count = level.treasureCells.length;
  checks.push({
    id: "L4",
    title: "every treasure reachable",
    ok: stranded.length === 0,
    detail:
      stranded.length === 0
        ? `${count} treasure, all reachable`
        : `walled off: ${stranded.join(" ")}`,
  });

  // L5 has two halves: the treasure mask, and spec S8's cap on how long a
  // moving part's cycle may be.
  //
  // The second half only means anything for engines whose enemies patrol the
  // CORRIDOR they stand in, derived from geometry. A side-on engine's enemies
  // walk the floor they are on and turn at a wall or a ledge, so measuring them
  // as corridors reports a 22-cell "patrol" across a platform and fails a
  // perfectly good level. The cap exists to bound a turn-based solver's state
  // space (spec S8); there is no such solver down there.
  const patrols = usesCorridorPatrols(level.engine) ? patrolsFor(level) : [];
  const tooLong: string[] = [];
  for (let i = 0; i < patrols.length; i = (i + 1) | 0) {
    const patrol = patrols[i] as (typeof patrols)[number];
    if (patrol.period > MAX_PERIOD) {
      const gx = (patrol.home % GRID_W) | 0;
      const gy = ((patrol.home / GRID_W) | 0) | 0;
      tooLong.push(`(${gx},${gy}) run of ${patrol.length}, period ${patrol.period}`);
    }
  }

  const treasureOk = count <= MAX_TREASURE;
  const patrolsOk = tooLong.length === 0;
  checks.push({
    id: "L5",
    title: "at most 8 treasures; all cycle periods <= 8",
    ok: treasureOk && patrolsOk,
    detail: !treasureOk
      ? `${count} treasures -- the collected mask only has ${MAX_TREASURE} bits`
      : !patrolsOk
        ? `guard corridors longer than ${MAX_RUN} cells: ${tooLong.join("; ")}`
        : patrols.length === 0
          ? `${count} of ${MAX_TREASURE} treasure; ${level.engine} enemies do not patrol corridors`
          : `${count} of ${MAX_TREASURE} treasure, ${patrols.length} guard, ` +
            `longest patrol period ${patrols.reduce((m, p) => (p.period > m ? p.period : m), 0)}`,
  });

  let reachableCells = 0;
  for (let i = 0; i < GRID_AREA; i = (i + 1) | 0) {
    if (seen[i] === 1) reachableCells = (reachableCells + 1) | 0;
  }

  return {
    level,
    checks,
    ok: checks.every((c) => c.ok !== false),
    reachableCells,
    strandedTreasure,
  };
}
