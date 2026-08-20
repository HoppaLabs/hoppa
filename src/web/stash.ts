// Browser storage for the character you made.
//
// Spec S5b: "Storage will betray you." So this is written assuming it does:
// every read is guarded, a corrupt or half-written entry is thrown away rather
// than crashing the page, and losing it costs you a drawing, never a level.
//
// This lives outside core on purpose. localStorage is ambient state, and the
// determinism zone may not touch it.

import {
  PIP_BUDGET,
  SPENDABLE,
  clampPip,
  creatureFromBuild,
  spent,
  type Build,
  type Creature,
} from "../core/creature.ts";
import { pixelsToText, spriteFromText, starterSprite } from "../core/sprite.ts";
import { normaliseSubPalette } from "../core/palette.ts";

const KEY = "hoppa.character.v2";

interface Stored {
  readonly name: string;
  readonly build: Record<string, number>;
  readonly sub: readonly number[];
  readonly pixels: string;
}

/** Every pip clamped, and never more than the budget allows. */
export function legalBuild(raw: Partial<Record<string, number>>): Build {
  const build: Record<string, number> = {};
  for (const spend of SPENDABLE) build[spend.key] = clampPip(raw[spend.key] ?? 0);

  // Trim from the largest down until it fits, so a tampered or out-of-date
  // record can never produce a character better than one you could build.
  while (spent(build as Build) > PIP_BUDGET) {
    let biggest = SPENDABLE[0].key as string;
    for (const spend of SPENDABLE) {
      if ((build[spend.key] as number) > (build[biggest] as number)) biggest = spend.key;
    }
    build[biggest] = ((build[biggest] as number) - 1) | 0;
  }
  return build as Build;
}

export function saveCharacter(name: string, build: Build, creature: Creature): void {
  const record: Stored = {
    name,
    build: { ...build },
    sub: [...creature.sprite.sub],
    pixels: pixelsToText(creature.sprite),
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // Private mode, a full quota, a browser that simply says no. The drawing is
    // still on screen and still playable; it just will not survive a reload.
  }
}

export interface Saved {
  readonly creature: Creature;
  readonly build: Build;
}

/** The saved character, or null if there is not a usable one. */
export function loadCharacter(): Saved | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const record = JSON.parse(raw) as Partial<Stored>;
    if (typeof record.pixels !== "string" || typeof record.name !== "string") return null;

    const sub = normaliseSubPalette(Array.isArray(record.sub) ? record.sub : []);
    const sprite = spriteFromText(record.pixels, sub);
    const build = legalBuild((record.build ?? {}) as Record<string, number>);
    const name = record.name.slice(0, 12) || "Mine";
    return { creature: creatureFromBuild("yours", name, "@", build, sprite), build };
  } catch {
    // Anything unreadable is treated as absent. Never let a bad record stop the
    // page loading -- a kid cannot clear their own localStorage.
    return null;
  }
}

export function forgetCharacter(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nothing to do; the caller only wanted it gone
  }
}

/**
 * A blank character to start from, for a first visit.
 *
 * Nothing is spent. A starter with the budget already used up shows a kid four
 * disabled buttons and teaches them nothing; starting at zero makes every plus
 * button live and the choice obvious.
 */
export function startingCharacter(): Saved {
  const build = legalBuild({ FORCE: 0, HASTE: 0, GUARD: 0, REACH: 0 });
  return {
    creature: creatureFromBuild("yours", "Mine", "@", build, starterSprite()),
    build,
  };
}
