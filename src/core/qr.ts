// QR codes, written out rather than installed.
//
// CLAUDE.md hard rule 2 names QR generation specifically as the thing not to
// take a dependency for, and it is right to: a QR encoder is a few hundred
// lines of integer arithmetic with no runtime and no upkeep, against a library
// that would be the only third-party code in the project.
//
// Model 2, byte mode, error correction level M, versions 1 to 10 -- which
// covers a share link with room to spare. M is chosen over L because these are
// read off one phone screen by another phone's camera, at an angle, indoors,
// by a child.
//
// The point of it: two kids in the same room with no messaging app between them
// can still pass a level across. One holds up the screen, the other points a
// camera at it. That is the most natural transfer at that age and it costs
// nothing (spec S5b).

export class QrError extends Error {}

/** Error correction level M. */
const ECC_BITS = 0;

/** Total codewords per version, 1..10. */
const TOTAL_CODEWORDS: readonly number[] = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
/** Error-correction codewords per block, level M. */
const EC_PER_BLOCK: readonly number[] = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
/** [blocks in group 1, blocks in group 2] -- group 2 blocks hold one more. */
const BLOCKS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [1, 0], [1, 0], [2, 0], [2, 0], [4, 0], [4, 0], [2, 2], [3, 2], [4, 1],
];
/** Alignment pattern centres per version. */
const ALIGNMENT: ReadonlyArray<readonly number[]> = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42],
  [6, 26, 46], [6, 28, 50],
];

// --- GF(256) ------------------------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let value = 1;
  for (let i = 0; i < 255; i = (i + 1) | 0) {
    EXP[i] = value;
    LOG[value] = i;
    value = value << 1;
    if (value >= 256) value = (value ^ 0x11d) & 0xff; // the QR primitive polynomial
  }
  for (let i = 255; i < 512; i = (i + 1) | 0) EXP[i] = EXP[i - 255] as number;
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[((LOG[a] as number) + (LOG[b] as number)) % 255] as number;
}

/**
 * The generator polynomial for `degree` error-correction codewords.
 *
 * The product of (x - a^0)(x - a^1)...(x - a^degree-1), with the coefficients
 * held highest power first.
 *
 * THE TWO LINES IN THE LOOP WERE THE OTHER WAY ROUND, which multiplies by
 * (a^i * x + 1) instead of (x + a^i) and builds the polynomial reversed. At
 * degree 1 the two agree -- [1, 1] either way -- which is exactly why it read
 * as correct. From degree 2 they diverge: the right answer is [1, 3, 2] and it
 * produced [2, 3, 1].
 *
 * Every QR this project ever drew had wrong error-correction codewords, so
 * every one of them was a well-formed picture of a QR code that no reader
 * could decode. Reported three times, most recently as "the biggest problem is
 * the QR code still is not working" -- and the day-17 fix, drawing it twice as
 * big, could not have helped: the shape was never the problem.
 */
function generator(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i = (i + 1) | 0) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j = (j + 1) | 0) {
      next[j] = (next[j] as number) ^ (poly[j] as number);
      next[j + 1] = (next[j + 1] as number) ^ gfMul(poly[j] as number, EXP[i] as number);
    }
    poly = next;
  }
  return poly;
}

/** Remainder of `data` divided by the generator: the error-correction bytes. */
export function errorCorrection(data: Uint8Array, count: number): Uint8Array {
  const gen = generator(count);
  const out = new Uint8Array(count);
  for (let i = 0; i < data.length; i = (i + 1) | 0) {
    const factor = ((data[i] as number) ^ (out[0] as number)) & 0xff;
    out.copyWithin(0, 1);
    out[count - 1] = 0;
    for (let j = 0; j < count; j = (j + 1) | 0) {
      out[j] = (out[j] as number) ^ gfMul(gen[j + 1] as number, factor);
    }
  }
  return out;
}

// --- the bit stream ---------------------------------------------------------------

class Bits {
  readonly bytes: number[] = [];
  private used = 0;

  push(value: number, width: number): void {
    for (let i = (width - 1) | 0; i >= 0; i = (i - 1) | 0) {
      if (this.used === 0) this.bytes.push(0);
      const at = this.bytes.length - 1;
      this.bytes[at] = ((this.bytes[at] as number) << 1) | ((value >>> i) & 1);
      this.used = (this.used + 1) & 7;
    }
  }

