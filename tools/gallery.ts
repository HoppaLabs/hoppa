// The characters the drawing page offers to start from.
//
// A blank 16x16 grid is where most children stop. These are not a menu of
// finished things -- every one of them is a STARTING POINT, loaded into the
// editor to be changed, the same call the six levels made and for the same
// reason.
//
// Cosmetic only: hard rule 4. Nothing here can reach stateHash(), so a
// character drawn from one of these plays exactly as one drawn from nothing.
//
// Drawn with three inks: 1 is the body, 2 is the light (eye whites, glints,
// bellies), 3 is the dark (pupils, mouths, spots). The eyes are the whole
// trick -- see the note on BRUK_ROWS in src/core/creature.ts.

import { SPRITE_H, SPRITE_W, pixelsToText, spriteFromRows } from "../src/core/sprite.ts";
import { PALETTE } from "../src/core/palette.ts";

export interface Example {
  readonly name: string;
  readonly rows: readonly string[];
  /** Three indices into PALETTE: body, light, dark. */
  readonly sub: readonly [number, number, number];
}

export const GALLERY: readonly Example[] = [
  // A knight and a princess first, because they are the two a child asks for
  // by name. Everything else here is an animal or a shape; these are the two
  // that are somebody.
  {
    name: "knight",
    sub: [3, 4, 1],
    rows: [
      ".......22.......",
      "......2222......",
      ".....111111.....",
      "....11111111....",
      "....11333311....",
      "....13333331....",
      "....11133111....",
      ".....111111.....",
      "...1111111111...",
      "..112111111211..",
      "..111111111111..",
      "..111311113111..",
      "..111111111111..",
      "...1111111111...",
      "...111....111...",
      "..1111....1111..",
    ],
  },
  {
    name: "princess",
    sub: [47, 44, 1],
    rows: [
      "................",
      "....2.2.2.2.....",
      "....2222222.....",
      "...33333333.....",
      "..3322222233....",
      "..3323223233....",
      "..3322332233....",
      "...3322222233...",
      "...3332222333...",
      "....11111111....",
      "...1111111111...",
      "...1111111111...",
      "..111111111111..",
      "..111111111111..",
      ".11111111111111.",
      ".11111111111111.",
    ],
  },
  {
    name: "wizard",
    sub: [46, 29, 1],
    rows: [
      ".......11.......",
      "......1111......",
      ".....111111.....",
      "....11111111....",
      "...3333333333...",
      "..111111111111..",
      "....22222222....",
      "....23222232....",
      "....22222222....",
      "....22222222....",
      ".....222222.....",
      "......2222......",
      "..111111111111..",
      "..111111111111..",
      ".11111111111111.",
      ".11111111111111.",
    ],
  },
  {
    name: "pirate",
    sub: [10, 35, 1],
    rows: [
      "................",
      "...3333333333...",
      "....33333333....",
      "....22222222....",
      "....33222232....",
      "....22222222....",
      ".....222222.....",
      "....11111111....",
      "...1111111111...",
      "..111111111111..",
      "..111211112111..",
      "..111111111111..",
      "..111111111111..",
      "...1111111111...",
      "...111....111...",
      "..1111....1111..",
    ],
  },
  {
    name: "blob",
    sub: [22, 4, 1],
    rows: [
      "................",
      "................",
      ".....111111.....",
      "...1111111111...",
      "..111111111111..",
      ".11111111111111.",
      ".11223111223111.",
      ".11233111233111.",
      ".11223111223111.",
      ".11111111111111.",
      ".11111333311111.",
      ".11111111111111.",
      "..111111111111..",
      "...1111111111...",
      "....11111111....",
      "................",
    ],
  },
  {
    name: "cat",
    sub: [34, 4, 1],
    rows: [
      "................",
      "..11........11..",
      "..111......111..",
      "..1111....1111..",
      "..111111111111..",
      ".11111111111111.",
      ".11233111132311.",
      ".11333111133311.",
      ".11111111111111.",
      ".11111133111111.",
      ".11113333331111.",
      "..111111111111..",
      "...1111111111...",
      "....11....11....",
      "...111....111...",
      "................",
    ],
  },
  {
    name: "bird",
    sub: [10, 4, 1],
    rows: [
      "................",
      ".......11.......",
      "......1111......",
      ".....111111.....",
      "....11111111....",
      "...11231132122..",
      "...11331133122..",
      "...111111111....",
      "..111111111111..",
      ".11111222111111.",
      ".11112222211111.",
      ".11111222111111.",
      "..111111111111..",
      "...1111111111...",
      "....11....11....",
      "....11....11....",
    ],
  },
  {
    name: "fish",
    sub: [16, 4, 1],
    rows: [
      "................",
      "................",
      "........1111....",
      "......11111111..",
      "1....1111111111.",
      "11..111111112311",
      "111.111111113311",
      "1111111111111111",
      "1111111111111111",
      "111.111111111111",
      "11..111111111111",
      "1....1111111111.",
      "......11111111..",
      "........1111....",
      "................",
      "................",
    ],
  },
  {
    name: "bug",
    sub: [27, 4, 1],
    rows: [
      "................",
      "...1........1...",
      "....1......1....",
      ".....111111.....",
      "....12311321....",
      "..111111111111..",
      ".11111133111111.",
      ".13111133111131.",
      "1111111331111111",
      "1111111331111111",
      ".11111133111111.",
      ".13111133111131.",
      "..111111111111..",
      "...1111111111...",
      "................",
      "................",
    ],
  },
  {
    name: "ghost",
    sub: [4, 4, 1],
    rows: [
      "................",
      ".....111111.....",
      "...1111111111...",
      "..111111111111..",
      ".11111111111111.",
      ".11331111133111.",
      ".11331111133111.",
      ".11111111111111.",
      ".11111111111111.",
      ".11113333311111.",
      ".11111111111111.",
      ".11111111111111.",
      ".11111111111111.",
      ".11.111..111.11.",
      ".1...1....1...1.",
      "................",
    ],
  },
  {
    name: "robot",
    sub: [3, 5, 1],
    rows: [
      ".......11.......",
      ".......11.......",
      "..111111111111..",
      "..111111111111..",
      "..122311132211..",
      "..133311133311..",
      "..111111111111..",
      "..113333333311..",
      "..111111111111..",
      "....11111111....",
      "..111111111111..",
      "1.111111111111.1",
      "1.111111111111.1",
      "1.111111111111.1",
      "..1111....1111..",
      "..1111....1111..",
    ],
  },
  {
    name: "snake",
    sub: [21, 4, 1],
    rows: [
      "................",
      "....111111......",
      "...11111111.....",
      "..1123113211....",
      "..1133113311....",
      "..111111111.....",
      "..111333111.....",
      "...11111111.....",
      ".....1111111....",
      "........111111..",
      "..........11111.",
      ".........11111..",
      "......11111.....",
      "...11111........",
      "..1111111111....",
      "................",
    ],
  },
  {
    name: "crab",
    sub: [40, 4, 1],
    rows: [
      "................",
      "11..........11..",
      "1111......1111..",
      "11.11....11.11..",
      "....111111......",
      "..111111111111..",
      ".11233111132311.",
      ".11333111133311.",
      "111111111111111.",
      "111113333311111.",
      "111111111111111.",
      ".11111111111111.",
      "..1111111111111.",
      "..11..1111..11..",
      ".11....11....11.",
      "................",
    ],
  },
  {
    name: "bat",
    sub: [46, 4, 1],
    rows: [
      "................",
      "....11....11....",
      "....111..111....",
      ".....111111.....",
      "....12311321....",
      "....13311331....",
      ".....111111.....",
      "11...111111...11",
      "111.11111111.111",
      "1111111111111111",
      ".11111111111111.",
      "..111.1111.111..",
      "...1...11...1...",
      "................",
      "................",
      "................",
    ],
  },
  {
    name: "mushroom",
    sub: [41, 5, 1],
    rows: [
      "................",
      "....11111111....",
      "..111111111111..",
      ".11133111331111.",
      "11113311133111.1",
      "1111111111111111",
      "1113311111133111",
      "1111111111111111",
      ".11111111111111.",
      "...1111111111...",
      "....22222222....",
      "....23222232....",
      "....23222232....",
      "....22222222....",
      "....22222222....",
      "................",
    ],
  },
  {
    name: "star",
    sub: [28, 4, 1],
    rows: [
      "................",
      ".......11.......",
      ".......11.......",
      "......1111......",
      "......1111......",
      "1111111111111111",
      ".11111111111111.",
      "..112311321111..",
      "...1111111111...",
      "...1113311111...",
      "...1111111111...",
      "..11111111111...",
      "..1111..1111....",
      ".1111....1111...",
      ".111......111...",
      "................",
    ],
  },
  {
    name: "dragon",
    sub: [47, 4, 1],
    rows: [
      "................",
      "..1.........1...",
      "..11.......11...",
      "...111111111....",
      "..11111111111...",
      "..112331132311..",
      "..113331133311..",
      "..11111111111...",
      "..111333331111..",
      "...1111111111...",
      "1...111111111...",
      "11...1111111....",
      ".111..11111.....",
      "..1111111.......",
      "....11111111....",
      "................",
    ],
  },
  {
    name: "rabbit",
    sub: [53, 4, 1],
    rows: [
      "....11....11....",
      "....12....21....",
      "....12....21....",
      "....12....21....",
      "....11....11....",
      "....11111111....",
      "...1111111111...",
      "...1231111321...",
      "...1331111331...",
      "...1111111111...",
      "....11133111....",
      "....11111111....",
      "..111111111111..",
      ".11111111111111.",
      "..1111....1111..",
      "................",
    ],
  },
  {
    name: "octopus",
    sub: [46, 4, 1],
    rows: [
      "................",
      "................",
      ".....111111.....",
      "...1111111111...",
      "..111111111111..",
      ".11123111132111.",
      ".11133111133111.",
      ".11111111111111.",
      ".11111333311111.",
      ".11111111111111.",
      "..111111111111..",
      "..11.1111.11.11.",
      ".11..111..11..11",
      ".1...11....1...1",
      ".1...11....1...1",
      "................",
    ],
  },
  {
    name: "worm",
    sub: [35, 4, 1],
    rows: [
      "................",
      "................",
      "................",
      "................",
      "....11111.......",
      "...1111111......",
      "..112311321.....",
      "..113311331.....",
      "..11111111111...",
      "..111333111111..",
      ".111111111111111",
      "111111111111111.",
      ".1111111111111..",
      "..11..11..11....",
      "................",
      "................",
    ],
  },

  // Four more, and they arrive together because the shelf is four wide: a
  // twenty-first character on its own leaves a hole in the last row, and a
  // hole reads as a character that failed to load. It was reported as one.
  //
  // The jaeger is the one that was asked for -- "one of the default
  // characters should be a jaeger, very slow but incredibly strong" -- and
  // it is HERE rather than in the preset stable, which is a measurement
  // rather than a preference: see docs/adr/0050. The kaiju comes with it,
  // because the first thing a child does with a monster is ask to be it.
  {
    name: "jaeger",
    // LIGHT steel, an amber lamp, and the dark between the plates. The
    // first draft used the slate the city's buildings are drawn in, which
    // is 1.6:1 against the swatch behind it and simply invisible --
    // check() measures that rather than leaving it to the eye.
    //
    // It reads on the SHOULDERS, the widest thing on the sprite: at
    // sixteen pixels there is no room for panel detail, and every mech
    // has shoulders.
    sub: [3, 28, 0],
    rows: [
      "................",
      "......1111......",
      "......3223......",
      ".33311111111333.",
      ".12111111111121.",
      ".11111111111111.",
      ".11.11333311.11.",
      ".11.11322311.11.",
      ".11.13333331.11.",
      ".11.11111111.11.",
      ".33..333333..33.",
      "....111..111....",
      "....333..333....",
      "....111..111....",
      "...1111111111...",
      "...3333333333...",
    ],
  },
  {
    name: "kaiju",
    sub: [21, 29, 18],
    rows: [
      "................",
      ".......33.......",
      "....3.1111.3....",
      ".....111111.....",
      "....12211221....",
      "....12311321....",
      "....11111111....",
      ".....323232.....",
      ".11111111111111.",
      ".11111222211111.",
      "...1112222111...",
      "...1111111111...",
      "...111....111...",
      "...111....111...",
      "..3333....3333..",
      "................",
    ],
  },
  {
    name: "dog",
    // Ears hanging down the SIDES of the head. Drawn on top of it they
    // merged in and the whole thing read as a bear: a dog is ears and a
    // snout, in that order.
    sub: [52, 29, 48],
    rows: [
      "................",
      "................",
      ".....111111.....",
      ".11111111111111.",
      ".11112311321111.",
      ".11111111111111.",
      ".11111233211111.",
      "..11.222222.11..",
      "..11.223322.111.",
      ".....111111..11.",
      "....1111111111..",
      "....11222211....",
      "....11222211....",
      "....111..111....",
      "....111..111....",
      "................",
    ],
  },
  {
    name: "frog",
    sub: [22, 29, 18],
    rows: [
      "................",
      "...111....111...",
      "..12321..12321..",
      "..11111..11111..",
      "...1111111111...",
      "..111111111111..",
      ".11113333331111.",
      ".11112222221111.",
      ".11122222222111.",
      "..111222222111..",
      "...1111111111...",
      "..111......111..",
      ".1111......1111.",
      ".111........111.",
      ".333........333.",
      "................",
    ],
  },
];

