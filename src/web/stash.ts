// Browser storage for the creature you made.
//
// Spec S5b: "Storage will betray you." So this is written assuming it does:
// every read is guarded, a corrupt or half-written entry is thrown away rather
// than crashing the page, and losing it costs you a drawing, never a level.
//
// This lives outside core on purpose. localStorage is ambient state, and the
// determinism zone may not touch it.

import { normalise, reskin, presetByName, PRESETS, type Creature } from "../core/creature.ts";
import { pixelsToText, spriteFromText } from "../core/sprite.ts";
import { normaliseSubPalette } from "../core/palette.ts";

const KEY = "hoppa.creature.v1";

interface Stored {
  readonly name: string;
  readonly build: string;
  readonly sub: readonly number[];
  readonly pixels: string;
}

export function saveCreature(name: string, buildName: string, creature: Creature): void {
  const record: Stored = {
    name,
    build: buildName,
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

/** The saved creature, or null if there is not a usable one. */
export function loadCreature(): Creature | null {
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

    const base = presetByName(record.build ?? "") ?? (PRESETS[0] as Creature);
    const sub = normaliseSubPalette(Array.isArray(record.sub) ? record.sub : []);
    const sprite = spriteFromText(record.pixels, sub);
    return reskin(base, record.name.slice(0, 16) || base.name, sprite);
  } catch {
    // Anything unreadable is treated as absent. Never let a bad record stop the
    // page loading -- a kid cannot clear their own localStorage.
    return null;
  }
}

export function forgetCreature(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nothing to do; the caller only wanted it gone
  }
}

/** The caps a saved creature borrows, by name. */
export function buildNameOf(creature: Creature): string {
  for (const preset of PRESETS) {
    let same = true;
    const caps = normalise(creature.caps);
    for (const key of Object.getOwnPropertyNames(preset.caps)) {
      if ((caps as Record<string, number>)[key] !== (preset.caps as Record<string, number>)[key]) {
        same = false;
        break;
      }
    }
    if (same) return preset.name;
  }
  return PRESETS[0]?.name ?? "Bruk";
}