  /** Zero-fill the last byte so the stream is a whole number of codewords. */
  finish(): void {
    while (this.used !== 0) this.push(0, 1);
  }

  length(): number {
    return this.bytes.length;
  }
}

function dataCapacity(version: number): number {
  const at = (version - 1) | 0;
  const [g1, g2] = BLOCKS[at] as readonly [number, number];
  return ((TOTAL_CODEWORDS[at] as number) - (EC_PER_BLOCK[at] as number) * (g1 + g2)) | 0;
}

/** The smallest version this many bytes fits in, or 0 if none does. */
export function versionFor(byteLength: number): number {
  for (let version = 1; version <= 10; version = (version + 1) | 0) {
    const headerBits = 4 + (version >= 10 ? 16 : 8);
    const capacityBits = (dataCapacity(version) * 8) | 0;
    if (headerBits + byteLength * 8 <= capacityBits) return version;
  }
  return 0;
}

// --- the grid ----------------------------------------------------------------------

export interface Qr {
  readonly size: number;
  /** One byte per module, 1 = dark. Row-major, length size*size. */
  readonly modules: Uint8Array;
  readonly version: number;
  readonly mask: number;
}

const FUNCTION = 2; // marker for "this module is structural, not data"

function place(grid: Uint8Array, size: number, x: number, y: number, value: number): void {
  grid[y * size + x] = value;
}

function at(grid: Uint8Array, size: number, x: number, y: number): number {
  return grid[y * size + x] as number;
}

function drawFinder(grid: Uint8Array, size: number, cx: number, cy: number): void {
  for (let dy = -1; dy <= 7; dy = (dy + 1) | 0) {
    for (let dx = -1; dx <= 7; dx = (dx + 1) | 0) {
      const x = (cx + dx) | 0;
      const y = (cy + dy) | 0;
      if (x < 0 || x >= size || y < 0 || y >= size) continue;
      const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      const dark = ring !== 2 && ring <= 3 ? 1 : 0;
      place(grid, size, x, y, dark | FUNCTION);
    }
  }
}

function drawFunctionPatterns(grid: Uint8Array, size: number, version: number): void {
  drawFinder(grid, size, 0, 0);
  drawFinder(grid, size, size - 7, 0);
  drawFinder(grid, size, 0, size - 7);

  // Timing patterns.
  for (let i = 8; i < size - 8; i = (i + 1) | 0) {
    const dark = i % 2 === 0 ? 1 : 0;
    place(grid, size, i, 6, dark | FUNCTION);
    place(grid, size, 6, i, dark | FUNCTION);
  }

  // Alignment patterns, skipping the three that collide with finders.
  const centres = ALIGNMENT[version - 1] as readonly number[];
  for (const cy of centres) {
    for (const cx of centres) {
      const nearFinder =
        (cx === 6 && cy === 6) ||
        (cx === 6 && cy === size - 7) ||
        (cx === size - 7 && cy === 6);
      if (nearFinder) continue;
      for (let dy = -2; dy <= 2; dy = (dy + 1) | 0) {
        for (let dx = -2; dx <= 2; dx = (dx + 1) | 0) {
          const ring = Math.max(Math.abs(dx), Math.abs(dy));
          const dark = ring !== 1 ? 1 : 0;
          place(grid, size, (cx + dx) | 0, (cy + dy) | 0, dark | FUNCTION);
        }
      }
    }
  }

  // The dark module, which is always dark and always here.
  place(grid, size, 8, size - 8, 1 | FUNCTION);

  // Reserve the format areas so data never lands on them.
  for (let i = 0; i < 9; i = (i + 1) | 0) {
    if (at(grid, size, i, 8) === 0) place(grid, size, i, 8, FUNCTION);
    if (at(grid, size, 8, i) === 0) place(grid, size, 8, i, FUNCTION);
  }
  for (let i = 0; i < 8; i = (i + 1) | 0) {
    if (at(grid, size, size - 1 - i, 8) === 0) place(grid, size, size - 1 - i, 8, FUNCTION);
    if (at(grid, size, 8, size - 1 - i) === 0) place(grid, size, 8, size - 1 - i, FUNCTION);
  }

  // Version information, for the sizes big enough to need it.
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i = (i + 1) | 0) {
      const bit = (bits >>> i) & 1;
      const a = (i / 3) | 0;
      const b = i % 3;
      place(grid, size, a, size - 11 + b, bit | FUNCTION);
      place(grid, size, size - 11 + b, a, bit | FUNCTION);
    }
  }
}

