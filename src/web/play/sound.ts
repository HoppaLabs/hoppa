// Sound effects, synthesised.
//
// Spec §"not in scope" said no sound until day 15, when it was asked for. This
// is the whole of it: no audio files, so nothing new to download, nothing new
// in the offline cache and nothing new to depend on. Every noise is a couple of
// oscillators and an envelope, which is what a NES did.
//
// It cannot reach the engine and does not want to. Hard rule 4: cosmetics never
// touch stateHash(). A run recorded with the sound on and replayed with it off
// produces the same hash, because nothing in here is ever asked.

/** Every noise the game can make. */
export type Cue = "treasure" | "hurt" | "swing" | "won" | "lost";

/**
 * What the game sounded like at one instant.
 *
 * Read out of the engine rather than reported by it -- there is no "make a
 * noise" call anywhere in an engine, and there must not be, because an engine
 * that knows about sound is an engine whose behaviour could depend on it.
 */
export interface Moment {
  readonly hp: number;
  readonly treasure: number;
  readonly playing: boolean;
  readonly won: boolean;
}

/**
 * Which noises the difference between two instants is worth.
 *
 * Pure, so it can be tested without a browser -- which is the whole reason it
 * is separate from the thing that makes the noise.
 */
export function soundsFor(before: Moment, after: Moment): readonly Cue[] {
  const cues: Cue[] = [];
  // More treasure than a moment ago. Never fewer: a restart is not a theft.
  if (after.treasure > before.treasure) cues.push("treasure");
  // A heart gone. Only while playing, so the last hit and the loss are not two
  // noises on top of each other.
  if (after.hp < before.hp && after.playing) cues.push("hurt");
  // The end, once. `playing -> not playing` can only happen the once per run,
  // because a restart builds a new engine.
  if (before.playing && !after.playing) cues.push(after.won ? "won" : "lost");
  return cues;
}

/** Where a noise starts and how it gets there. */
interface Note {
  readonly hz: number;
  /** Slides to this by the end, when it is there. */
  readonly to?: number;
  readonly ms: number;
  readonly wave: OscillatorType;
  readonly gain: number;
  /** Milliseconds after the cue begins. */
  readonly at: number;
}

// Short, and quiet enough to sit under a room with other people in it. Squares
// and triangles rather than sines, because a sine sounds like a test tone and a
// square sounds like a game.
const SCORE: Readonly<Record<Cue, readonly Note[]>> = {
  // Up: you gained something.
  treasure: [
    { hz: 880, ms: 60, wave: "square", gain: 0.09, at: 0 },
    { hz: 1320, ms: 90, wave: "square", gain: 0.09, at: 55 },
  ],
  // Down and rough: you lost something.
  hurt: [
    { hz: 300, to: 90, ms: 200, wave: "sawtooth", gain: 0.12, at: 0 },
  ],
  // Barely a noise: this one happens several times a second when a child is
  // holding the button down, and anything louder becomes a drill.
  swing: [{ hz: 620, to: 900, ms: 45, wave: "triangle", gain: 0.05, at: 0 }],
  won: [
    { hz: 660, ms: 90, wave: "square", gain: 0.09, at: 0 },
    { hz: 880, ms: 90, wave: "square", gain: 0.09, at: 85 },
    { hz: 1320, ms: 220, wave: "square", gain: 0.09, at: 170 },
  ],
  lost: [
    { hz: 440, ms: 130, wave: "square", gain: 0.08, at: 0 },
    { hz: 330, ms: 130, wave: "square", gain: 0.08, at: 120 },
    { hz: 220, ms: 320, wave: "square", gain: 0.08, at: 240 },
  ],
};

/**
 * The thing that actually makes the noise.
 *
 * Built on the first cue rather than on load, because a browser will not let a
 * page make a noise until somebody has touched it -- and a page that builds an
 * AudioContext anyway leaves it suspended forever on iOS.
 */
export class Sounds {
  private on: boolean;
  private context: AudioContext | null = null;

  constructor(on: boolean) {
    this.on = on;
  }

  setOn(on: boolean): void {
    this.on = on;
    // Silence means silence, including whatever is still ringing.
    if (!on && this.context !== null) void this.context.suspend();
    if (on && this.context !== null) void this.context.resume();
  }

  isOn(): boolean {
    return this.on;
  }

  play(cue: Cue): void {
    if (!this.on) return;
    const context = this.wake();
    if (context === null) return;

    const now = context.currentTime;
    for (const note of SCORE[cue]) {
      const osc = context.createOscillator();
      const level = context.createGain();
      osc.type = note.wave;

      const from = now + note.at / 1000;
      const to = from + note.ms / 1000;
      osc.frequency.setValueAtTime(note.hz, from);
      if (note.to !== undefined) osc.frequency.exponentialRampToValueAtTime(note.to, to);

      // A square wave switched on and off clicks. Two milliseconds of attack
      // and a decay to near-silence is the difference between a note and a tap
      // on the microphone.
      level.gain.setValueAtTime(0.0001, from);
      level.gain.exponentialRampToValueAtTime(note.gain, from + 0.002);
      level.gain.exponentialRampToValueAtTime(0.0001, to);

      osc.connect(level);
      level.connect(context.destination);
      osc.start(from);
      osc.stop(to + 0.02);
    }
  }

  /** The context, made on demand and resumed if the browser parked it. */
  private wake(): AudioContext | null {
    if (this.context === null) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      // No Web Audio at all is a silent game, never a broken one.
      if (Ctor === undefined) return null;
      try {
        this.context = new Ctor();
      } catch {
        return null;
      }
    }
    if (this.context.state === "suspended") void this.context.resume();
    return this.context;
  }
}
