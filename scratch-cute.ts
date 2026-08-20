import { spriteFromRows } from "./src/core/sprite.ts";
import { colourFor } from "./src/core/palette.ts";
import { encodeIndexedPng } from "./tools/png.ts";

const OUT = "/tmp/claude-0/-home-user-hoppa/9c53d6c8-14c7-5fea-9127-fa981c9e9322/scratchpad";

const CURRENT = {
  name: "0-now", sub: [51, 53, 41],
  rows: [
    "................", "....11111111....", "...1111111111...", "..111111111111..",
    "..112211112211..", "..112211112211..", "..111111111111..", "..111111111111..",
    "..113333333311..", "..111111111111..", "..111111111111..", ".11111111111111.",
    "11.1111111111.11", "11.111....111.11", "...11......11...", "..111......111..",
  ],
};

// A big DARK eye with a single white highlight. White-around-dark read as a
// scowl; dark-with-a-glint is the shiny-eyed look cuteness actually depends on.
const EYE_TOP = ".12333111123331.";
const EYE_MID = ".13333111133331.";

const A = {
  name: "a-round", sub: [51, 5, 1], // the same brown, proper eyes
  rows: [
    "................", ".....111111.....", "...1111111111...", "..111111111111..",
    ".11111111111111.", EYE_TOP, EYE_MID, EYE_MID,
    ".11111111111111.", ".11111133111111.", ".11111111111111.", "..111111111111..",
    "...1111111111...", "....11....11....", "...111....111...", "................",
  ],
};

const B = {
  name: "b-ears", sub: [16, 5, 1], // mint, with little ears
  rows: [
    "................", "..11........11..", "..111......111..", "...1111111111...",
    "..111111111111..", EYE_TOP, EYE_MID, EYE_MID,
    ".11111111111111.", ".11111133111111.", ".11111111111111.", "..111111111111..",
    "...1111111111...", "....11....11....", "...111....111...", "................",
  ],
};

const C = {
  name: "c-chick", sub: [28, 5, 1], // gold, with a tuft
  rows: [
    ".......11.......", ".....1111111....", "...1111111111...", "..111111111111..",
    ".11111111111111.", EYE_TOP, EYE_MID, EYE_MID,
    ".11111111111111.", ".11111133111111.", ".11111111111111.", "..111111111111..",
    "...1111111111...", "....11....11....", "...111....111...", "................",
  ],
};

const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
};

for (const cand of [CURRENT, A, B, C]) {
  if (cand.rows.length !== 16) throw new Error(`${cand.name}: 16 rows, got ${cand.rows.length}`);
  for (const r of cand.rows) {
    if (r.length !== 16) throw new Error(`${cand.name}: 16 wide, got ${r.length}: ${r}`);
  }
  const sprite = spriteFromRows(cand.rows, cand.sub);
  const CELL = 16;
  const side = 16 * CELL;
  const pixels = new Uint8Array(side * side);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = sprite.pixels[y * 16 + x] as number;
      if (v === 0) continue;
      for (let dy = 0; dy < CELL; dy++)
        for (let dx = 0; dx < CELL; dx++)
          pixels[(y * CELL + dy) * side + x * CELL + dx] = v;
    }
  }
  const palette: [number, number, number][] = [rgb("#0d1014")];
  for (const v of [1, 2, 3]) palette.push(rgb(colourFor(sprite.sub, v) ?? "#0d1014"));
  await Bun.write(`${OUT}/${cand.name}.png`, encodeIndexedPng(side, side, pixels, palette));
  console.log(`${cand.name}: ${side}x${side}`);
}
