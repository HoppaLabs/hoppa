// Creatures. Spec S11's `.chr` shape, integers only, no floating point.
//
// Day 4 ships the three presets and nothing else: no sprite (day 6), no marks,
// no history. A creature is currently a name and eight numbers, and eight
// numbers is enough to make two runs of the same level feel different.
//
// What a capability MEANS is the engine's business, not the creature's -- and it
// differs per engine on purpose (spec S6: MASS makes you loud in Delve and
// unstoppable in Shove). Thresholds live in the engine that reads them, pinned
// to its behaviour version.

export const CAP_KEYS = [
  "MOVE_GROUND",
  "MOVE_AIR",
  "REACH",
  "FORCE",
  "GUARD",
  "HASTE",
  "MASS",
  "SPARK",
] as const;

export type CapKey = (typeof CAP_KEYS)[number];

/** Every axis runs 0..255. A closed set of eight -- resist adding a ninth. */
export type Caps = { readonly [K in CapKey]: number };

export interface Creature {
  readonly schema: number;
  readonly id: string;
  readonly name: string;
  readonly glyph: string;
  readonly caps: Caps;
}

export const CAP_MIN = 0;
export const CAP_MAX = 255;

function clamp(value: number): number {
  const v = value | 0;
  if (v < CAP_MIN) return CAP_MIN;
  if (v > CAP_MAX) return CAP_MAX;
  return v;
}

/** Every axis clamped into range. A malformed creature is never a crash. */
export function normalise(caps: Partial<Caps>): Caps {
  const out = {} as { [K in CapKey]: number };
  for (let i = 0; i < CAP_KEYS.length; i = (i + 1) | 0) {
    const key = CAP_KEYS[i] as CapKey;
    const raw = caps[key];
    out[key] = raw === undefined ? CAP_MIN : clamp(raw);
  }
  return out;
}

function creature(id: string, name: string, glyph: string, caps: Partial<Caps>): Creature {
  return { schema: 1, id, name, glyph, caps: normalise(caps) };
}

/**
 * Bruk, the heavy. Spec S11's worked example, caps unchanged.
 * Loud enough that sneaking is not really on the menu, and tough enough not to
 * care very much.
 */
export const BRUK = creature("01J8XK4M2P7Q", "Bruk", "@", {
  MOVE_GROUND: 180,
  MOVE_AIR: 40,
  REACH: 90,
  FORCE: 220,
  GUARD: 200,
  HASTE: 60,
  MASS: 240,
  SPARK: 10,
});

/** Nim, the quick. Light, fast, and in no state to be caught twice. */
export const NIM = creature("01J8XK6R4T2B", "Nim", "%", {
  MOVE_GROUND: 210,
  MOVE_AIR: 120,
  REACH: 60,
  FORCE: 50,
  GUARD: 40,
  HASTE: 210,
  MASS: 40,
  SPARK: 90,
});

/** Pell, the long-armed. Slow and steady, and does not need to step on things. */
export const PELL = creature("01J8XK8W6Y5N", "Pell", "&", {
  MOVE_GROUND: 120,
  MOVE_AIR: 20,
  REACH: 200,
  FORCE: 90,
  GUARD: 240,
  HASTE: 30,
  MASS: 110,
  SPARK: 40,
});

/** The starter stable, in the order the picker shows them. */
export const PRESETS: readonly Creature[] = [BRUK, NIM, PELL];

export function presetByName(name: string): Creature | undefined {
  for (let i = 0; i < PRESETS.length; i = (i + 1) | 0) {
    const c = PRESETS[i] as Creature;
    if (c.name.toLowerCase() === name.toLowerCase()) return c;
  }
  return undefined;
}

/** Every axis at one value. Spec S13's E1 and E2 want 0 and 255 to be playable. */
export function uniformCreature(value: number, name: string): Creature {
  const v = clamp(value);
  return creature(`uniform-${v}`, name, "?", {
    MOVE_GROUND: v, MOVE_AIR: v, REACH: v, FORCE: v,
    GUARD: v, HASTE: v, MASS: v, SPARK: v,
  });
}