/** What a sprite is drawn on in the picker, so contrast is measured against it. */
const SWATCH_BG = "#222a35";

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Every row the right width, every glyph one we can draw, every body visible. */
export function check(): string[] {
  const wrong: string[] = [];
  const named = new Set<string>();
  for (const one of GALLERY) {
    if (named.has(one.name)) wrong.push(`${one.name}: two of them`);
    named.add(one.name);
    if (one.rows.length !== SPRITE_H) wrong.push(`${one.name}: ${one.rows.length} rows`);
    one.rows.forEach((row, y) => {
      if (row.length !== SPRITE_W) wrong.push(`${one.name} row ${y}: ${row.length} wide`);
      if (/[^.123]/.test(row)) wrong.push(`${one.name} row ${y}: strange glyph`);
    });
    for (const index of one.sub) {
      if (index < 0 || index >= PALETTE.length) wrong.push(`${one.name}: no colour ${index}`);
    }
    const inked = one.rows.join("").replace(/\./g, "").length;
    if (inked < 40) wrong.push(`${one.name}: only ${inked} pixels, too small to read`);
    // A shape nobody can see is not an example. Four of the first fourteen were
    // drawn in colours near the background -- the star was #1a212b on #222a35,
    // which is 1.1:1 and simply invisible. The body colour has to carry the
    // silhouette, so it is measured rather than eyeballed.
    const visible = contrast(PALETTE[one.sub[0]] as string, SWATCH_BG);
    if (visible < 4) {
      wrong.push(`${one.name}: body is ${visible.toFixed(1)}:1 on the swatch, too dim`);
    }
  }
  return wrong;
}

