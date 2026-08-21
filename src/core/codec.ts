// Level codec. Spec S10: structure and content encoded separately, target under
// 150 characters of level data.
//
// THIS IS A COMPATIBILITY SURFACE. A link is permanent and unhosted: once one
// has been sent to somebody, the bit layout below can never change, only be
// added to behind CODEC_VERSION. Read docs/adr/0006 before touching it.
//
// Layout, in order:
//
//   codec version      4 bits
//   schema             4 bits
//   engine id          4 bits   index into ENGINE_IDS
//   behaviour version  6 bits
//   tileset id         4 bits
//   seed              32 bits
//   wall encoding      1 bit    0 = raw bitmap, 1 = run lengths
//   walls                       336 bits raw, or runs (see below)
//   entity count       5 bits
//   entities          12 bits each: 9-bit cell, 3-bit kind
//   ladders                     ONLY for side-on engines -- see below
//   (pad to a byte)
//   checksum           8 bits   FNV-1a over every byte above
//
// The wall encoding is chosen by trying both and keeping the shorter, so a
// corridor-heavy level pays for runs and a noisy one does not.
//
// Ladders are written only when the level's engine is one that can climb them.
// The engine id sits in the header, before the field, so a decoder always knows
// whether to expect it -- which means adding ladders cost NOTHING for every
// level and every link that already exists. The alternative, a second bitmap on
// every level, would have changed every code ever made.

import { BitReader, BitReaderError, BitWriter, fromBase64url, toBase64url } from "./bits.ts";
import { hashBytes, hashInit } from "./hash.ts";
import { GRID_AREA, GRID_H, GRID_W, idx } from "./grid.ts";
import {
  ENEMY_GLYPHS,
  GLYPH_EXIT, GLYPH_FLOOR, GLYPH_GUARD, GLYPH_LADDER, GLYPH_START, GLYPH_TREASURE,
  type Level,
} from "./level.ts";

/** Bump only for a layout change, and only ever by adding a new branch. */
export const CODEC_VERSION = 1;

/** Index is the wire value. Append only -- never reorder, never remove. */
export const ENGINE_IDS: readonly string[] = ["delve", "shove", "roam", "dash", "swim"];
// "shove" at 1 is a slot the spec reserved for a block-pushing game and never
// filled. It stays where it is: the index IS the wire value, so closing the
// gap would silently repoint every link ever made.

const KIND_START = 0;
const KIND_EXIT = 1;
const KIND_TREASURE = 2;
const KIND_GUARD = 3;
// The kind field is 3 bits and only four values were ever used, so fire costs
// nothing: every link ever sent still decodes to exactly what it decoded to
// before. Kinds 5, 6 and 7 are still free after this.
const KIND_FIRE = 4;
// ...and two of those three went to the other enemies. Same 12 bits an entity
// has always cost: the kind field had the room already, so three enemies cost
// exactly what one did. Kind 7 is still free.
const KIND_BAT = 5;
const KIND_DRAGON = 6;

/** Wire kind for each enemy art, indexed as ENEMY_GLYPHS is. */
const ENEMY_KINDS: readonly number[] = [KIND_GUARD, KIND_BAT, KIND_DRAGON];

const MAX_ENTITIES = 31; // 5-bit count

/** Engines whose levels carry a ladder map. */
const CLIMBING_ENGINES: readonly string[] = ["dash"];

export function carriesLadders(engine: string): boolean {
  return CLIMBING_ENGINES.includes(engine);
}

export class CodecError extends Error {}

/**
 * One byte of checksum, which costs two characters and buys a loud failure.
 *
 * Without it a mistyped or truncated code decodes to a DIFFERENT valid level
 * and says nothing -- exactly the "fails quietly rather than loudly" trap spec
 * S10 warns about for behaviour versions. A level link is permanent, so this
 * could not be added later without breaking every link already sent.
 */
function checksum(bytes: Uint8Array): number {
  return hashBytes(hashInit(), bytes) & 0xff;
}

// --- wall runs ---------------------------------------------------------------

/**
 * Run lengths as 3-bit groups with a continuation bit, least significant group
 * first. A run of 1..8 costs one nibble, which is what a corridor wall looks
 * like; longer runs grow a nibble at a time.
 */
function writeRun(bits: BitWriter, run: number): void {
  let left = (run - 1) | 0;
  for (;;) {
    const group = left & 7;
    left = left >>> 3;
    bits.write(left > 0 ? 1 : 0, 1);
    bits.write(group, 3);
    if (left === 0) break;
  }
}

