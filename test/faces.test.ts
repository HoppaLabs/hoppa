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

test("the trait line is the two values and nothing else", async () => {
  const main = await Bun.file("src/web/play/main.ts").text();
  // Three adjectives hid the numbers; numbers plus what they buy was more than
  // anybody reads with a guard walking towards them. Just the values.
  expect(main.includes('<b class="what">strong</b>')).toBe(true);
  expect(main.includes('<b class="what">fast</b>')).toBe(true);
  // The pips are the same count the make page hands out, so "I gave it four"
  // and "it has four" are the same picture on both pages.
  expect(main.includes("PIP_MAX - n")).toBe(true);
  // ...and nothing else is worked out here to go stale.
  for (const gone of ["hitsToKillFor", "stepTableFor", "an enemy's pace", "hearts`"]) {
    expect({ gone, still: main.includes(gone) }).toEqual({ gone, still: false });
  }
});

test("redrawing a creature changes nothing about how it plays", async () => {
  // Bash was redrawn on day 15. Hard rule 4 says cosmetics never touch
  // stateHash(), and this is the case that would prove it wrong: a preset whose
  // pixels changed, run against a level, must hash exactly as before.
  const { parseLevel } = await import("../src/core/level.ts");
  const { ROAM5_LEVEL_TEXT } = await import("../src/core/fixtures.ts");
  const { RoamV5 } = await import("../src/engines/roam/v5.ts");
  const { hashHex } = await import("../src/core/hash.ts");
  const { spriteFromRows } = await import("../src/core/sprite.ts");
  const { STATUS_PLAYING, HELD_RIGHT, HELD_UP } = await import("../src/engines/types.ts");

  const level = parseLevel(ROAM5_LEVEL_TEXT);
  const bash = PRESETS[0] as (typeof PRESETS)[number];
  // The same creature with somebody else's drawing on it.
  const repainted = {
    ...bash,
    sprite: spriteFromRows(Array(16).fill("1111111111111111"), [40, 41, 5]),
  };

  const run = (creature: typeof bash): string => {
    const engine = new RoamV5(level, creature);
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 400 && status === STATUS_PLAYING; t++) {
      status = engine.step(t % 100 < 50 ? HELD_RIGHT : HELD_UP);
    }
    return hashHex(engine.stateHash());
  };

  expect(run(repainted)).toBe(run(bash));
});
