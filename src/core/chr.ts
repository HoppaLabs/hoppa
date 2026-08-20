// Character codes. Spec S5b and S11.
//
// This is the save file. Safari deletes localStorage after 7 days without a
// visit, so a kid who plays on Monday and comes back a fortnight later has lost
// the one object the whole product calls permanent. Pasting this code back
// rebuilds the character exactly -- the drawing and the points, not a reference
// to a server, because there is no server.
//
// Level codes are base64url because they are always tapped. **Character codes
// get typed**, off a screenshot, by a nine-year-old. So they use Crockford
// base32: case-insensitive, no ambiguous I, L, O or U, and a check symbol that
// catches a slip rather than silently producing a different creature.
//
//   HOPPA-BASH-4T7K9-M2XQZ-8VJR3-K
//
// Chunked in fives so it can be read aloud, and prefixed with the name so it is
// recognisable in a chat log.

import { BitReader, BitReaderError, BitWriter } from "./bits.ts";
import {
  PIP_MAX,
  SPENDABLE,
  clampPip,
  creatureFromBuild,
  type Build,
  type Creature,
} from "./creature.ts";
import { normaliseSubPalette, PALETTE_SIZE } from "./palette.ts";
import { SPRITE_PIXELS, type Sprite } from "./sprite.ts";

/** Bump only for a layout change, and only ever by adding a new branch. */
export const CHR_VERSION = 1;

/** No I, L, O or U: the four that get misread off a screen. */
export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** Crockford's check alphabet: the 32 above plus five more, making 37 -- prime. */
const CHECK_ALPHABET = `${ALPHABET}*~$=U`;
const CHECK_MODULUS = 37;

export class ChrError extends Error {}

/** What a typed character maps to. Case is ignored; I and L are 1, O is 0. */
export function symbolValue(ch: string): number {
  const upper = ch.toUpperCase();
  if (upper === "I" || upper === "L") return 1;
  if (upper === "O") return 0;
  const at = ALPHABET.indexOf(upper);
  return at;
}

// --- the sprite, run-length encoded ------------------------------------------
//
// A 16x16 sprite at 2bpp is 64 bytes raw. Most of a creature is transparent, so
// runs of one value compress it hard (spec S5b expects 30-40 bytes).

function writeRun(bits: BitWriter, value: number, length: number): void {
  bits.write(value & 3, 2);
  let left = (length - 1) | 0;
  for (;;) {
    const group = left & 15;
    left = left >>> 4;
    bits.write(left > 0 ? 1 : 0, 1);
    bits.write(group, 4);
    if (left === 0) break;
  }
}

function readRun(bits: BitReader): { value: number; length: number } {
  const value = bits.read(2);
  let length = 0;
  let shift = 0;
  for (;;) {
    const more = bits.read(1);
    const group = bits.read(4);
    length = (length | (group << shift)) | 0;
    shift = (shift + 4) | 0;
    if (more === 0) break;
    if (shift > 28) throw new ChrError("that code is not a character");
  }
  return { value, length: (length + 1) | 0 };
}

// --- the payload ---------------------------------------------------------------

function payloadBytes(build: Build, sprite: Sprite): Uint8Array {
  const bits = new BitWriter();
  bits.write(CHR_VERSION, 4);
  for (const spend of SPENDABLE) bits.write(clampPip(build[spend.key]), 3);
  for (const index of sprite.sub) bits.write(index, 6);

  let at = 0;
  while (at < SPRITE_PIXELS) {
    const value = sprite.pixels[at] as number;
    let run = 1;
    while (at + run < SPRITE_PIXELS && sprite.pixels[at + run] === value) run = (run + 1) | 0;
    writeRun(bits, value, run);
    at = (at + run) | 0;
  }
  return bits.finish();
}

/** Bytes to base32 symbols, five bits at a time. */
function toSymbols(bytes: Uint8Array): string {
  let out = "";
  let acc = 0;
  let held = 0;
  for (let i = 0; i < bytes.length; i = (i + 1) | 0) {
    acc = ((acc << 8) | (bytes[i] as number)) | 0;
    held = (held + 8) | 0;
    while (held >= 5) {
      held = (held - 5) | 0;
      out += ALPHABET[(acc >>> held) & 31] as string;
    }
  }
  if (held > 0) out += ALPHABET[(acc << (5 - held)) & 31] as string;
  return out;
}