function readRun(bits: BitReader): number {
  let value = 0;
  let shift = 0;
  for (;;) {
    const more = bits.read(1);
    const group = bits.read(3);
    value = (value | (group << shift)) | 0;
    shift = (shift + 3) | 0;
    if (more === 0) break;
    if (shift > 30) throw new CodecError("run length is nonsense -- the code is corrupt");
  }
  return (value + 1) | 0;
}

/** Ladder runs start EMPTY, because cell 0 is always a border wall. */
function ladderRuns(ladders: Uint8Array): number[] {
  const runs: number[] = [];
  let current = 0;
  let run = 0;
  for (let i = 0; i < GRID_AREA; i = (i + 1) | 0) {
    const value = ladders[i] === 1 ? 1 : 0;
    if (value === current) {
      run = (run + 1) | 0;
    } else {
      runs.push(run);
      current = value;
      run = 1;
    }
  }
  runs.push(run);
  return runs;
}

function wallRuns(walls: Uint8Array): number[] {
  const runs: number[] = [];
  // Runs always start with the wall value, because cell 0 is always a border
  // wall. That saves a bit and costs nothing.
  let current = 1;
  let run = 0;
  for (let i = 0; i < GRID_AREA; i = (i + 1) | 0) {
    const value = walls[i] === 1 ? 1 : 0;
    if (value === current) {
      run = (run + 1) | 0;
    } else {
      runs.push(run);
      current = value;
      run = 1;
    }
  }
  runs.push(run);
  return runs;
}

function measureRuns(runs: readonly number[]): number {
  const probe = new BitWriter();
  for (let i = 0; i < runs.length; i = (i + 1) | 0) writeRun(probe, runs[i] as number);
  return probe.bitLength();
}

// --- encode ------------------------------------------------------------------

export function encodeLevel(level: Level): string {
  const engine = ENGINE_IDS.indexOf(level.engine);
  if (engine < 0) throw new CodecError(`engine "${level.engine}" has no wire id`);

  const entities: Array<readonly [number, number]> = [];
  entities.push([idx(level.startX, level.startY), KIND_START]);
  if (level.exitX >= 0) entities.push([idx(level.exitX, level.exitY), KIND_EXIT]);
  for (let i = 0; i < level.treasureCells.length; i = (i + 1) | 0) {
    entities.push([level.treasureCells[i] as number, KIND_TREASURE]);
  }
  for (let i = 0; i < level.guardCells.length; i = (i + 1) | 0) {
    entities.push([
      level.guardCells[i] as number,
      ENEMY_KINDS[level.guardArt[i] ?? 0] ?? KIND_GUARD,
    ]);
  }
  for (let i = 0; i < level.fireCells.length; i = (i + 1) | 0) {
    entities.push([level.fireCells[i] as number, KIND_FIRE]);
  }
  if (entities.length > MAX_ENTITIES) {
    throw new CodecError(`${entities.length} entities; the wire format holds ${MAX_ENTITIES}`);
  }

  const bits = new BitWriter();
  bits.write(CODEC_VERSION, 4);
  bits.write(level.schema, 4);
  bits.write(engine, 4);
  bits.write(level.behaviourVersion, 6);
  bits.write(level.tilesetId, 4);
  bits.write(level.seed, 32);

  // Take whichever wall encoding is actually shorter on this level.
  const runs = wallRuns(level.walls);
  const useRuns = measureRuns(runs) < GRID_AREA;
  bits.write(useRuns ? 1 : 0, 1);
  if (useRuns) {
    for (let i = 0; i < runs.length; i = (i + 1) | 0) writeRun(bits, runs[i] as number);
  } else {
    for (let i = 0; i < GRID_AREA; i = (i + 1) | 0) bits.write(walls(level, i), 1);
  }

  bits.write(entities.length, 5);
  for (let i = 0; i < entities.length; i = (i + 1) | 0) {
    const entry = entities[i] as readonly [number, number];
    bits.write(entry[0], 9);
    bits.write(entry[1], 3);
  }

  if (carriesLadders(level.engine)) {
    const runs = ladderRuns(level.ladders);
    const useLadderRuns = measureRuns(runs) < GRID_AREA;
    bits.write(useLadderRuns ? 1 : 0, 1);
    if (useLadderRuns) {
      for (let i = 0; i < runs.length; i = (i + 1) | 0) writeRun(bits, runs[i] as number);
    } else {
      for (let i = 0; i < GRID_AREA; i = (i + 1) | 0) bits.write(level.ladders[i] === 1 ? 1 : 0, 1);
    }
  }

  const payload = bits.finish();
  const stamped = new Uint8Array(payload.length + 1);
  stamped.set(payload, 0);
  stamped[payload.length] = checksum(payload);
  return toBase64url(stamped);
}

