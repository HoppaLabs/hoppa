// The engine contract. Engines are pure state machines over integer state:
// they take an input, advance, and emit tile indices. They never touch pixels.

export type EngineID = "delve" | "shove" | "roam" | "dash";

// The closed capability vocabulary (spec S6). Nothing consumes these yet;
// they arrive with preset creatures on day 4.
export type Capability =
  | "MOVE_GROUND"
  | "MOVE_AIR"
  | "REACH"
  | "FORCE"
  | "GUARD"
  | "HASTE"
  | "MASS"
  | "SPARK";

export const STATUS_PLAYING = 0;
export const STATUS_WON = 1;
export const STATUS_LOST = 2;
export type Status = 0 | 1 | 2;

// --- real-time input ---------------------------------------------------------
//
// A turn-based engine reads one discrete move per call. A real-time one reads
// which buttons are HELD on this tick, so the alphabet is a bitmask and a log
// is one byte per tick (which run-length encodes to almost nothing, because a
// player holds a direction for many ticks at a time).

export const HELD_NONE = 0;
export const HELD_UP = 1;
export const HELD_RIGHT = 2;
export const HELD_DOWN = 4;
export const HELD_LEFT = 8;
export const HELD_ACT = 16;
/**
 * The weapon, where it is a separate button from the main action.
 *
 * From above, HELD_ACT already means "swing" and this is unused. From the side
 * HELD_ACT is jump, so the sword and the wand need their own bit -- see
 * docs/adr/0019. Appended, never renumbered: a log is held-button bytes, and
 * moving a bit would change what every shipped log means.
 */
export const HELD_SWING = 32;

export const FACE_UP = 0;
export const FACE_RIGHT = 1;
export const FACE_DOWN = 2;
export const FACE_LEFT = 3;

/** dx per facing. */
export const FACE_DX: readonly number[] = [0, 1, 0, -1];
/** dy per facing. y grows downward. */
export const FACE_DY: readonly number[] = [-1, 0, 1, 0];

// Input alphabet. One byte per turn, so an input log is a byte string.
export const INPUT_WAIT = 0;
export const INPUT_UP = 1;
export const INPUT_RIGHT = 2;
export const INPUT_DOWN = 3;
export const INPUT_LEFT = 4;
export type Input = 0 | 1 | 2 | 3 | 4;

/** dx per input index, indexed by Input. */
export const INPUT_DX: readonly number[] = [0, 0, 1, 0, -1];
/** dy per input index, indexed by Input. y grows downward. */
export const INPUT_DY: readonly number[] = [0, -1, 0, 1, 0];

export interface Engine {
  readonly id: EngineID;
  /** Engine behaviour version. Pinned forever; shipped links depend on it. */
  readonly behaviourVersion: number;
  readonly consumes: ReadonlySet<Capability>;

  step(input: number): Status;
  render(): Uint8Array; // TILE INDICES
  stateHash(): number; // FNV-1a 32, authoritative state only
  message(): string | null;
}
