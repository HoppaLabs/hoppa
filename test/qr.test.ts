import { expect, test } from "bun:test";
import {
  QrError,
  encodeQr,
  errorCorrection,
  formatBits,
  maskAt,
  versionBits,
  versionFor,
} from "../src/core/qr.ts";

// --- an independent reader ------------------------------------------------------
//
// There is no QR decoder in this environment to check against, so the test
// brings its own: it walks the finished grid backwards -- unmasking, re-reading
// the zigzag, de-interleaving the blocks and parsing the header -- and asserts
// the original string comes back out. It shares no code with the encoder.

const TOTAL: readonly number[] = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const EC: readonly number[] = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [1, 0], [1, 0], [2, 0], [2, 0], [4, 0], [4, 0], [2, 2], [3, 2], [4, 1],
];
const ALIGN: ReadonlyArray<readonly number[]> = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42],
  [6, 26, 46], [6, 28, 50],
];

/** True where a module is structural rather than data. */
function functionMap(size: number, version: number): Uint8Array {
  const map = new Uint8Array(size * size);
  const mark = (x: number, y: number) => {
    if (x >= 0 && x < size && y >= 0 && y < size) map[y * size + x] = 1;
  };

  for (const [cx, cy] of [[0, 0], [size - 7, 0], [0, size - 7]] as const) {
    for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) mark(cx + dx, cy + dy);
  }
  for (let i = 0; i < size; i++) {
    mark(i, 6);
    mark(6, i);
  }
  const centres = ALIGN[version - 1] as readonly number[];
  for (const cy of centres) {
    for (const cx of centres) {
      const nearFinder =
        (cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6);
      if (nearFinder) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(cx + dx, cy + dy);
    }
  }
  for (let i = 0; i < 9; i++) {
    mark(i, 8);
    mark(8, i);
  }
  for (let i = 0; i < 8; i++) {
    mark(size - 1 - i, 8);
    mark(8, size - 1 - i);
  }
  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const a = (i / 3) | 0;
      const b = i % 3;
      mark(a, size - 11 + b);
      mark(size - 11 + b, a);
    }
  }
  return map;
}

function readBack(qr: ReturnType<typeof encodeQr>): string {
  const { size, modules, version, mask } = qr;
  const structural = functionMap(size, version);

  // Undo the mask.
  const plain = new Uint8Array(modules);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (structural[y * size + x] === 1) continue;
      if (maskAt(mask, x, y)) plain[y * size + x] = (plain[y * size + x] as number) ^ 1;
    }
  }

  // Re-walk the zigzag and collect codewords.
  const bits: number[] = [];
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      const y = upward ? size - 1 - step : step;
      for (let column = 0; column < 2; column++) {
        const x = right - column;
        if (structural[y * size + x] === 1) continue;
        bits.push(plain[y * size + x] as number);
      }
    }
    upward = !upward;
  }

  const codewords: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | (bits[i + b] as number);
    codewords.push(byte);
  }

  // De-interleave back into data blocks.
  const at = version - 1;
  const [g1, g2] = BLOCKS[at] as readonly [number, number];
  const blockCount = g1 + g2;
  const capacity = (TOTAL[at] as number) - (EC[at] as number) * blockCount;
  const shortLength = (capacity / blockCount) | 0;
  const lengths: number[] = [];
  for (let i = 0; i < blockCount; i++) lengths.push(i < g1 ? shortLength : shortLength + 1);

  const blocks: number[][] = lengths.map(() => []);
  let cursor = 0;
  const longest = Math.max(...lengths);
  for (let i = 0; i < longest; i++) {
    for (let b = 0; b < blockCount; b++) {
      if (i < (lengths[b] as number)) {
        (blocks[b] as number[]).push(codewords[cursor] as number);
        cursor++;
      }
    }
  }

  const data = blocks.flat();
  // Parse: 4-bit mode, then the length, then the bytes.
  let pointer = 0;
  const take = (width: number) => {
    let value = 0;
    for (let i = 0; i < width; i++) {
      const byte = data[(pointer >>> 3)] as number;
      value = (value << 1) | ((byte >>> (7 - (pointer & 7))) & 1);
      pointer++;
    }
    return value;
  };
  const mode = take(4);
  if (mode !== 4) throw new Error(`expected byte mode, got ${mode}`);
  const length = take(version >= 10 ? 16 : 8);
  const out: number[] = [];
  for (let i = 0; i < length; i++) out.push(take(8));
  return decodeURIComponent(out.map((b) => `%${b.toString(16).padStart(2, "0")}`).join(""));
}

// --- the tests -------------------------------------------------------------------

const SAMPLES = [
  "hoppa",
  "https://hoppalabs.github.io/hoppa/",
  "https://hoppalabs.github.io/hoppa/#p/first-run/EQFEAAg_VwekYKECCgoQIKChAgek4MCBAgwIECDAgFpKCAoSIICgulBpDImxRybSdilyJbW7ibC5",
  "https://hoppalabs.github.io/hoppa/#p/dash1/ETBEAApgDwekOkOkOkgWIrpDpDpIOiB6Q6Q6UGmQg6kzo5JoKUo2NlOXPfiHEHEHEHIHEHEHEFGA_Q",
];

test.each(SAMPLES)("a QR code reads back as exactly what went in: %s", (text) => {
  const qr = encodeQr(text);
  expect(readBack(qr)).toBe(text);
});