/**
 * The gallery as the drawing page sees it: a name, three colours, and the
 * pixels packed.
 *
 * The art above is written out as glyphs because that is the only form anybody
 * can read or change in a diff on a phone. It is not the form to ship: sixteen
 * sprites as text is four kilobytes in a bundle a child downloads on mobile
 * data, and packed at 2 bits a pixel it is under fifteen hundred bytes. Same
 * trade as the level pack, same reason -- see docs/adr/0030.
 */
function galleryModule(): string {
  const lines = [
    "// GENERATED by tools/gallery.ts -- do not edit. Run `bun run tools/gallery.ts`.",
    "//",
    "// The characters the drawing page offers to start from. Every one is a",
    "// STARTING POINT, loaded into the editor to be changed.",
    "//",
    "// Cosmetic only: hard rule 4. Nothing here reaches stateHash(), so a",
    "// character begun from one of these plays exactly as one begun from nothing.",
    "",
    'import { spriteFromText } from "./sprite.ts";',
    'import type { Sprite } from "./sprite.ts";',
    "",
    "export interface Example {",
    "  readonly name: string;",
    "  readonly sprite: Sprite;",
    "}",
    "",
    "const DRAWN: readonly (readonly [string, string, readonly number[]])[] = [",
  ];
  for (const one of GALLERY) {
    const sprite = spriteFromRows(one.rows, one.sub);
    lines.push(`  [${JSON.stringify(one.name)}, ${JSON.stringify(pixelsToText(sprite))}, ` +
      `[${one.sub.join(", ")}]],`);
  }
  lines.push("];");
  lines.push("");
  lines.push("export const GALLERY: readonly Example[] = DRAWN.map(([name, pixels, sub]) => ({");
  lines.push("  name,");
  lines.push("  sprite: spriteFromText(pixels, sub),");
  lines.push("}));");
  lines.push("");
  return lines.join("\n");
}

if (import.meta.main) {
  const wrong = check();
  if (wrong.length > 0) {
    console.error(wrong.join("\n"));
    process.exit(1);
  }
  await Bun.write("src/core/gallery.ts", galleryModule());
  console.log(`  src/core/gallery.ts — ${GALLERY.length} characters`);
}