function fromSymbols(symbols: string): Uint8Array {
  const bytes: number[] = [];
  let acc = 0;
  let held = 0;
  for (const ch of symbols) {
    const value = symbolValue(ch);
    if (value < 0) throw new ChrError(`"${ch}" is not part of a character code`);
    acc = ((acc << 5) | value) | 0;
    held = (held + 5) | 0;
    if (held >= 8) {
      held = (held - 8) | 0;
      bytes.push((acc >>> held) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

/**
 * Crockford's check symbol: the whole code read as a base-32 number, modulo 37.
 *
 * 37 is prime and 32 is invertible under it, which is what makes this catch a
 * changed character wherever it lands, and a swapped pair as well. A plain
 * checksum over the bytes would miss a transposition entirely.
 */
export function checkSymbol(symbols: string): string {
  let acc = 0;
  for (const ch of symbols) {
    const value = symbolValue(ch);
    if (value < 0) throw new ChrError(`"${ch}" is not part of a character code`);
    acc = (acc * 32 + value) % CHECK_MODULUS;
  }
  return CHECK_ALPHABET[acc] as string;
}

/** Only what survives being read aloud and typed back. */
export function tidyName(name: string): string {
  const cleaned = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  return cleaned.length > 0 ? cleaned : "MINE";
}

// --- the code ------------------------------------------------------------------

export function encodeCharacter(name: string, build: Build, sprite: Sprite): string {
  const symbols = toSymbols(payloadBytes(build, sprite));
  const check = checkSymbol(symbols);
  const chunks: string[] = [];
  for (let i = 0; i < symbols.length; i = (i + 5) | 0) chunks.push(symbols.slice(i, i + 5));
  return `HOPPA-${tidyName(name)}-${chunks.join("-")}-${check}`;
}

export interface DecodedCharacter {
  readonly creature: Creature;
  readonly build: Build;
  readonly name: string;
}

export function decodeCharacter(code: string): DecodedCharacter {
  const trimmed = code.trim().toUpperCase();
  if (trimmed.length === 0) throw new ChrError("that is empty");

  const parts = trimmed.split("-").filter((part) => part.length > 0);
  if (parts.length < 3) throw new ChrError("that does not look like a character code");
  if (parts[0] !== "HOPPA") throw new ChrError("a character code starts with HOPPA");

  const name = parts[1] as string;
  const check = parts[parts.length - 1] as string;
  const symbols = parts.slice(2, parts.length - 1).join("");
  if (symbols.length === 0) throw new ChrError("that code has a name but no character in it");

  if (check.length !== 1 || CHECK_ALPHABET.indexOf(check) < 0) {
    throw new ChrError("that code is missing its last letter");
  }
  if (checkSymbol(symbols) !== check) {
    throw new ChrError("that code has a letter wrong -- check it against the picture");
  }

  try {
    const bits = new BitReader(fromSymbols(symbols));
    const version = bits.read(4);
    if (version !== CHR_VERSION) {
      throw new ChrError(`that code was made by a newer hoppa (version ${version})`);
    }

    const build: Record<string, number> = {};
    for (const spend of SPENDABLE) build[spend.key] = clampPip(bits.read(3));

    const sub: number[] = [];
    for (let i = 0; i < 3; i = (i + 1) | 0) {
      const index = bits.read(6);
      sub.push(index < PALETTE_SIZE ? index : 0);
    }

    const pixels = new Uint8Array(SPRITE_PIXELS);
    let at = 0;
    while (at < SPRITE_PIXELS) {
      const run = readRun(bits);
      const end = Math.min(SPRITE_PIXELS, (at + run.length) | 0);
      for (let i = at; i < end; i = (i + 1) | 0) pixels[i] = run.value;
      if (run.length <= 0) throw new ChrError("that code is not a character");
      at = (at + run.length) | 0;
    }

    const sprite: Sprite = { pixels, sub: normaliseSubPalette(sub) };
    return {
      creature: creatureFromBuild("yours", titleCase(name), "@", build as Build, sprite),
      build: build as Build,
      name: titleCase(name),
    };
  } catch (err) {
    if (err instanceof ChrError) throw err;
    if (err instanceof BitReaderError) throw new ChrError("that code stops halfway through");
    throw err;
  }
}

function titleCase(name: string): string {
  if (name.length === 0) return "Mine";
  return name.charAt(0) + name.slice(1).toLowerCase();
}

/** Every pip a build could legally hold, for validation messages. */
export const MAX_PIP = PIP_MAX;
