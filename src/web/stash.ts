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
  isWeapon,
  spent,
  type Build,
  type Creature,
  type Weapon,
} from "../core/creature.ts";
import { pixelsToText, spriteFromText, starterSprite } from "../core/sprite.ts";
import { GRID_AREA } from "../core/grid.ts";
import {
  ENEMY_GLYPHS, FLOW_GLYPHS,
  GLYPH_EXIT, GLYPH_FIRE, GLYPH_FLOOR, GLYPH_LADDER,
  GLYPH_START, GLYPH_TREASURE, GLYPH_WALL,
} from "../core/level.ts";
import type { Draft, Glyph } from "../core/draft.ts";

/**
 * Every glyph a stored draft may contain.
 *
 * Anything not in here throws the whole draft away as corrupt -- which is the
 * right posture for storage that lies, and the wrong one to be careless with.
 * It had fallen three entities behind: a bat, a lizard or a flame in a
 * half-drawn level meant the level was silently gone on the next visit, and the
 * child who drew it had no way to know why. Found while adding the currents.
 *
 * Built from the tool list rather than typed out, so the next entity cannot
 * drift out of it the way those three did.
 */
const LEGAL_GLYPHS: readonly string[] = [
  GLYPH_WALL, GLYPH_FLOOR, GLYPH_START, GLYPH_EXIT,
  GLYPH_TREASURE, GLYPH_LADDER, GLYPH_FIRE,
  ...ENEMY_GLYPHS,
  ...FLOW_GLYPHS,
];
import { normaliseSubPalette } from "../core/palette.ts";

const KEY = "hoppa.character.v2";
const DRAFT_KEY = "hoppa.level.v1";
const SOUND_KEY = "hoppa.sound.v1";

interface Stored {
  readonly name: string;
  readonly build: Record<string, number>;
  readonly sub: readonly number[];
  readonly pixels: string;
  /** Absent on records written before the choice existed: those had swords. */
  readonly weapon?: string;
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
    weapon: creature.weapon,
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
    const name = record.name.slice(0, 12) || "Me";
    // A record written before the choice existed has no weapon in it, and a
    // tampered one may have nonsense: both mean "sword".
    const weapon: Weapon =
      typeof record.weapon === "string" && isWeapon(record.weapon) ? record.weapon : "sword";
    return { creature: creatureFromBuild("yours", name, "@", build, sprite, weapon), build };
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
 * Nothing is spent. A starter with the budget already used up shows a kid two
 * disabled buttons and teaches them nothing; starting at zero makes every plus
 * button live and the choice obvious.
 */
export function startingCharacter(): Saved {
  const build = legalBuild({ FORCE: 0, HASTE: 0 });
  return {
    creature: creatureFromBuild("yours", "Me", "@", build, starterSprite()),
    build,
  };
}


// --- the level you are drawing --------------------------------------------------
//
// Same posture as the character: assume storage lies. A draft is worth keeping
// because a half-drawn room is real work, but losing one costs an afternoon's
// drawing and never a level somebody already sent you -- those live in links.

interface StoredDraft {
  readonly engine: string;
  readonly behaviourVersion: number;
  readonly name: string;
  readonly cells: string;
}

export function saveDraft(draft: Draft, name: string): void {
  const record: StoredDraft = {
    engine: draft.engine,
    behaviourVersion: draft.behaviourVersion,
    name,
    cells: draft.cells.join(""),
  };
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(record));
  } catch {
    // Nothing to do and nothing to say: the level is still on screen.
  }
}

/** The draft in storage, or null when there is not a usable one. */
export function loadDraft(): { draft: Draft; name: string } | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const record = JSON.parse(raw) as Partial<StoredDraft>;
    const cells = typeof record.cells === "string" ? record.cells : "";
    if (cells.length !== GRID_AREA) return null;

    const glyphs: Glyph[] = [];
    for (let i = 0; i < cells.length; i = (i + 1) | 0) {
      const ch = cells[i] as string;
      if (!LEGAL_GLYPHS.includes(ch)) return null;
      glyphs.push(ch as Glyph);
    }

    const draft: Draft = {
      engine: typeof record.engine === "string" ? record.engine : "roam",
      behaviourVersion: typeof record.behaviourVersion === "number" ? record.behaviourVersion | 0 : 2,
      cells: glyphs,
    };
    // A stored draft with no start is not a draft: it would crash the parser
    // rather than merely look odd, so it goes in the bin like a corrupt sprite.
    if (!cells.includes(GLYPH_START)) return null;

    return { draft, name: typeof record.name === "string" ? record.name : "my level" };
  } catch {
    return null;
  }
}


// The last few levels you played were kept here, as the codes that were in
// their links, and shown as a list under the game. Both the list and the
// storage are gone: the play page is for playing now, and the six rooms it
// used to offer are something to start FROM in the level editor. A level is
// still only ever a link, which is what it always was.

// --- whether the game makes a noise -----------------------------------------
//
// Off until somebody asks for it. A link is opened on a bus, in a waiting room
// and at the back of a classroom, and a game that starts making noises on a
// stranger's phone is a game that gets closed.

export function soundOn(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
}

export function setSoundOn(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Then it is off again next time. A setting is not worth a broken page.
  }
}