function walls(level: Level, cell: number): number {
  return level.walls[cell] === 1 ? 1 : 0;
}

// --- decode ------------------------------------------------------------------

export function decodeLevel(code: string): Level {
  let stamped: Uint8Array;
  try {
    stamped = fromBase64url(code);
  } catch (err) {
    throw new CodecError(`that is not a hoppa code: ${(err as Error).message}`);
  }
  if (stamped.length < 2) throw new CodecError("that code is too short to be a level");

  const payload = stamped.subarray(0, stamped.length - 1);
  const claimed = stamped[stamped.length - 1] as number;
  if (checksum(payload) !== claimed) {
    throw new CodecError("that code is damaged -- a character has been lost or changed");
  }
  const bits = new BitReader(payload);

  try {
    const codecVersion = bits.read(4);
    if (codecVersion !== CODEC_VERSION) {
      throw new CodecError(
        `this link was made by codec v${codecVersion}; this build speaks v${CODEC_VERSION}`,
      );
    }

    const schema = bits.read(4);
    if (schema !== 1) throw new CodecError(`unsupported schema version ${schema}`);

    const engineId = bits.read(4);
    const engine = ENGINE_IDS[engineId];
    if (engine === undefined) throw new CodecError(`unknown engine id ${engineId}`);

    const behaviourVersion = bits.read(6);
    const tilesetId = bits.read(4);
    const seed = bits.read(32) | 0;

    const wallBits = new Uint8Array(GRID_AREA);
    if (bits.read(1) === 1) {
      let at = 0;
      let value = 1;
      while (at < GRID_AREA) {
        const run = readRun(bits);
        if (at + run > GRID_AREA) throw new CodecError("wall runs overflow the grid");
        for (let i = 0; i < run; i = (i + 1) | 0) {
          wallBits[at] = value;
          at = (at + 1) | 0;
        }
        value = value === 1 ? 0 : 1;
      }
    } else {
      for (let i = 0; i < GRID_AREA; i = (i + 1) | 0) wallBits[i] = bits.read(1);
    }

    const count = bits.read(5);
    const treasureSlot = new Int8Array(GRID_AREA).fill(-1);
    const treasures: number[] = [];
    const guards: number[] = [];
    const guardArt: number[] = [];
    let startX = -1;
    let startY = -1;
    let exitX = -1;
    let exitY = -1;
    const fires = new Uint8Array(GRID_AREA);
    const burning: number[] = [];

    for (let i = 0; i < count; i = (i + 1) | 0) {
      const cell = bits.read(9);
      const kind = bits.read(3);
      if (cell >= GRID_AREA) throw new CodecError(`entity ${i} is off the grid`);
      const x = (cell % GRID_W) | 0;
      const y = ((cell / GRID_W) | 0) | 0;
      wallBits[cell] = 0; // an entity always stands on open ground

      if (kind === KIND_START) {
        if (startX >= 0) throw new CodecError("two starts");
        startX = x;
        startY = y;
      } else if (kind === KIND_EXIT) {
        if (exitX >= 0) throw new CodecError("two exits");
        exitX = x;
        exitY = y;
      } else if (kind === KIND_TREASURE) {
        treasureSlot[cell] = treasures.length | 0;
        treasures.push(cell);
      } else if (kind === KIND_GUARD || kind === KIND_BAT || kind === KIND_DRAGON) {
        // Same entity as a guard in every way an engine cares about, so it
        // lands in the same list, in the same order. Only the art differs, and
        // that rides alongside.
        guards.push(cell);
        guardArt.push(ENEMY_KINDS.indexOf(kind) | 0);
      } else if (kind === KIND_FIRE) {
        fires[cell] = 1;
        burning.push(cell);
      } else {
        throw new CodecError(`unknown entity kind ${kind}`);
      }
    }

    const ladders = new Uint8Array(GRID_AREA);
    if (carriesLadders(engine)) {
      if (bits.read(1) === 1) {
        let at = 0;
        let value = 0;
        while (at < GRID_AREA) {
          const run = readRun(bits);
          if (at + run > GRID_AREA) throw new CodecError("ladder runs overflow the grid");
          for (let i = 0; i < run; i = (i + 1) | 0) {
            ladders[at] = value;
            at = (at + 1) | 0;
          }
          value = value === 1 ? 0 : 1;
        }
      } else {
        for (let i = 0; i < GRID_AREA; i = (i + 1) | 0) ladders[i] = bits.read(1);
      }
    }

    if (startX < 0) throw new CodecError("the code has no start");

    const treasureCells = new Int16Array(treasures.length);
    for (let i = 0; i < treasures.length; i = (i + 1) | 0) {
      treasureCells[i] = treasures[i] as number;
    }
    const guardCells = new Int16Array(guards.length);
    for (let i = 0; i < guards.length; i = (i + 1) | 0) guardCells[i] = guards[i] as number;
    const guardArtOut = new Uint8Array(guardArt.length);
    for (let i = 0; i < guardArt.length; i = (i + 1) | 0) guardArtOut[i] = guardArt[i] as number;
    const fireCells = new Int16Array(burning.length);
    for (let i = 0; i < burning.length; i = (i + 1) | 0) fireCells[i] = burning[i] as number;

    return {
      schema,
      engine,
      behaviourVersion,
      tilesetId,
      seed,
      // Decoding cannot recover the author's spelling of the seed, only its
      // value, so the text is canonicalised. See docs/adr/0006.
      seedText: (seed >>> 0).toString(36),
      walls: wallBits,
      startX,
      startY,
      exitX,
      exitY,
      treasureCells,
      treasureSlot,
      guardCells,
      guardArt: guardArtOut,
      ladders,
      fireCells,
      fires,
    };
  } catch (err) {
    if (err instanceof CodecError) throw err;
    if (err instanceof BitReaderError) throw new CodecError(err.message);
    throw err;
  }
}

