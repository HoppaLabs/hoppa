// The engine contract. Engines are pure state machines over integer state:
// they take an input, advance, and emit tile indices. They never touch pixels.

export type EngineID = "delve" | "shove";

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
