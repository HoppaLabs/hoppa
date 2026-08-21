// What is wrong with this level, in words a nine-year-old can act on.
//
// verify.ts answers the same question for a grown-up at a terminal: L1..L5,
// cell coordinates, cycle periods. That is the right output for `hoppa verify`
// and the wrong output for a kid holding a phone, so this is a second reading
// of the same facts rather than a second set of checks.
//
// These are ADVICE, not a guarantee. Reachability here is a flood fill: it
// knows about walls and knows nothing about jumping, so it cannot tell a
// side-on player that a gap is too wide. The share gate is what actually stops
// an impossible level travelling -- you cannot send a level you have not
// beaten -- and this is here to save a kid the wasted attempt, not to replace
// it. See docs/adr/0013.

import { GRID_W, idx } from "./grid.ts";
import { encodeLevel } from "./codec.ts";
import { parseLevel, type Level } from "./level.ts";
import { verifyLevelText } from "./verify.ts";
import { reachableFrom } from "./reach.ts";
import { bestStepUp, landingFrom, reachableWithGravity, typicalStepUp } from "./playable.ts";
import { aPlace, sideOn } from "./draft.ts";

/** Above this a link starts getting awkward in a group chat. Spec S13's L7. */
export const CODE_WARN = 150;

export interface Note {
  /** false when this stops the level being playable at all. */
  readonly fatal: boolean;
  readonly text: string;
}

export interface Advice {
  /** True when nothing is stopping this level being played. */
  readonly playable: boolean;
  readonly notes: readonly Note[];
  /** Length of the share code, or -1 when the level does not encode. */
  readonly codeLength: number;
}

function at(cell: number): string {
  return `${(cell % GRID_W) | 0} across, ${((cell / GRID_W) | 0) | 0} down`;
}

/**
 * Read a level and say what a kid should do about it.
 *
 * Order matters: the first note is the one shown when there is only room for
 * one, so the thing that stops the level working comes before the thing that
 * makes it awkward.
 */
export function adviceFor(text: string): Advice {
  const result = verifyLevelText(text);
  const notes: Note[] = [];

  if (result.level === null) {
    return {
      playable: false,
      notes: [{ fatal: true, text: "something is wrong with this level" }],
      codeLength: -1,
    };
  }

  const byId = new Map<string, (typeof result.checks)[number]>();
  for (const check of result.checks) byId.set(check.id, check);

  /**
   * A place, not a level. Every note below about the DOOR is wrong in one.
   *
   * A garden has no exit by design -- adr/0040 -- so L2 fails on every garden
   * ever drawn, and the advice read "there is no way out -- put a door
   * somewhere". Fatal, so it also switched off the play button: a child could
   * not play their own garden, and the door it told them to add is not in the
   * palette to add. Three checks have to sit this one out.
   */
  const place = aPlace(result.level.engine);

  const l2 = byId.get("L2");
  if (!place && l2 !== undefined && l2.ok === false) {
    notes.push({ fatal: true, text: "there is no way out -- put a door somewhere" });
  }

  const l3 = byId.get("L3");
  if (!place && l3 !== undefined && l3.ok === false) {
    notes.push({ fatal: true, text: "you cannot get from the start to the door -- there is a wall in the way" });
  }

  // Fire never blocks a route -- you can walk through it and lose a heart, the
  // same way a guard makes a route expensive rather than impossible. But "the
  // only way through is on fire" is worth saying out loud, because it is the
  // difference between a level that is hard and one that a creature with two
  // hearts cannot finish.
  if (!place && result.level.fireCells.length > 0 && l3 !== undefined && l3.ok) {
    const dry = reachableFrom(result.level, result.level.startX, result.level.startY, true);
    const exitCell = idx(result.level.exitX, result.level.exitY);
    const trappedExit = result.level.exitX >= 0 && dry[exitCell] !== 1;
    let trappedTreasure = 0;
    for (let i = 0; i < result.level.treasureCells.length; i = (i + 1) | 0) {
      if (dry[result.level.treasureCells[i] as number] !== 1) trappedTreasure++;
    }
    if (trappedExit) {
      notes.push({
        fatal: false,
        text: "the only way to the door is through the fire -- that costs a heart every time",
      });
    } else if (trappedTreasure > 0) {
      notes.push({
        fatal: false,
        text:
          trappedTreasure === 1
            ? "one treasure can only be reached through the fire"
            : `${trappedTreasure} treasure can only be reached through the fire`,
      });
    }
  }

  const walled = result.strandedTreasure.length;
  if (walled > 0) {
    // Fatal, not a warning: the door only opens once every treasure is picked
    // up, so one unreachable gem means nobody finishes -- including whoever
    // drew it, which the share gate would eventually tell them anyway.
    //
    // In a place it is worth saying and NOT fatal, because nothing waits on
    // picking them all. A flower behind a hedge is a shame, not a dead end.
    notes.push({
      fatal: !place,
      text: place
        ? walled === 1
          ? `one flower is behind a hedge (${at(result.strandedTreasure[0] as number)}) -- nobody can reach it`
          : `${walled} flowers are behind hedges -- nobody can reach them`
        : walled === 1
          ? `one treasure is walled off (${at(result.strandedTreasure[0] as number)}), so the door can never open`
          : `${walled} treasures are walled off, so the door can never open`,
    });
  }

  const l5 = byId.get("L5");
  if (l5 !== undefined && l5.ok === false) {
    notes.push({
      fatal: false,
      text: "a guard has too long a corridor to march up and down -- shorten it to five squares or fewer",
    });
  }

  // Gravity. From above, "connected through open space" is the whole story;
  // from the side it is not, and a flood fill will happily promise you a ledge
  // nobody can jump to. Only side-on levels get this, because it is the only
  // place the question is different.
  if (sideOn(result.level.engine)) {
    for (const note of jumpNotes(result.level)) notes.push(note);
  }

  let codeLength = -1;
  try {
    codeLength = encodeLevel(parseLevel(text)).length;
  } catch {
    notes.push({ fatal: true, text: "this level will not fit in a link" });
  }
  if (codeLength > CODE_WARN) {
    notes.push({ fatal: false, text: "the link for this level is getting long, but it will still work" });
  }

  const fatal = notes.some((n) => n.fatal);
  return { playable: !fatal, notes, codeLength };
}