/** Everything two levels have to agree on to be the same level. */
export function sameLevel(a: Level, b: Level): boolean {
  if (
    a.schema !== b.schema ||
    a.engine !== b.engine ||
    a.behaviourVersion !== b.behaviourVersion ||
    a.tilesetId !== b.tilesetId ||
    a.seed !== b.seed ||
    a.startX !== b.startX ||
    a.startY !== b.startY ||
    a.exitX !== b.exitX ||
    a.exitY !== b.exitY ||
    a.treasureCells.length !== b.treasureCells.length ||
    a.guardCells.length !== b.guardCells.length
  ) {
    return false;
  }
  for (let i = 0; i < GRID_AREA; i = (i + 1) | 0) {
    if ((a.walls[i] === 1 ? 1 : 0) !== (b.walls[i] === 1 ? 1 : 0)) return false;
  }
  for (let i = 0; i < a.treasureCells.length; i = (i + 1) | 0) {
    if (a.treasureCells[i] !== b.treasureCells[i]) return false;
  }
  for (let i = 0; i < a.guardCells.length; i = (i + 1) | 0) {
    if (a.guardCells[i] !== b.guardCells[i]) return false;
  }
  for (let i = 0; i < GRID_AREA; i = (i + 1) | 0) {
    if ((a.ladders[i] === 1 ? 1 : 0) !== (b.ladders[i] === 1 ? 1 : 0)) return false;
  }
  return true;
}

/** A Level back to the .lvl text it came from. */
/** Which letter this guard was drawn with. Falls back to the plain one. */
function enemyGlyphAt(level: Level, cell: number): string {
  for (let i = 0; i < level.guardCells.length; i = (i + 1) | 0) {
    if ((level.guardCells[i] as number) === cell) {
      return ENEMY_GLYPHS[level.guardArt[i] ?? 0] ?? GLYPH_GUARD;
    }
  }
  return GLYPH_GUARD;
}

export function levelToText(level: Level): string {
  const rows: string[] = [
    `hoppa/${level.schema} ${level.engine} seed=${level.seedText} ` +
      `tiles=${level.tilesetId} behaviour=${level.behaviourVersion}`,
  ];
  for (let y = 0; y < GRID_H; y = (y + 1) | 0) {
    let row = "";
    for (let x = 0; x < GRID_W; x = (x + 1) | 0) {
      const cell = idx(x, y);
      if (x === level.startX && y === level.startY) row += GLYPH_START;
      else if (x === level.exitX && y === level.exitY) row += GLYPH_EXIT;
      else if (level.treasureSlot[cell] !== -1) row += GLYPH_TREASURE;
      // ...and it writes back the letter it came in as, so a round trip through
      // a link and back to text is the level somebody actually drew.
      else if (isGuard(level, cell)) row += enemyGlyphAt(level, cell);
      else if (level.ladders[cell] === 1) row += GLYPH_LADDER;
      else row += level.walls[cell] === 1 ? "#" : GLYPH_FLOOR;
    }
    rows.push(row);
  }
  return `${rows.join("\n")}\n`;
}

function isGuard(level: Level, cell: number): boolean {
  for (let i = 0; i < level.guardCells.length; i = (i + 1) | 0) {
    if (level.guardCells[i] === cell) return true;
  }
  return false;
}
