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
  /** The CLI falls back to this when there are no pixels to draw (spec S5). */
  readonly glyph: string;
  readonly caps: Caps;
  /**
   * How it looks. Spec S5: "Sprite and capabilities are independent. A kid
   * draws something spiky and menacing; it can still be a featherweight."
   *
   * Appearance NEVER reaches stateHash(). Two creatures with identical caps
   * and different sprites must play identically, and there is a test for it.
   */
  readonly sprite: Sprite;
  /**
   * What it swings. Purely how it looks -- a wand reaches exactly as far as a
   * sword and hits exactly as hard, and there is a test saying so.
   *
   * It exists because "a sword" is not every child's idea of their own
   * character, and the cost of offering the other one is a drawing and a bit
   * on the wire. Like the sprite, it NEVER reaches stateHash().
   */
  readonly weapon: Weapon;
}

/** The things a creature can swing. Cosmetic; add to the END, never reorder. */
export const WEAPONS = ["sword", "wand"] as const;
export type Weapon = (typeof WEAPONS)[number];

export function isWeapon(value: string): value is Weapon {
  return (WEAPONS as readonly string[]).includes(value);
}

import { spriteFromRows, type Sprite } from "./sprite.ts";

export const CAP_MIN = 0;
export const CAP_MAX = 255;

// --- what a player actually spends -------------------------------------------
//
// A creature is built from a BUDGET, not chosen from a menu. Two
// characteristics, five pips each, six pips to spend: you cannot be strong AND
// fast, and deciding what to give up is the whole of the design. It also means
// every creature a kid makes is comparable with every other one, which is what
// makes trading them mean anything.
//
// Pips rather than a 0-255 slider because a kid has to see the trade. The axes
// underneath are still 0-255, so nothing about the wire format changes.

export const PIP_MAX = 5;
/**
 * Six points across two characteristics. Six rather than ten so the choice is
 * real: you can have five of one and one of the other, or three and three, but
 * never both.
 */
export const PIP_BUDGET = 6;

/**
 * The four a player spends on, and what they are called out loud.
 *
 * `compare` is the word the picker uses. Plain comparatives on purpose: "most
 * nerve" meant nothing to the first person who read it, and a six-year-old is
 * not going to do better.
 *
 * There were four of these. "Stronger" and "Tougher" turned out to be the same
 * word to most people, and "Longer arms" was a mechanic nobody asked for, so
 * they folded into the two that a child can hold in their head at once. Being
 * strong now covers taking a hit as well as landing one, which is what most
 * people assumed it meant anyway.
 */
export const SPENDABLE = [
  { key: "FORCE", label: "strength", compare: "Stronger", blurb: "hit harder, jump higher, take more hits" },
  { key: "HASTE", label: "speed", compare: "Faster", blurb: "move quicker, jump further" },
] as const;

export type SpendKey = (typeof SPENDABLE)[number]["key"];
export type Build = { readonly [K in SpendKey]: number };

/** Pips to the 0-255 axis underneath. 5 pips is the top of the range. */
export function pipToCap(pips: number): number {
  const p = pips | 0;
  if (p <= 0) return 0;
  if (p >= PIP_MAX) return CAP_MAX;
  return (p * 51) | 0;
}

export function clampPip(pips: number): number {
  const p = pips | 0;
  if (p < 0) return 0;
  if (p > PIP_MAX) return PIP_MAX;
  return p;
}

export function spent(build: Build): number {
  let total = 0;
  for (let i = 0; i < SPENDABLE.length; i = (i + 1) | 0) {
    total = (total + clampPip(build[(SPENDABLE[i] as (typeof SPENDABLE)[number]).key])) | 0;
  }
  return total;
}

export function withinBudget(build: Build): boolean {
  return spent(build) <= PIP_BUDGET;
}

export function buildToCaps(build: Build): Caps {
  const caps: Record<string, number> = {};
  for (let i = 0; i < SPENDABLE.length; i = (i + 1) | 0) {
    const key = (SPENDABLE[i] as (typeof SPENDABLE)[number]).key;
    caps[key] = pipToCap(clampPip(build[key]));
  }
  return normalise(caps as Partial<Caps>);
}

/** The pips a set of caps came from, for showing an existing creature. */
export function capsToBuild(caps: Caps): Build {
  const build: Record<string, number> = {};
  for (let i = 0; i < SPENDABLE.length; i = (i + 1) | 0) {
    const key = (SPENDABLE[i] as (typeof SPENDABLE)[number]).key;
    const value = caps[key];
    // Round to the nearest pip without floating point: 51 per pip.
    build[key] = clampPip(((value + 25) / 51) | 0);
  }
  return build as Build;
}

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

function creature(
  id: string,
  name: string,
  glyph: string,
  caps: Partial<Caps>,
  sprite: Sprite,
  weapon: Weapon = "sword",
): Creature {
  return { schema: 1, id, name, glyph, caps: normalise(caps), sprite, weapon };
}

