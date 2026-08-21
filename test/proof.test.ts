import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { DAY7_LEVEL_TEXT, ROAM3_LEVEL_TEXT } from "../src/core/fixtures.ts";
import { engineFor } from "../src/engines/registry.ts";
import { creatureFromCaps, creatureFromBuild, type Build } from "../src/core/creature.ts";
import { starterSprite } from "../src/core/sprite.ts";
import { hashHex } from "../src/core/hash.ts";
import {
  Recorder, beats, logLength, looksLikeLog, proofKey, replay, type Replayable,
} from "../src/core/proof.ts";
import {
  HELD_ACT, HELD_RIGHT, HELD_UP, STATUS_PLAYING, STATUS_WON,
} from "../src/engines/types.ts";

// The day 7 golden vector: a log already committed as one that WINS. If the
// proof cannot confirm a run the project has treated as sacred for a week,
// there is no point in it.
const V5_PELL = creatureFromCaps("01J8XK8W6Y5N", "Pell", { GUARD: 204, REACH: 204 });
const PELL_WIN = "RRRRRRRRRDDDDLLLDDDDLLLLRRRRRRRRRRRRRRRRRRUUUDDDLLLDDDLLLRRRRRRR";
const MOVES: Record<string, number> = { U: 1, R: 2, D: 3, L: 4, ".": 0 };
const day7 = parseLevel(DAY7_LEVEL_TEXT);
const makeDelve = (creature = V5_PELL) => () =>
  engineFor(day7, creature) as unknown as Replayable;

function record(moves: string): number[] {
  const rec = new Recorder();
  for (const ch of moves) rec.push(MOVES[ch] as number);
  return [...rec.log()];
}

// --- it recognises a real win ----------------------------------------------------

test("a log that is known to win is confirmed as winning", () => {
  const log = record(PELL_WIN);
  expect(logLength(log)).toBe(PELL_WIN.length);
  const out = replay(log, makeDelve());
  expect(out.status).toBe(STATUS_WON);
  expect(hashHex(out.hash)).toBe("7664df23"); // the committed golden hash
  expect(beats(log, makeDelve(), STATUS_WON)).toBe(true);
});

test("the same log replays to the same place every time", () => {
  const log = record(PELL_WIN);
  const hashes = [0, 1, 2].map(() => hashHex(replay(log, makeDelve()).hash));
  expect(new Set(hashes).size).toBe(1);
});

// --- it refuses everything that is not a real win -----------------------------------

test("a truncated log does not win", () => {
  const short = record(PELL_WIN.slice(0, PELL_WIN.length - 4));
  expect(beats(short, makeDelve(), STATUS_WON)).toBe(false);
});

test("the gate says yes only when the log really does win", () => {
  // The contract is not "this is the exact log I recorded" -- a different
  // route that also wins is still proof the level can be finished, which is
  // the only thing the gate exists to establish. So: for every edited log,
  // beats() must agree exactly with what a replay actually does.
  let broke = 0;
  let stillWon = 0;
  for (let i = 0; i < PELL_WIN.length; i++) {
    for (const move of "UDLR") {
      if (PELL_WIN[i] === move) continue;
      const log = record(`${PELL_WIN.slice(0, i)}${move}${PELL_WIN.slice(i + 1)}`);
      const said = beats(log, makeDelve(), STATUS_WON);
      const truth = replay(log, makeDelve()).status === STATUS_WON;
      expect(said).toBe(truth);
      if (truth) stillWon++; else broke++;
    }
  }
  console.log(`\n  single-move edits: ${broke} broke the run, ${stillWon} still won`);
  // Changing a move usually ruins it -- otherwise the log would be proving
  // nothing -- but the ones that survive are real wins, not false passes.
  expect(broke).toBeGreaterThan(stillWon * 4);
});

test("an empty log does not win, and neither does rubbish", () => {
  expect(beats([], makeDelve(), STATUS_WON)).toBe(false);
  expect(beats([2], makeDelve(), STATUS_WON)).toBe(false);        // odd length
  expect(beats([2, 0], makeDelve(), STATUS_WON)).toBe(false);      // zero count
  expect(beats([2, -3], makeDelve(), STATUS_WON)).toBe(false);     // negative count
  expect(looksLikeLog([2, 1.5])).toBe(false);
  expect(looksLikeLog([2, 3, 4, 1])).toBe(true);
});

test("somebody else's creature does not inherit your win", () => {
  // Pell's route, walked by a creature built differently. The gate is per
  // creature because the run is per creature.
  const weak = creatureFromBuild("other", "Other", "@", { FORCE: 5, HASTE: 1 } as Build, starterSprite());
  expect(beats(record(PELL_WIN), makeDelve(weak), STATUS_WON)).toBe(false);
});

test("a win on one level does not carry to another", () => {
  const elsewhere = parseLevel(ROAM3_LEVEL_TEXT);
  const make = () => engineFor(elsewhere, V5_PELL) as unknown as Replayable;
  expect(beats(record(PELL_WIN), make, STATUS_WON)).toBe(false);
});

// --- the run-length encoding -------------------------------------------------------

test("holding a button is one entry, however long you hold it", () => {
  const rec = new Recorder();
  for (let i = 0; i < 400; i++) rec.push(HELD_RIGHT);
  for (let i = 0; i < 90; i++) rec.push(HELD_RIGHT | HELD_ACT);
  for (let i = 0; i < 200; i++) rec.push(HELD_UP);
  const log = rec.log();
  expect(rec.length()).toBe(690);
  expect(logLength(log)).toBe(690);
  expect(log.length).toBe(6); // three runs, two numbers each
});

test("a real-time run records and replays exactly", () => {
  const level = parseLevel(ROAM3_LEVEL_TEXT);
  const creature = creatureFromBuild("me", "Me", "@", { FORCE: 3, HASTE: 3 } as Build, starterSprite());
  const live = engineFor(level, creature) as unknown as Replayable;

  const rec = new Recorder();
  let status: number = STATUS_PLAYING;
  for (let t = 0; t < 600 && status === STATUS_PLAYING; t++) {
    const held = (t % 5 === 0 ? HELD_ACT : 0) | (t % 160 < 80 ? HELD_RIGHT : HELD_UP);
    rec.push(held);
    status = live.step(held);
  }

  const out = replay(rec.log(), () => engineFor(level, creature) as unknown as Replayable);
  expect(out.status).toBe(status);
  expect(hashHex(out.hash)).toBe(hashHex(live.stateHash()));
  expect(out.ticks).toBe(rec.length());
});

// --- the key that ties a proof to what it proves --------------------------------------

test("a proof is tied to its level, its creature and its log", () => {
  const log = record(PELL_WIN);
  const base = proofKey("levelcode", "creature", log);
  expect(proofKey("levelcode", "creature", log)).toBe(base);
  expect(proofKey("LEVELCODE", "creature", log)).not.toBe(base);
  expect(proofKey("levelcode", "other", log)).not.toBe(base);
  expect(proofKey("levelcode", "creature", record(PELL_WIN.slice(0, 20)))).not.toBe(base);
});