/** What is out of reach once you have to jump to it rather than walk. */
function jumpNotes(level: Level): Note[] {
  const notes: Note[] = [];
  const start = landingFrom(level, level.startX, level.startY);

  // Judged by the rules THIS level pins, not by the newest ones: a level drawn
  // under dash/1 still has dash/1's weaker jump when somebody opens the link.
  const version = level.behaviourVersion | 0;
  const best = reachableWithGravity(level, start.x, start.y, bestStepUp(version));
  const typical = reachableWithGravity(level, start.x, start.y, typicalStepUp(version));

  const targets: Array<{ cell: number; what: string }> = [];
  if (level.exitX >= 0) targets.push({ cell: idx(level.exitX, level.exitY), what: "door" });
  for (let i = 0; i < level.treasureCells.length; i = (i + 1) | 0) {
    targets.push({ cell: level.treasureCells[i] as number, what: "treasure" });
  }

  const unreachable = targets.filter((t) => best[t.cell] !== 1);
  const hardOnly = targets.filter((t) => best[t.cell] === 1 && typical[t.cell] !== 1);

  // Nobody can get there, however they are built. The level cannot be finished.
  if (unreachable.some((t) => t.what === "door")) {
    notes.push({
      fatal: true,
      text: "nothing can jump up to the door -- add a ladder, or a step to climb on",
    });
  }
  const gems = unreachable.filter((t) => t.what === "treasure").length;
  if (gems > 0) {
    notes.push({
      fatal: true,
      text:
        gems === 1
          ? "one treasure is too high to jump to, so the door can never open"
          : `${gems} treasures are too high to jump to, so the door can never open`,
    });
  }

  // Reachable, but only by a strong creature. Worth saying, not worth blocking:
  // a level that rewards being built one way is the whole point of sending it
  // to a friend who is built the other.
  if (unreachable.length === 0 && hardOnly.length > 0) {
    notes.push({
      fatal: false,
      text: "only a strong character will get up there -- a fast one will not make the jump",
    });
  }

  return notes;
}

/** One line for the editor's status strip. Empty when there is nothing to say. */
export function headline(advice: Advice): string {
  const first = advice.notes[0];
  return first === undefined ? "" : first.text;
}
