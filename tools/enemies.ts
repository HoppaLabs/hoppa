// The three things that walk about and hurt you.
//
// Up to now there was one enemy and it was a rounded rectangle with two eye
// rectangles, drawn with fillRect at fractional coordinates. Sampled on the
// canvas, that patch held SEVENTEEN distinct colours -- every edge soft,
// because every coordinate was a float. Real pixel art there is three or four.
// Reported as "the animation breaks the 8bit look", which it did, three ways
// at once: anti-aliased edges, continuous squash-and-stretch scaling, and a
// sine-driven bounce sampled every frame.
//
// Sprite hardware of the era could not scale, could not position at half a
// pixel, and could not tween. What it could do is swap between a small number
// of drawn frames. So: two frames each, whole pixels, no scaling.
//
// Drawn with three inks, the same convention as the characters in
// tools/gallery.ts -- 1 is the body, 2 is the light, 3 is the dark. The dark
// does triple duty as outline, shadow and features, which is the standard way
// three colours are made to carry a figure.
//
// Frame B is the walk beat: legs apart where frame A has them together, and
// for the bat, wings down where frame A has them up. Everything above the legs
// is identical between frames, so the total inked mass barely changes and the
// creature does not appear to inflate as it walks.
//
// Cosmetic only: hard rule 4. Which enemy a level carries is in the wire
// format, but no engine is ever told, and every one of them behaves exactly as
// the single old guard did. A run replays identically whichever art it wore.

import { SPRITE_H, SPRITE_W, pixelsToText, spriteFromRows } from "../src/core/sprite.ts";
import { PALETTE } from "../src/core/palette.ts";

export interface Enemy {
  /** The name in a level file, the editor, and the wire format's kind field. */
  readonly name: string;
  /** What the level text calls it. One character, upper case. */
  readonly glyph: string;
  /** Two frames: legs together, legs apart. */
  readonly frames: readonly (readonly string[])[];
  /** Three indices into PALETTE: body, light, dark. */
  readonly sub: readonly [number, number, number];
}

export const ENEMIES: readonly Enemy[] = [
  {
    name: "goblin",
    glyph: "G",
    sub: [22, 5, 1], // #6fd968 green, white eyes, near-black outline
    frames: [
      [
        "................",
        "..3..........3..",
        "..33........33..",
        "..3133....3313..",
        "..311333333113..",
        "..31111111111131",
        "..3112211221113.",
        "..3112211221113.",
        "..3111111111113.",
        "..3113333333113.",
        "..3111111111113.",
        "...3111111113...",
        "...3311111133...",
        "....31133113....",
        "....33....33....",
        "................",
      ],
      [
        "................",
        "..3..........3..",
        "..33........33..",
        "..3133....3313..",
        "..311333333113..",
        "..31111111111131",
        "..3112211221113.",
        "..3112211221113.",
        "..3111111111113.",
        "..3113333333113.",
        "..3111111111113.",
        "...3111111113...",
        "...3311111133...",
        "...311......113.",
        "...33........33.",
        "................",
      ],
    ],
  },
  {
    name: "bat",
    glyph: "B",
    sub: [45, 5, 1], // #9a3ad5 purple, white eyes, near-black outline
    frames: [
      [
        "................",
        "..3..........3..",
        ".313........313.",
        ".3113......3113.",
        ".31113....31113.",
        "..31113..31113..",
        "...3111331113...",
        "....31211213....",
        "....32211223....",
        "....31111113....",
        ".....311113.....",
        "......3113......",
        "................",
        "................",
        "................",
        "................",
      ],
      [
        "................",
        "................",
        "................",
        "...3111331113...",
        "....31211213....",
        "....32211223....",
        "....31111113....",
        "...3111111113...",
        "..31113..31113..",
        ".31113....31113.",
        "3113........3113",
        "................",
        "................",
        "................",
        "................",
        "................",
      ],
    ],
  },
  {
    name: "dragon",
    glyph: "D",
    sub: [40, 41, 1], // #ff5f4d body, #ffb3a8 wing membrane, near-black outline
    frames: [
      [
        "...3............",
        "..323...........",
        "..3223..........",
        "..32223.........",
        "..322223....33..",
        "..3222223..3113.",
        "..32222213.3123.",
        "..32222231131113",
        ".33111111111113.",
        "33311111111113..",
        "3.31111111113...",
        "...3111111113...",
        "...3113..3113...",
        "...33.....33....",
        "................",
        "................",
      ],
      [
        "................",
        "...3............",
        "..323...........",
        "..3223..........",
        "..32223.....33..",
        "..322223...3113.",
        "..3222213..3123.",
        "..3222231131113.",
        ".33111111111113.",
        "33311111111113..",
        "3.31111111113...",
        "...3111111113...",
        "...311....113...",
        "...33......33...",
        "................",
        "................",
      ],
    ],
  },
];

