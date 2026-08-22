// The world flinching when something lands.
//
// "Overall playing the games doesn't feel as natural as Mario or Zelda why?"
//
// Because among other things nothing reacts to you. Zelda's feel is not its
// physics, it is the two or three frames where EVERYTHING STOPS on a sword
// connecting. A hit with no pause reads as the enemy politely agreeing to move.
//
// THE PROPERTY THAT MAKES THIS FREE, and the one worth a test: a hoppa run is a
// LIST OF INPUTS, one per tick, and the page decides when a tick happens. Wall-
// clock time never crosses into the engine (src/core/clock.ts). Holding the
// clock still for a few frames means the log has fewer entries; replaying that
// log reproduces the same states, because a replay has no idea how long anybody
// waited between two ticks. No engine is touched and no build moves.

import { expect, test } from "bun:test";
import { HOLD_FRAMES, Hitstop, OncePerTick, impactsOf } from "../src/web/play/hitstop.ts";
import { Recorder, replay, type Replayable } from "../src/core/proof.ts";
import { parseLevel } from "../src/core/level.ts";
import { engineFor } from "../src/engines/registry.ts";
import { PRESETS } from "../src/core/creature.ts";
import { GRID_H, GRID_W } from "../src/core/grid.ts";
import { HELD_ACT, HELD_NONE, HELD_RIGHT } from "../src/engines/types.ts";
import { newestBuild } from "../src/core/builds.ts";


/**
 * A hold has to END, and this is how that is checked without a test that can
 * hang.
 *
 * It was `while (stop.holding())`, which is the obvious way to write it and
 * wrong: the mutation that proves the hold runs out -- frame() stops
 * decrementing -- turns every one of those loops into an infinite one. The
 * mutation runner has no timeout, so three orphaned `bun test` processes sat
 * pinning a core each until somebody noticed the machine was slow.
 *
 * Bounded, and the bound is asserted: running out of ceiling is a failure, not
 * a quiet exit.
 */
const CEILING = 240;

function drain(stop: Hitstop): number {
  let frames = 0;
  while (stop.holding()) {
    stop.frame();
    frames = (frames + 1) | 0;
    if (frames > CEILING) throw new Error("the hold never ended");
  }
  return frames;
}

const NOTHING = { killed: false, froze: false, smashed: false, hpBefore: 3, hpNow: 3, playing: true };

test("nothing landing holds nothing", () => {
  expect(impactsOf(NOTHING)).toEqual([]);
  expect(new Hitstop().holding()).toBe(false);
});

test("a kill stops the world for longer than a freeze", () => {
  // Ordered by how final the thing is. Killing something is the biggest event
  // in the game; freezing is the shortest, because the thing is still there
  // and the run has not really turned.
  expect(HOLD_FRAMES.kill).toBeGreaterThan(HOLD_FRAMES.hurt);
  expect(HOLD_FRAMES.hurt).toBeGreaterThan(HOLD_FRAMES.freeze);
  // ...and every one of them is SHORT. Past about eight frames a stop reads as
  // a dropped frame, which is the opposite of impact.
  for (const frames of Object.values(HOLD_FRAMES)) {
    expect(frames).toBeGreaterThan(0);
    expect(frames).toBeLessThanOrEqual(8);
  }
});

test("taking a hit counts, but not the hit that ends the run", () => {
  expect(impactsOf({ ...NOTHING, hpNow: 2 })).toEqual(["hurt"]);
  // The last hit and the loss are one moment; stopping the world twice for it
  // reads as a stutter rather than as a blow.
  expect(impactsOf({ ...NOTHING, hpNow: 0, playing: false })).toEqual([]);
});

test("two things landing at once feel like the bigger of the two", () => {
  const stop = new Hitstop();
  stop.bite(impactsOf({ ...NOTHING, killed: true, froze: true, hpNow: 2 }));
  const frames = drain(stop);
  expect(frames).toBe(HOLD_FRAMES.kill);
});

test("...and a small one never cuts a big one short", () => {
  const stop = new Hitstop();
  stop.bite(["kill"]);
  stop.frame();
  stop.bite(["freeze"]);
  expect(drain(stop) + 1).toBe(HOLD_FRAMES.kill);
});

test("the hold runs out on its own, and a new run is not mid-flinch", () => {
  const stop = new Hitstop();
  stop.bite(["kill"]);
  expect(stop.holding()).toBe(true);
  stop.forget();
  expect(stop.holding()).toBe(false);
  expect(stop.shake()).toBe(0);
});

test("the shake is whole pixels, and it alternates", () => {
  // This game draws pixel art at integer scale. A shake on a fraction of a
  // pixel is a blur, which is the one thing the renderer has fought hardest
  // against.
  const stop = new Hitstop();
  stop.bite(["kill"]);
  const seen: number[] = [];
  for (let i = 0; i < CEILING && stop.holding(); i = (i + 1) | 0) {
    seen.push(stop.shake());
    stop.frame();
  }
  expect(seen).toHaveLength(HOLD_FRAMES.kill);
  // Two pixels for a kill: at integer scale one pixel is the smallest shake
  // there is, and on a phone it is nearly invisible.
  for (const shove of seen) expect([2, -2]).toContain(shove);
  // Both directions, or it is a nudge rather than a shake.
  expect(new Set(seen).size).toBe(2);

  // ...and one pixel for the things that do not end anything.
  const softer = new Hitstop();
  softer.bite(["hurt"]);
  expect(Math.abs(softer.shake())).toBe(1);
});