/** A creature from a pip build. Every preset is made this way, so none of them
 *  can quietly be better than something a kid is allowed to build. */
export function creatureFromBuild(
  id: string,
  name: string,
  glyph: string,
  build: Build,
  sprite: Sprite,
  weapon: Weapon = "sword",
): Creature {
  return { schema: 1, id, name, glyph, caps: buildToCaps(build), sprite, weapon };
}

/** Replace a creature's looks and nothing else. */
export function reskin(
  base: Creature,
  name: string,
  sprite: Sprite,
  weapon: Weapon = base.weapon,
): Creature {
  return {
    schema: base.schema, id: base.id, name, glyph: base.glyph,
    caps: base.caps, sprite, weapon,
  };
}

// Three silhouettes. Three colours each, drawn shape-first the way spec S4 says
// the constraint is meant to push you.
// The eyes are the whole trick. Bruk used to have 2x2 eyes and read as a lumpy
// brown blob; one big dark eye with a white glint in the corner is what makes a
// 16x16 shape look like something a child wants to be. Cosmetic only -- hard
// rule 4 -- so every link ever sent replays byte-identically.
const BRUK_ROWS = [
  "................",
  "..11........11..",
  "..111......111..",
  "...1111111111...",
  "..111111111111..",
  ".11111111111111.",
  ".12333111123331.",
  ".13333111133331.",
  ".13333111133331.",
  ".11111111111111.",
  ".11111133111111.",
  ".11111111111111.",
  "..111111111111..",
  "...1111111111...",
  "....11....11....",
  "...111....111...",
];

const NIM_ROWS = [
  "................",
  ".......11.......",
  "......1111......",
  ".....111111.....",
  ".....122221.....",
  ".....111111.....",
  "....11111111....",
  "...1111111111...",
  "...1133331111...",
  "....11111111....",
  ".....111111.....",
  "....11.11.11....",
  "...11..1..11....",
  "..11...1...11...",
  ".......1........",
  "......11.11.....",
];

const PELL_ROWS = [
  "................",
  ".....111111.....",
  "....11111111....",
  "....11222211....",
  "....11111111....",
  "....11333311....",
  "1...11111111...1",
  "11..11111111..11",
  "111.11111111.111",
  ".111.111111.111.",
  "..111111111111..",
  "...1111111111...",
  "....11111111....",
  "....111..111....",
  "....11....11....",
  "...111....111...",
];

/**
 * Bruk, the heavy. Spec S11's worked example, caps unchanged.
 * Loud enough that sneaking is not really on the menu, and tough enough not to
 * care very much.
 */
export const BRUK = creatureFromBuild(
  "01J8XK4M2P7Q",
  "Bash",
  "@",
  // Everything on hitting hard and standing up to things.
  { FORCE: 5, HASTE: 1 },
  spriteFromRows(BRUK_ROWS, [16, 5, 1]),
)

/** Nim, the quick. Light, fast, and in no state to be caught twice. */
export const NIM = creatureFromBuild(
  "01J8XK6R4T2B",
  "Nim",
  "%",
  // Everything on being quick, and it shows the moment anything lands.
  { FORCE: 1, HASTE: 5 },
  spriteFromRows(NIM_ROWS, [22, 23, 5]),
)

/** Pell, the long-armed. Slow and steady, and does not need to step on things. */
export const PELL = creatureFromBuild(
  "01J8XK8W6Y5N",
  "Pell",
  "&",
  // Splits the difference: nothing spectacular, nothing hopeless.
  { FORCE: 3, HASTE: 3 },
  spriteFromRows(PELL_ROWS, [45, 47, 5]),
)

/** The starter stable, in the order the picker shows them. */
export const PRESETS: readonly Creature[] = [BRUK, NIM, PELL];

export function presetByName(name: string): Creature | undefined {
  for (let i = 0; i < PRESETS.length; i = (i + 1) | 0) {
    const c = PRESETS[i] as Creature;
    if (c.name.toLowerCase() === name.toLowerCase()) return c;
  }
  return undefined;
}

/**
 * A creature rebuilt from recorded numbers. Golden vectors use this: a vector
 * records the caps it was made with, so rebalancing a preset can never silently
 * change what a committed vector means.
 */
export function creatureFromCaps(
  id: string,
  name: string,
  caps: Partial<Caps>,
  sprite: Sprite = spriteFromRows(NIM_ROWS, [22, 23, 5]),
  weapon: Weapon = "sword",
): Creature {
  return creature(id, name, "?", caps, sprite, weapon);
}

/** Every axis at one value. Spec S13's E1 and E2 want 0 and 255 to be playable. */
export function uniformCreature(value: number, name: string): Creature {
  const v = clamp(value);
  return creature(
    `uniform-${v}`,
    name,
    "?",
    {
      MOVE_GROUND: v, MOVE_AIR: v, REACH: v, FORCE: v,
      GUARD: v, HASTE: v, MASS: v, SPARK: v,
    },
    spriteFromRows(NIM_ROWS, [3, 4, 5]),
  );
}