/** The generator's own gate, before anything ships. */
export function check(): string[] {
  const wrong: string[] = [];
  const seen = new Set<string>();
  for (const one of ENEMIES) {
    if (seen.has(one.glyph)) wrong.push(`${one.name}: glyph ${one.glyph} is already taken`);
    seen.add(one.glyph);
    if (!/^[A-Z]$/.test(one.glyph)) wrong.push(`${one.name}: glyph must be one capital letter`);
    if (one.frames.length !== 2) wrong.push(`${one.name}: ${one.frames.length} frames, want 2`);
    for (let f = 0; f < one.frames.length; f++) {
      const rows = one.frames[f] as readonly string[];
      if (rows.length !== SPRITE_H) wrong.push(`${one.name} f${f}: ${rows.length} rows`);
      for (let y = 0; y < rows.length; y++) {
        const row = rows[y] as string;
        if (row.length !== SPRITE_W) wrong.push(`${one.name} f${f} r${y}: ${row.length} wide`);
        for (const ch of row) {
          if (!".123".includes(ch)) wrong.push(`${one.name} f${f} r${y}: bad glyph "${ch}"`);
        }
      }
    }
    for (const index of one.sub) {
      if (index < 0 || index >= PALETTE.length) wrong.push(`${one.name}: palette ${index}`);
    }
    // The two frames have to be the same creature. A walk beat moves the legs;
    // it does not redraw the animal, and a large change in inked mass reads as
    // the sprite inflating rather than stepping.
    const mass = one.frames.map((rows) => rows.join("").replace(/\./g, "").length);
    const drift = Math.abs((mass[0] as number) - (mass[1] as number));
    if (drift > 12) wrong.push(`${one.name}: frames differ by ${drift} pixels, too much`);
    if ((mass[0] as number) < 40) wrong.push(`${one.name}: only ${mass[0]} pixels, too small`);
  }
  return wrong;
}

function enemiesModule(): string {
  const lines = [
    "// GENERATED by tools/enemies.ts -- do not edit. Run `bun run tools/enemies.ts`.",
    "//",
    "// The three things that walk about and hurt you, two frames each.",
    "//",
    "// Cosmetic only: hard rule 4. Which one a level carries travels in the wire",
    "// format, but no engine is ever told, and all three behave exactly as the",
    "// single old guard did. A run replays identically whichever art it wore.",
    "",
    'import { spriteFromText } from "./sprite.ts";',
    'import type { Sprite } from "./sprite.ts";',
    "",
    "export interface Enemy {",
    "  readonly name: string;",
    "  /** What the level text calls it. */",
    "  readonly glyph: string;",
    "  /** Two frames: legs together, legs apart. */",
    "  readonly frames: readonly Sprite[];",
    "}",
    "",
    "const DRAWN: readonly (readonly [string, string, readonly string[], readonly number[]])[] = [",
  ];
  for (const one of ENEMIES) {
    const packed = one.frames.map((rows) => pixelsToText(spriteFromRows(rows, one.sub)));
    lines.push(
      `  [${JSON.stringify(one.name)}, ${JSON.stringify(one.glyph)}, ` +
        `[${packed.map((p) => JSON.stringify(p)).join(", ")}], [${one.sub.join(", ")}]],`,
    );
  }
  lines.push("];");
  lines.push("");
  lines.push("export const ENEMIES: readonly Enemy[] = DRAWN.map(([name, glyph, frames, sub]) => ({");
  lines.push("  name,");
  lines.push("  glyph,");
  lines.push("  frames: frames.map((pixels) => spriteFromText(pixels, sub)),");
  lines.push("}));");
  lines.push("");
  lines.push("/** The enemy a level glyph means, or undefined. */");
  lines.push("export function enemyByGlyph(glyph: string): Enemy | undefined {");
  lines.push("  return ENEMIES.find((one) => one.glyph === glyph);");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

if (import.meta.main) {
  const wrong = check();
  if (wrong.length > 0) {
    console.error(wrong.join("\n"));
    process.exit(1);
  }
  await Bun.write("src/core/enemies.ts", enemiesModule());
  console.log(`  src/core/enemies.ts — ${ENEMIES.length} enemies, ${ENEMIES.length * 2} frames`);
}
