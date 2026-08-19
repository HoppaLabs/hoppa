// What the play page is allowed to ask an engine.
//
// A link pins its own behaviour version, so the page can be handed DelveV1 as
// easily as DelveV4. The Engine contract is only step/render/stateHash/message;
// everything the HUD wants -- turns, treasure, the alarm -- is an extra that
// older builds do not have and must never be made to grow, because their rules
// are frozen.
//
// So the page reads through this, and a missing read-out means "this version
// does not have that idea yet", not a crash.

import type { Engine } from "../../engines/types.ts";
import { STATUS_PLAYING } from "../../engines/types.ts";

type Extras = {
  position?(): { x: number; y: number };
  didBump?(): boolean;
  turns?(): number;
  collectedCount?(): number;
  treasureTotal?(): number;
  alertLevel?(): number;
  alertMax?(): number;
  wasSpotted?(): boolean;
  wasCaught?(): boolean;
  tookFreeStep?(): boolean;
  currentStatus?(): number;
  guardCount?(): number;
};

export class Readout {
  private readonly engine: Engine;
  private readonly extras: Extras;
  /** Counted here so a build with no turn counter of its own still shows one. */
  private steps = 0;
  private status: number = STATUS_PLAYING;

  constructor(engine: Engine) {
    this.engine = engine;
    this.extras = engine as unknown as Extras;
  }

  step(input: number): number {
    this.status = this.engine.step(input);
    this.steps = (this.steps + 1) | 0;
    return this.status;
  }

  render(): Uint8Array {
    return this.engine.render();
  }

  stateHash(): number {
    return this.engine.stateHash();
  }

  message(): string | null {
    return this.engine.message();
  }

  behaviourVersion(): number {
    return this.engine.behaviourVersion;
  }

  currentStatus(): number {
    return this.extras.currentStatus?.() ?? this.status;
  }

  finished(): boolean {
    return this.currentStatus() !== STATUS_PLAYING;
  }

  didBump(): boolean {
    return this.extras.didBump?.() ?? false;
  }

  turns(): number {
    return this.extras.turns?.() ?? this.steps;
  }

  /** null when this build has no notion of treasure at all. */
  treasure(): { got: number; total: number } | null {
    const total = this.extras.treasureTotal?.();
    if (total === undefined) return null;
    return { got: this.extras.collectedCount?.() ?? 0, total };
  }

  /** null when this build has no guards, so the HUD shows no alarm. */
  alarm(): { level: number; max: number } | null {
    const max = this.extras.alertMax?.();
    if (max === undefined) return null;
    return { level: this.extras.alertLevel?.() ?? 0, max };
  }

  wasSpotted(): boolean {
    return this.extras.wasSpotted?.() ?? false;
  }

  wasCaught(): boolean {
    return this.extras.wasCaught?.() ?? false;
  }

  tookFreeStep(): boolean {
    return this.extras.tookFreeStep?.() ?? false;
  }
}
