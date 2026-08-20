import { expect, test } from "bun:test";
import { encodeIndexedPng } from "../tools/png.ts";
import { iconPng } from "../tools/icon.ts";

// A PNG reader, just enough to check the writer. Written independently on
// purpose: a test that reuses the encoder's own helpers proves only that it
// agrees with itself.

function be32(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at] as number) << 24) |
    ((bytes[at + 1] as number) << 16) |
    ((bytes[at + 2] as number) << 8) |
    (bytes[at + 3] as number)
  ) >>> 0;
}

interface Chunk {
  readonly type: string;
  readonly body: Uint8Array;
}

function chunksOf(png: Uint8Array): Chunk[] {
  const out: Chunk[] = [];
  let at = 8;
  while (at < png.length) {
    const length = be32(png, at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    out.push({ type, body: png.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return out;
}

/** Undo a zlib stream made only of stored deflate blocks. */
function inflateStored(zlib: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let at = 2; // skip the two-byte zlib header
  for (;;) {
    const last = (zlib[at] as number) & 1;
    const length = (zlib[at + 1] as number) | ((zlib[at + 2] as number) << 8);
    const check = (zlib[at + 3] as number) | ((zlib[at + 4] as number) << 8);
    // LEN and NLEN must be one another's complement, or it is not a stored block.
    expect(check).toBe(~length & 0xffff);
    parts.push(zlib.subarray(at + 5, at + 5 + length));
    at += 5 + length;
    if (last === 1) break;
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let to = 0;
  for (const part of parts) {
    out.set(part, to);
    to += part.length;
  }
  return out;
}

/** Every pixel back out of a 2bpp indexed PNG. */
function pixelsOf(png: Uint8Array, width: number, height: number): Uint8Array {
  const idat = chunksOf(png).find((c) => c.type === "IDAT") as Chunk;
  const raw = inflateStored(idat.body);
  const stride = width / 4;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (1 + stride)]).toBe(0); // filter "none" on every row
    for (let x = 0; x < width; x++) {
      const byte = raw[y * (1 + stride) + 1 + (x >> 2)] as number;
      out[y * width + x] = (byte >> (6 - (x % 4) * 2)) & 3;
    }
  }
  return out;
}

const RED = [255, 0, 0] as const;
const GREEN = [0, 255, 0] as const;
const BLUE = [0, 0, 255] as const;
const BLACK = [0, 0, 0] as const;

test("a PNG this writes is a PNG, down to the signature and the chunk order", () => {
  const png = encodeIndexedPng(4, 1, new Uint8Array([0, 1, 2, 3]), [BLACK, RED, GREEN, BLUE]);
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(chunksOf(png).map((c) => c.type)).toEqual(["IHDR", "PLTE", "IDAT", "IEND"]);
});

test("the header says what the file actually is", () => {
  const png = encodeIndexedPng(8, 4, new Uint8Array(32), [BLACK]);
  const ihdr = chunksOf(png)[0] as Chunk;
  expect(be32(ihdr.body, 0)).toBe(8);
  expect(be32(ihdr.body, 4)).toBe(4);
  expect(ihdr.body[8]).toBe(2); // bit depth
  expect(ihdr.body[9]).toBe(3); // indexed colour
  expect(ihdr.body[12]).toBe(0); // not interlaced
});

test("every pixel comes back out exactly as it went in", () => {
  const width = 8;
  const height = 3;
  const pixels = new Uint8Array([
    0, 1, 2, 3, 3, 2, 1, 0,
    1, 1, 1, 1, 2, 2, 2, 2,
    3, 0, 3, 0, 3, 0, 3, 0,
  ]);
  const png = encodeIndexedPng(width, height, pixels, [BLACK, RED, GREEN, BLUE]);
  expect([...pixelsOf(png, width, height)]).toEqual([...pixels]);
});

test("the palette is written in order, three bytes a colour", () => {
  const png = encodeIndexedPng(4, 1, new Uint8Array([0, 1, 2, 3]), [BLACK, RED, GREEN, BLUE]);
  const plte = chunksOf(png).find((c) => c.type === "PLTE") as Chunk;
  expect([...plte.body]).toEqual([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
});

test("a CRC that does not match is a corrupt file, so check ours are right", () => {
  // Recomputed here from the spec's polynomial rather than from the writer's
  // table, so a wrong table would show up rather than agree with itself.
  const png = encodeIndexedPng(4, 1, new Uint8Array([0, 1, 2, 3]), [BLACK, RED, GREEN, BLUE]);
  let at = 8;
  let checked = 0;
  while (at < png.length) {
    const length = be32(png, at);
    const typed = png.subarray(at + 4, at + 8 + length);
    let crc = 0xffffffff;
    for (const byte of typed) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    expect(be32(png, at + 8 + length)).toBe((crc ^ 0xffffffff) >>> 0);
    checked++;
    at += 12 + length;
  }
  expect(checked).toBe(4);
});

test("it refuses what it cannot write, rather than writing something broken", () => {
  expect(() => encodeIndexedPng(4, 1, new Uint8Array([0, 1]), [BLACK])).toThrow();
  expect(() => encodeIndexedPng(5, 1, new Uint8Array(5), [BLACK])).toThrow();
  expect(() =>
    encodeIndexedPng(4, 1, new Uint8Array(4), [BLACK, RED, GREEN, BLUE, RED]),
  ).toThrow();
  expect(() => encodeIndexedPng(4, 1, new Uint8Array(4), [])).toThrow();
});

// --- the icon itself ---------------------------------------------------------

test("the icon is the creature, not an empty square", () => {
  const png = iconPng(192);
  const pixels = pixelsOf(png, 192, 192);
  const inked = pixels.filter((value) => value !== 0).length;
  // Something is drawn, and it is not the whole square either.
  expect(inked).toBeGreaterThan(192 * 192 * 0.1);
  expect(inked).toBeLessThan(192 * 192 * 0.7);
});

test("the icon keeps clear of the edge, because home screens round the corners", () => {
  const side = 192;
  const pixels = pixelsOf(iconPng(side), side, side);
  const margin = Math.floor(side / 10);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const nearEdge = x < margin || y < margin || x >= side - margin || y >= side - margin;
      if (nearEdge) expect({ x, y, ink: pixels[y * side + x] }).toEqual({ x, y, ink: 0 });
    }
  }
});

test("the creature is drawn at a whole-number scale, so it stays pixel art", () => {
  // 16 across, so any size that divides cleanly leaves hard edges. A blurred
  // creature is the one thing that would stop a kid recognising it.
  for (const side of [180, 192, 512]) {
    const pixels = pixelsOf(iconPng(side), side, side);
    const rows = new Set<string>();
    for (let y = 0; y < side; y++) rows.add(pixels.subarray(y * side, y * side + side).join(""));
    // 16 sprite rows plus the blank background rows: far fewer than `side`.
    expect({ side, distinct: rows.size <= 17 }).toEqual({ side, distinct: true });
  }
});

test("the same icon every time, so a rebuild does not churn the offline cache", () => {
  expect([...iconPng(192)]).toEqual([...iconPng(192)]);
});
