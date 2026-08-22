// Driving a real-time engine from the page.
//
// The engine counts ticks. The page owns the clock, turns elapsed milliseconds
// into whole ticks, and calls step() that many times with whichever buttons are
// held right now. Wall-clock time never crosses into the engine, which is what
// keeps a replay identical on a fast phone and a slow one.

import { TickPump } from "../../core/clock.ts";
import { HELD_ACT, HELD_DOWN, HELD_LEFT, HELD_NONE, HELD_RIGHT, HELD_SWING, HELD_UP } from "../../engines/types.ts";

/** What a real-time engine offers the page beyond the Engine contract. */
export interface Moving {
  step(held: number): number;
  render(): Uint8Array;
  stateHash(): number;
  message(): string | null;
  where(): { x: number; y: number; facing: number };
  enemyPositions(): Array<{ x: number; y: number; stunned: boolean; chasing: boolean }>;
  swinging(): boolean;
  swingLeft(): number;
  swingLength(): number;
  merciful(): boolean;
  health(): { hp: number; max: number };
  ticks(): number;
  seconds(): number;
  collectedCount(): number;
  treasureTotal(): number;
  currentStatus(): number;
}

/**
 * Which buttons are down, as one bitmask the engine understands.
 *
 * Presses are LATCHED. A tick is 33ms and a quick tap can begin and end between
 * two of them, so without this a fast press on the sword simply never happens —
 * the button was down at no moment the engine looked. A latched press survives
 * until exactly one tick has seen it.
 */
export class Buttons {
  private held = HELD_NONE;
  private latched = HELD_NONE;

  set(bit: number, down: boolean): void {
    this.held = down ? (this.held | bit) | 0 : (this.held & ~bit) | 0;
    if (down) this.latched = (this.latched | bit) | 0;
  }

  clear(): void {
    this.held = HELD_NONE;
    this.latched = HELD_NONE;
  }

  mask(): number {
    return (this.held | this.latched) | 0;
  }

  /** Called once per tick, after the engine has seen the mask. */
  afterTick(): void {
    this.latched = HELD_NONE;
  }
}

export const KEY_BITS: Record<string, number> = {
  ArrowUp: HELD_UP, w: HELD_UP, k: HELD_UP,
  ArrowRight: HELD_RIGHT, d: HELD_RIGHT, l: HELD_RIGHT,
  ArrowDown: HELD_DOWN, s: HELD_DOWN, j: HELD_DOWN,
  ArrowLeft: HELD_LEFT, a: HELD_LEFT, h: HELD_LEFT,
  " ": HELD_ACT, x: HELD_ACT, z: HELD_ACT, Enter: HELD_ACT,
  // The weapon, where it is a button of its own. Added rather than rebound, so
  // the keys that already swung a sword from above still do.
  c: HELD_SWING, C: HELD_SWING, Shift: HELD_SWING,
};

/**
 * Runs the engine from requestAnimationFrame. `onFrame` is called once per
 * animation frame, after any ticks, so drawing stays smooth even on a frame
 * where the simulation did not advance.
 */
export class Loop {
  private readonly pump = new TickPump();
  private last = 0;
  private running = false;
  private frame = 0;
  private lastSaid: string | null = null;

  constructor(
    private readonly engine: Moving,
    private readonly buttons: Buttons,
    private readonly onFrame: () => void,
    private readonly finished: () => boolean,
    /** Every input handed to the engine, for the share gate's proof. */
    private readonly onInput: (held: number) => void = () => {},
    /**
     * True while the world is holding still on an impact.
     *
     * The clock stops; the drawing does not. Nothing about this reaches the
     * engine -- a run is a list of inputs and this only decides when the next
     * one is taken -- so a held frame simply means the log is one entry
     * shorter. See src/web/play/hitstop.ts.
     */
    private readonly held: () => boolean = () => false,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.pump.reset();
    const tick = (now: number) => {
      if (!this.running) return;
      const elapsed = now - this.last;
      this.last = now;

      if (this.held()) {
        // Bank nothing while the world is stopped, or the moment it lets go
        // the engine runs every tick it missed in a single frame -- which is
        // the opposite of a pause: a lurch.
        this.pump.reset();
      } else if (!this.finished()) {
        const ticks = this.pump.pump(elapsed);
        for (let i = 0; i < ticks; i++) {
          const held = this.buttons.mask();
          this.onInput(held);
          this.engine.step(held);
          this.buttons.afterTick();
          // A message belongs to the TICK it happened on, and several ticks
          // can pass between two frames. Read after the loop and "Got it."
          // is simply gone -- the one moment a child most needs telling.
          const line = this.engine.message();
          if (line !== null && line !== "") this.lastSaid = line;
          if (this.finished()) break;
        }
      }

      this.onFrame();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  /** The most recent thing the engine said, and clear it once it is read. */
  takeMessage(): string | null {
    const said = this.lastSaid;
    this.lastSaid = null;
    return said;
  }

  stop(): void {
    this.running = false;
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
}