test("the codes we will actually print are a sensible size", () => {
  const rows = SAMPLES.map((text) => {
    const qr = encodeQr(text);
    return `  ${String(text.length).padStart(3)} chars -> version ${String(qr.version).padStart(2)}, ${qr.size}x${qr.size}, mask ${qr.mask}`;
  });
  console.log(`\n${rows.join("\n")}`);
  for (const text of SAMPLES) expect(encodeQr(text).size).toBeLessThanOrEqual(57);
});

// The defining property of Reed-Solomon: the full codeword is divisible by the
// generator polynomial. Checking it this way tests the maths without trusting
// the same code that produced it.
test("error correction leaves no remainder, which is the whole point of it", () => {
  for (const count of [10, 16, 18, 22, 24, 26]) {
    const data = new Uint8Array(20);
    for (let i = 0; i < data.length; i++) data[i] = (i * 37 + 11) & 0xff;
    const ec = errorCorrection(data, count);

    const whole = new Uint8Array(data.length + count);
    whole.set(data, 0);
    whole.set(ec, data.length);
    // Dividing the finished codeword again must leave zero.
    expect([...errorCorrection(whole, count)].every((b) => b === 0)).toBe(true);
  }
});

test("structure: finders, timing, and the module that is always dark", () => {
  const qr = encodeQr(SAMPLES[1] as string);
  const { size, modules } = qr;
  const dark = (x: number, y: number) => modules[y * size + x] === 1;

  // A finder is a 7x7: dark outer ring, light ring, 3x3 dark centre. So the
  // light ring sits at offset 1, and offset 2 is already inside the centre.
  for (const [cx, cy] of [[0, 0], [size - 7, 0], [0, size - 7]] as const) {
    expect(dark(cx + 3, cy + 3)).toBe(true); // centre
    expect(dark(cx + 2, cy + 2)).toBe(true); // still the 3x3 centre
    expect(dark(cx + 1, cy + 1)).toBe(false); // the light ring
    expect(dark(cx, cy)).toBe(true); // outer ring
  }
  // Timing patterns alternate.
  for (let i = 8; i < size - 8; i++) {
    expect(dark(i, 6)).toBe(i % 2 === 0);
    expect(dark(6, i)).toBe(i % 2 === 0);
  }
  // The dark module.
  expect(dark(8, size - 8)).toBe(true);
});

test("format information decodes back to the mask that was used", () => {
  for (let mask = 0; mask < 8; mask++) {
    const bits = formatBits(mask);
    const unmasked = (bits ^ 0x5412) >>> 0;
    expect((unmasked >>> 13) & 3).toBe(0); // error correction level M
    expect((unmasked >>> 10) & 7).toBe(mask);
  }
});

test("version information carries the version it claims", () => {
  for (let version = 7; version <= 10; version++) {
    expect((versionBits(version) >>> 12) & 0x3f).toBe(version);
  }
});

test("a version is chosen that actually fits, and the next one down does not", () => {
  expect(versionFor(1)).toBe(1);
  expect(versionFor(14)).toBe(1);
  expect(versionFor(15)).toBe(2);
  expect(versionFor(10_000)).toBe(0);
});

test("something too big is refused rather than silently truncated", () => {
  expect(() => encodeQr("x".repeat(5000))).toThrow(QrError);
});

test("a code with awkward characters survives, because a slug might have them", () => {
  const text = "https://hoppalabs.github.io/hoppa/#p/Bruk-s-Lair-118/AbC-_123";
  expect(readBack(encodeQr(text))).toBe(text);
});

test("the same text always makes the same code", () => {
  const a = encodeQr(SAMPLES[2] as string);
  const b = encodeQr(SAMPLES[2] as string);
  expect([...a.modules]).toEqual([...b.modules]);
  expect(a.mask).toBe(b.mask);
});

test("the play page still shows the square, and shows the right one", async () => {
  // Checked in a browser by winning a level and reading the canvas back: 37x37
  // modules at 4px with a 4-module quiet zone, and 0 of 1369 modules different
  // from what encodeQr() produces for that level's link. This pins the wiring
  // that check depends on, which is the part that quietly rots.
  const main = await Bun.file("src/web/play/main.ts").text();
  // The square carries the LEVEL link, never the score link -- somebody next to
  // you wants to play it, not read about your time.
  expect(main.includes("const url = linkFor(level, levelName, base);")).toBe(true);
  // Four modules of white all round, or no camera locks on.
  expect(main.includes("const quiet = 4;")).toBe(true);
  // Painted once per win, and shown only after a win.
  expect(main.includes("if (won) paintQr();")).toBe(true);
});

test("the panel can be waved away, and stays away", async () => {
  const main = await Bun.file("src/web/play/main.ts").text();
  const html = await Bun.file("src/web/play/index.html").text();
  // The panel covers the whole screen, so without a way out there is no way to
  // look at the room you just finished, or at where you died.
  expect(html.includes('<button id="shut"')).toBe(true);

  // "Hidden" has to be something the page REMEMBERS. A run that is over
  // repaints every tick, so a class somebody removed once would be back within
  // a thirtieth of a second.
  expect(main.includes("let panelShut = false;")).toBe(true);
  const decisions = main.split("over.className = panelShut").length - 1;
  expect(decisions).toBe(2); // the real-time path and the turn-based one

  // ...and a new run gets its panel back, or closing it once would kill
  // sharing for good. Verified in a browser by winning, closing, and winning
  // again.
  const reset = main.slice(main.indexOf("function reset(): void {"));
  expect(reset.slice(0, reset.indexOf("\n}\n")).includes("panelShut = false;")).toBe(true);
});
