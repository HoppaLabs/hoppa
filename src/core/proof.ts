// Proof that you actually beat it.
//
// Spec S12: "beat your own level -> input log verified locally -> only then
// does the site produce a link". Until now the share button appeared when the
// page believed you had won, which is not the same thing as having won.
//
// The check is: keep every input you gave, then replay them into a FRESH
// engine and see whether that engine also wins and lands on the same
// stateHash. If it does, the level is beatable, because something just beat
// it. That is the whole point of the gate -- nobody receives a level nobody
// has finished -- and it comes almost free from deterministic replay.
//
// The proof is enforced sender-side and NEVER travels. Spec S10's budget has
// no room for it, and it does not need to: the sender is the one being stopped
// from sending rubbish, and a receiver who wants to know it is beatable can
// see that somebody beat it.
//
// Turn-based and real-time engines both work here. One takes a move per press
// and the other a held-button mask per tick, but a log is a list of whatever
// was handed to step(), in order, either way.

import { hashInit, hashInt32 } from "./hash.ts";

/** Anything a log can be replayed into. */
export interface Replayable {
  step(input: number): number;
  stateHash(): number;
  currentStatus(): number;
}

/**
 * Inputs, run-length encoded as [value, count, value, count, ...].
 *
 * Runs are long in practice -- holding right for a second is thirty identical
 * ticks -- so this is a few dozen numbers for a run that took two minutes.
 */
export type Log = readonly number[];

export class Recorder {
  private readonly runs: number[] = [];
  private count = 0;

  /** One input, exactly as it was handed to the engine. */
  push(input: number): void {
    const value = input | 0;
    const at = this.runs.length;
    if (at >= 2 && this.runs[at - 2] === value) {
      this.runs[at - 1] = ((this.runs[at - 1] as number) + 1) | 0;
    } else {
      this.runs.push(value, 1);
    }
    this.count = (this.count + 1) | 0;
  }

  /** How many inputs are recorded. */
  length(): number {
    return this.count;
  }

  log(): Log {
    return this.runs.slice();
  }
}

/** How many inputs a log holds. */
export function logLength(log: Log): number {
  let n = 0;
  for (let i = 1; i < log.length; i = (i + 2) | 0) n = (n + (log[i] as number)) | 0;
  return n;
}

/** A log is pairs of (value, count) with every count at least one. */
export function looksLikeLog(log: Log): boolean {
  if (log.length % 2 !== 0) return false;
  for (let i = 1; i < log.length; i = (i + 2) | 0) {
    const count = log[i] as number;
    if (!Number.isInteger(count) || count < 1) return false;
  }
  for (let i = 0; i < log.length; i = (i + 2) | 0) {
    if (!Number.isInteger(log[i] as number)) return false;
  }
  return true;
}

export interface Replayed {
  readonly status: number;
  readonly hash: number;
  /** Inputs actually fed in. Short of the log's length if the run ended early. */
  readonly ticks: number;
}

/**
 * Feed a log into a fresh engine and report where it ends up.
 *
 * `make` builds the engine, so this stays out of the engine registry's way and
 * core keeps knowing nothing about engines.
 */
export function replay(log: Log, make: () => Replayable): Replayed {
  const engine = make();
  let ticks = 0;
  let status = engine.currentStatus();

  for (let i = 0; i < log.length; i = (i + 2) | 0) {
    const value = log[i] as number;
    const count = log[i + 1] as number;
    for (let n = 0; n < count; n = (n + 1) | 0) {
      status = engine.step(value) | 0;
      ticks = (ticks + 1) | 0;
      // Past the end of the run there is nothing left to prove.
      if (status !== 0) return { status, hash: engine.stateHash() | 0, ticks };
    }
  }
  return { status, hash: engine.stateHash() | 0, ticks };
}

/**
 * Does this log really beat this level with this creature?
 *
 * `won` is the engine's winning status. Passing it in rather than importing it
 * keeps this file free of the engine vocabulary.
 */
export function beats(log: Log, make: () => Replayable, won: number): boolean {
  if (!looksLikeLog(log) || log.length === 0) return false;
  return replay(log, make).status === (won | 0);
}

/**
 * A short fingerprint of level + creature + log, so a stored proof cannot be
 * quietly reused for a different level or a different creature.
 *
 * Not a security measure -- these are kids on holiday, not an adversarial
 * ladder -- but it stops the honest mistakes: switching creature, editing the
 * level, and still holding a "you beat this" from before.
 */
export function proofKey(levelCode: string, creatureId: string, log: Log): number {
  let h = hashInit();
  for (let i = 0; i < levelCode.length; i = (i + 1) | 0) h = hashInt32(h, levelCode.charCodeAt(i));
  h = hashInt32(h, 0x5f);
  for (let i = 0; i < creatureId.length; i = (i + 1) | 0) h = hashInt32(h, creatureId.charCodeAt(i));
  h = hashInt32(h, 0x5f);
  for (let i = 0; i < log.length; i = (i + 1) | 0) h = hashInt32(h, log[i] as number);
  return h | 0;
}
