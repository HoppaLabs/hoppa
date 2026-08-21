import { expect, test } from "bun:test";
import { RAMP, WORD, wordGrid } from "../src/web/logo.ts";

// The wordmark. Asked for as "a better logo then, more SNES quality" -- the
// name had been 12px letter-spaced uppercase text, a label rather than a logo,
// on a game whose sprites have been held to a 16-bit standard since day 16.
//
// Drawn the way everything else here is: silhouettes, and every bevel derived
// from them. So these tests check the DERIVATION, which is the part that can
// quietly rot, rather than counting pixels in a picture.

const chars = [" ", "@", "+", "*", "%", "#"];

test("it says hoppa, and here it is", () => {
  const { w, h, ink } = wordGrid();
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    rows.push("  " + Array.from({ length: w }, (_, x) => chars[ink[y * w + x] as number]).join(""));
  }
  console.log(`\n  ${w} x ${h} art pixels\n${rows.join("\n")}`);
  expect(WORD).toBe("hoppa");
  expect(h).toBe(18);  // 16 rows of letter, plus a cell of air for the outline
});

test("every letter is outlined all the way round", () => {
  // A wordmark has to survive being put on any colour, and the era's answer was
  // always a hard outline. Checked the honest way: no filled cell may touch the
  // outside without an outline cell between them.
  const { w, h, ink } = wordGrid();
  const at = (x: number, y: number): number =>
    x < 0 || x >= w || y < 0 || y >= h ? 0 : (ink[y * w + x] as number);
  let naked = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x, y) < 2) continue;             // not body
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (at(x + dx, y + dy) === 0) naked++;
        }
      }
    }
  }
  expect(naked).toBe(0);
});

test("the letters do not touch each other", () => {
  // The first draft used one column of kerning. The outline grows a cell in
  // every direction, so it ate the gap entirely and welded the h to the o.
  // Every column between two letters must be either outline or nothing.
  const { w, h, ink } = wordGrid();
  const bodyColumns: number[] = [];
  for (let x = 0; x < w; x++) {
    let body = false;
    for (let y = 0; y < h; y++) if ((ink[y * w + x] as number) >= 2) { body = true; break; }
    if (body) bodyColumns.push(x);
  }
  // Five letters means five runs of body columns with gaps between them.
  let runs = 1;
  for (let i = 1; i < bodyColumns.length; i++) {
    if ((bodyColumns[i] as number) !== (bodyColumns[i - 1] as number) + 1) runs++;
  }
  expect(runs).toBe(5);
});

test("it is moulded, not flat: a lit top edge and a shadowed bottom", () => {
  const { w, h, ink } = wordGrid();
  const count = (value: number): number =>
    [...ink].filter((v) => v === value).length;
  const shades = [2, 3, 4, 5].map(count);
  console.log(`\n  shade counts, dark to light: ${shades.join(", ")}`);
  // All four shades are actually used. A ramp with an unused step is a ramp
  // that was designed and then not drawn.
  for (const n of shades) expect(n).toBeGreaterThan(0);
  // The top row of the tallest stroke is the highlight, not the mid tone.
  const firstBody = [...ink].findIndex((v) => v >= 2);
  expect(ink[firstBody] as number).toBe(5);
});

test("the ramp is five inks: an outline and four steps", () => {
  expect(RAMP).toHaveLength(5);
  for (const colour of RAMP) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
  // Darkest first, so `ink - 1` indexes it and the outline is entry zero.
  const light = (hex: string): number => {
    const n = Number.parseInt(hex.slice(1), 16);
    return ((n >>> 16) & 0xff) + ((n >>> 8) & 0xff) + (n & 0xff);
  };
  for (let i = 1; i < RAMP.length; i++) {
    expect(light(RAMP[i] as string)).toBeGreaterThan(light(RAMP[i - 1] as string));
  }
});

test("every page draws it, and none of them types it", async () => {
  for (const page of ["play", "make", "level"]) {
    const html = await Bun.file(`src/web/${page}/index.html`).text();
    const main = await Bun.file(`src/web/${page}/main.ts`).text();
    expect({ page, canvas: html.includes('<canvas id="logo"') }).toEqual({ page, canvas: true });
    // A canvas cannot be read out, so the name is still there in words for a
    // screen reader -- just not on screen.
    expect({ page, spoken: html.includes('<span class="said">hoppa</span>') })
      .toEqual({ page, spoken: true });
    expect({ page, painted: main.includes("paintLogo(logoCanvas,") }).toEqual({ page, painted: true });
    // Whole scales only: a fractional one blurs pixel art.
    expect(main).toContain("window.innerWidth >= 560 ? 3 : 2");
    // ...and no frame round it, whatever the page's canvas rule says.
    expect({ page, bare: html.includes("#logo { display: block; image-rendering: pixelated; border: 0;") })
      .toEqual({ page, bare: true });
  }
});