test("a log recorded through a hold still replays, which is the whole point", () => {
  // The property that makes this cost nothing. A held frame is a tick that
  // never happened, so the log is shorter -- and a replay does not know or care
  // how long anybody waited between two of them.
  const rows: string[] = [`hoppa/1 roam seed=hits tiles=0 behaviour=${newestBuild("roam")}`];
  for (let y = 0; y < GRID_H; y++) {
    rows.push(y === 0 || y === GRID_H - 1 ? "#".repeat(GRID_W) : "#" + ".".repeat(GRID_W - 2) + "#");
  }
  const put = (y: number, x: number, ch: string): void => {
    const line = rows[y + 1] as string;
    rows[y + 1] = line.slice(0, x) + ch + line.slice(x + 1);
  };
  put(6, 3, "@"); put(6, 7, "G"); put(6, 14, "$"); put(11, 20, ">");
  const text = rows.join("\n") + "\n";
  const level = parseLevel(text);
  const who = PRESETS[0] as (typeof PRESETS)[number];

  // A run with gaps in it, exactly as a held clock produces: the ticks that
  // happened are recorded, the held frames simply are not.
  const recorder = new Recorder();
  const live = engineFor(level, who) as unknown as { step(h: number): number; stateHash(): number };
  const stop = new Hitstop();
  for (let i = 0; i < 200; i = (i + 1) | 0) {
    if (stop.holding()) { stop.frame(); continue; }   // the clock is held: no tick
    const held = i % 7 === 0 ? HELD_ACT : HELD_RIGHT;
    recorder.push(held);
    live.step(held);
    if (i % 40 === 0) stop.bite(["kill"]);
    stop.frame();
  }

  const cold = replay([...recorder.log()], () => engineFor(level, who) as unknown as Replayable);
  expect(cold.hash).toBe(live.stateHash());
});

test("no engine has been told about any of this", async () => {
  // If a stop ever becomes something an engine knows, it becomes something
  // stateHash() could disagree about -- and every shipped link is a proof.
  const { readdirSync } = await import("fs");
  for (const engine of readdirSync("src/engines")) {
    let files: string[];
    try { files = readdirSync(`src/engines/${engine}`); } catch { continue; }
    for (const file of files) {
      const src = await Bun.file(`src/engines/${engine}/${file}`).text();
      expect({ file, knows: src.includes("hitstop") || src.includes("Hitstop") })
        .toEqual({ file, knows: false });
    }
  }
});

test("a frame that advanced no tick reads no impacts, or the world never restarts", () => {
  // THE DEADLOCK, and this is the test that was missing when check:mutants
  // found it. `justKilled()` is a per-TICK flag; the page reads it per FRAME.
  // While the world is held no tick runs, so the flag never clears -- and
  // without this gate every held frame re-triggers the hold and the game stops
  // dead on the first kill.
  const gate = new OncePerTick();
  expect(gate.fresh(7)).toBe(true);
  // The same tick, however many frames look at it, is not news again.
  for (let i = 0; i < 10; i = (i + 1) | 0) expect(gate.fresh(7)).toBe(false);
  expect(gate.fresh(8)).toBe(true);
  expect(gate.fresh(8)).toBe(false);
});

test("...and the gate plus the hold cannot lock each other up", () => {
  // The two together, driven the way the page drives them: a flag that stays
  // set for the whole hold, read once a frame. It has to come out the far side.
  const stop = new Hitstop();
  const gate = new OncePerTick();
  let tick = 0;
  let frames = 0;
  const stuckFlagFrom = 3;
  for (let frame = 0; frame < CEILING; frame = (frame + 1) | 0) {
    if (!stop.holding()) tick = (tick + 1) | 0;   // a tick only runs when free
    // The engine's flag: set on the tick the kill happened and, because no
    // tick has run since, still set for every frame of the hold.
    if (tick >= stuckFlagFrom && gate.fresh(tick)) stop.bite(["kill"]);
    stop.frame();
    frames = (frames + 1) | 0;
    if (tick > stuckFlagFrom + 3) break;
  }
  expect(tick).toBeGreaterThan(stuckFlagFrom);
  expect(frames).toBeLessThan(CEILING);
});

test("a new run forgets which tick was last seen", () => {
  const gate = new OncePerTick();
  gate.fresh(4);
  gate.forget();
  expect(gate.fresh(4)).toBe(true);
});

test("the loop banks no time while it is held, or the pause becomes a lurch", async () => {
  // Structural, and specific: the reset has to be INSIDE the held branch. A
  // looser check passes on a file that resets the pump somewhere else
  // entirely, which is exactly what check:mutants demonstrated.
  const realtime = await Bun.file("src/web/play/realtime.ts").text();
  const from = realtime.indexOf("if (this.held()) {");
  const to = realtime.indexOf("} else if (!this.finished())");
  expect(from).toBeGreaterThan(0);
  expect(to).toBeGreaterThan(from);
  expect(realtime.slice(from, to)).toContain("this.pump.reset();");
});