/** 18-bit version information: 6 data bits and a 12-bit BCH remainder. */
export function versionBits(version: number): number {
  let remainder = version;
  for (let i = 0; i < 12; i = (i + 1) | 0) {
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  }
  return ((version << 12) | remainder) >>> 0;
}

/** 15-bit format information for a mask, at error correction level M. */
export function formatBits(mask: number): number {
  const data = (ECC_BITS << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i = (i + 1) | 0) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  return (((data << 10) | remainder) ^ 0x5412) >>> 0;
}

export function maskAt(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (((y / 2) | 0) + ((x / 3) | 0)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/** Lower is better. The rules are from the standard, not taste. */
function penalty(grid: Uint8Array, size: number): number {
  let score = 0;

  // Runs of five or more of one colour, in each direction.
  for (let pass = 0; pass < 2; pass = (pass + 1) | 0) {
    for (let a = 0; a < size; a = (a + 1) | 0) {
      let run = 1;
      let previous = -1;
      for (let b = 0; b < size; b = (b + 1) | 0) {
        const value = (pass === 0 ? at(grid, size, b, a) : at(grid, size, a, b)) & 1;
        if (value === previous) {
          run = (run + 1) | 0;
          if (run === 5) score = (score + 3) | 0;
          else if (run > 5) score = (score + 1) | 0;
        } else {
          previous = value;
          run = 1;
        }
      }
    }
  }

  // Two-by-two blocks of one colour.
  for (let y = 0; y < size - 1; y = (y + 1) | 0) {
    for (let x = 0; x < size - 1; x = (x + 1) | 0) {
      const v = at(grid, size, x, y) & 1;
      if (
        (at(grid, size, x + 1, y) & 1) === v &&
        (at(grid, size, x, y + 1) & 1) === v &&
        (at(grid, size, x + 1, y + 1) & 1) === v
      ) {
        score = (score + 3) | 0;
      }
    }
  }

  // Anything that looks like a finder pattern.
  const shapeA = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const shapeB = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  for (let pass = 0; pass < 2; pass = (pass + 1) | 0) {
    for (let a = 0; a < size; a = (a + 1) | 0) {
      for (let b = 0; b + 11 <= size; b = (b + 1) | 0) {
        let matchA = true;
        let matchB = true;
        for (let i = 0; i < 11; i = (i + 1) | 0) {
          const value =
            (pass === 0 ? at(grid, size, b + i, a) : at(grid, size, a, b + i)) & 1;
          if (value !== shapeA[i]) matchA = false;
          if (value !== shapeB[i]) matchB = false;
        }
        if (matchA) score = (score + 40) | 0;
        if (matchB) score = (score + 40) | 0;
      }
    }
  }

  // A wild imbalance of dark to light.
  let dark = 0;
  for (let i = 0; i < size * size; i = (i + 1) | 0) dark = (dark + ((grid[i] as number) & 1)) | 0;
  const total = size * size;
  const percent = ((dark * 100) / total) | 0;
  const away = Math.abs(percent - 50);
  score = (score + ((away / 5) | 0) * 10) | 0;

  return score;
}

// --- the whole thing ----------------------------------------------------------------

export function encodeQr(text: string): Qr {
  const bytes: number[] = [];
  for (const ch of unescape(encodeURIComponent(text))) bytes.push(ch.charCodeAt(0) & 0xff);

  const version = versionFor(bytes.length);
  if (version === 0) {
    throw new QrError(`${bytes.length} bytes will not fit a version 10 code`);
  }

  const at0 = (version - 1) | 0;
  const capacity = dataCapacity(version);
  const bits = new Bits();
  bits.push(4, 4); // byte mode
  bits.push(bytes.length, version >= 10 ? 16 : 8);
  for (const byte of bytes) bits.push(byte, 8);

  // Terminator, then pad to a whole codeword, then the standard filler.
  const capacityBits = capacity * 8;
  const used = bits.length() * 8 - (bits.length() * 8 - (4 + (version >= 10 ? 16 : 8) + bytes.length * 8));
  const terminator = Math.min(4, capacityBits - used);
  bits.push(0, terminator);
  bits.finish();
  const data = bits.bytes.slice();
  let pad = 0xec;
  while (data.length < capacity) {
    data.push(pad);
    pad = pad === 0xec ? 0x11 : 0xec;
  }

  // Split into blocks, add error correction to each, then interleave.
  const [g1, g2] = BLOCKS[at0] as readonly [number, number];
  const blockCount = (g1 + g2) | 0;
  const shortLength = (capacity / blockCount) | 0;
  const ecCount = EC_PER_BLOCK[at0] as number;

  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < blockCount; i = (i + 1) | 0) {
    const length = i < g1 ? shortLength : (shortLength + 1) | 0;
    const block = new Uint8Array(data.slice(offset, offset + length));
    offset = (offset + length) | 0;
    dataBlocks.push(block);
    ecBlocks.push(errorCorrection(block, ecCount));
  }

  const interleaved: number[] = [];
  const longest = shortLength + (g2 > 0 ? 1 : 0);
  for (let i = 0; i < longest; i = (i + 1) | 0) {
    for (const block of dataBlocks) {
      if (i < block.length) interleaved.push(block[i] as number);
    }
  }
  for (let i = 0; i < ecCount; i = (i + 1) | 0) {
    for (const block of ecBlocks) interleaved.push(block[i] as number);
  }

  const size = (version * 4 + 17) | 0;
  const grid = new Uint8Array(size * size);
  drawFunctionPatterns(grid, size, version);

  // The data walk: two columns at a time, right to left, alternating direction,
  // skipping the vertical timing column.
  let bit = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right = (right - 2) | 0) {
    if (right === 6) right = 5; // the timing column is not part of the walk
    for (let step = 0; step < size; step = (step + 1) | 0) {
      const y = upward ? size - 1 - step : step;
      for (let column = 0; column < 2; column = (column + 1) | 0) {
        const x = (right - column) | 0;
        if (at(grid, size, x, y) !== 0) continue; // structural
        const byte = interleaved[bit >>> 3];
        const value = byte === undefined ? 0 : (byte >>> (7 - (bit & 7))) & 1;
        place(grid, size, x, y, value);
        bit = (bit + 1) | 0;
      }
    }
    upward = !upward;
  }

  // Try every mask and keep the least ugly, which is what the standard asks for.
  let bestMask = 0;
  let bestScore = -1;
  let bestGrid = grid;
  for (let mask = 0; mask < 8; mask = (mask + 1) | 0) {
    const candidate = new Uint8Array(grid);
    for (let y = 0; y < size; y = (y + 1) | 0) {
      for (let x = 0; x < size; x = (x + 1) | 0) {
        if ((at(candidate, size, x, y) & FUNCTION) !== 0) continue;
        if (maskAt(mask, x, y)) {
          candidate[y * size + x] = (at(candidate, size, x, y) ^ 1) & 1;
        }
      }
    }
    writeFormat(candidate, size, mask);
    const score = penalty(candidate, size);
    if (bestScore < 0 || score < bestScore) {
      bestScore = score;
      bestMask = mask;
      bestGrid = candidate;
    }
  }

  const modules = new Uint8Array(size * size);
  for (let i = 0; i < modules.length; i = (i + 1) | 0) modules[i] = (bestGrid[i] as number) & 1;
  return { size, modules, version, mask: bestMask };
}

function writeFormat(grid: Uint8Array, size: number, mask: number): void {
  const bits = formatBits(mask);
  for (let i = 0; i < 15; i = (i + 1) | 0) {
    const bit = ((bits >>> i) & 1) | FUNCTION;
    // The copy around the top-left finder. It steps AROUND row and column 6,
    // which belong to the timing patterns -- writing through them leaves a
    // reader with a broken timing line and no way to lock on.
    if (i < 6) place(grid, size, 8, i, bit);
    else if (i === 6) place(grid, size, 8, 7, bit);
    else if (i === 7) place(grid, size, 8, 8, bit);
    else if (i === 8) place(grid, size, 7, 8, bit);
    else place(grid, size, 14 - i, 8, bit);
    // ...and the split copy, which a reader falls back to.
    if (i < 8) place(grid, size, size - 1 - i, 8, bit);
    else place(grid, size, 8, size - 15 + i, bit);
  }
}
