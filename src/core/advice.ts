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

import { GRID_W } from "./grid.ts";
import { encodeLevel } from "./codec.ts";
import { parseLevel } from "./level.ts";
import { verifyLevelText } from "./verify.ts";

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

  const l2 = byId.get("L2");
  if (l2 !== undefined && l2.ok === false) {
    notes.push({ fatal: true, text: "there is no way out -- put a door somewhere" });
  }

  const l3 = byId.get("L3");
  if (l3 !== undefined && l3.ok === false) {
    notes.push({ fatal: true, text: "you cannot get from the start to the door -- there is a wall in the way" });
  }

  const walled = result.strandedTreasure.length;
  if (walled > 0) {
    // Fatal, not a warning: the door only opens once every treasure is picked
    // up, so one unreachable gem means nobody finishes -- including whoever
    // drew it, which the share gate would eventually tell them anyway.
    notes.push({
      fatal: true,
      text:
        walled === 1
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

/** One line for the editor's status strip. Empty when there is nothing to say. */
export function headline(advice: Advice): string {
  const first = advice.notes[0];
  return first === undefined ? "" : first.text;
}
