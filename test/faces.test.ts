import { expect, test } from "bun:test";
import { PRESETS } from "../src/core/creature.ts";
import { colourFor } from "../src/core/palette.ts";
import { pixelsToText } from "../src/core/sprite.ts";

// The character buttons show each creature's own drawing. That is only worth
// anything if the drawings are actually different, which is a property of the
// presets rather than of the button.

test("no two ready-made creatures look alike", () => {
  const drawings = PRESETS.map((creature) => pixelsToText(creature.sprite));
  expect(new Set(drawings).size).toBe(PRESETS.length);
});

test("...and they are not the same colours either", () => {
  // Same shape in a different colour would still be tellable apart; the same
  // shape AND the same colours would not.
  const palettes = PRESETS.map((creature) => creature.sprite.sub.join(","));
  expect(new Set(palettes).size).toBe(PRESETS.length);
});

test("every ready-made creature has something to draw", () => {
  for (const creature of PRESETS) {
    const inked = [...creature.sprite.pixels].filter((value) => value !== 0).length;
    expect({ name: creature.name, inked: inked > 20 }).toEqual({ name: creature.name, inked: true });
    // Every value it uses must resolve to a colour, or parts of it vanish.
    for (const value of new Set([...creature.sprite.pixels])) {
      if (value === 0) continue;
      expect({ name: creature.name, value, colour: colourFor(creature.sprite.sub, value) !== null })
        .toEqual({ name: creature.name, value, colour: true });
    }
  }
});

test("the button draws the creature at its true size and is not smoothed", async () => {
  const main = await Bun.file("src/web/play/main.ts").text();
  const html = await Bun.file("src/web/play/index.html").text();
  // 16x16 backing, blown up by CSS. Any other way and a drawing becomes a smudge.
  expect(main.includes("face.width = SPRITE_W")).toBe(true);
  expect(main.includes("face.height = SPRITE_H")).toBe(true);
  expect(html.includes("image-rendering: pixelated")).toBe(true);
});

test("a see-through pixel stays see-through, so the button shows behind it", async () => {
  const main = await Bun.file("src/web/play/main.ts").text();
  // colourFor returns null for value 0. Filling it would put a black square
  // around every creature.
  expect(main.includes("if (colour === null) continue;")).toBe(true);
});

test("the trait line shows the value and what the value buys", async () => {
  const main = await Bun.file("src/web/play/main.ts").text();
  // It used to be three adjectives -- "hits hard · slow · 8 hearts" -- which
  // hid the numbers a child had just spent points on, and read identically for
  // strength 4 and strength 5.
  expect(main.includes('pipRow("strong"')).toBe(true);
  expect(main.includes('pipRow("fast"')).toBe(true);
  // The pips are the same count the make page hands out, so "I gave it four"
  // and "it has four" are the same picture on both pages.
  expect(main.includes("PIP_MAX - pips")).toBe(true);
  // Read out of the running engine and the checker's own table, never
  // recomputed here -- the same rule the heart count had to learn.
  for (const asked of ["hitsToKillFor(creature)", "(moving as Moving).health().max", "stepTableFor(level.behaviourVersion)"]) {
    expect({ asked, there: main.includes(asked) }).toEqual({ asked, there: true });
  }
});
