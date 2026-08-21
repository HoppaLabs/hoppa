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

import { SPRITE_H, SPRITE_W } from "../src/core/sprite.ts";

export interface Enemy {
  /** The name in a level file, the editor, and the wire format's kind field. */
  readonly name: string;
  /** What the level text calls it. One character, upper case. */
  readonly glyph: string;
  /** Two frames: legs together, legs apart. */
  readonly frames: readonly (readonly string[])[];
  /**
   * The colours, indexed by the digits used in the rows. Up to seven.
   *
   * A CREATURE gets three, and has to: a character travels inside a link, and
   * spec S5 fixes it at two bits a pixel. An enemy travels nowhere. It is art
   * baked into the bundle, so the only thing that was holding it to three inks
   * was reusing the creature machinery to draw it.
   *
   * Three inks means one is the outline, so a creature has TWO materials --
   * which is why these read as flat next to the era's best work. That work is
   * not more detailed pixel by pixel; it has more distinct materials. On the
   * hardware that came from metasprites: several 8x8 tiles, each with its own
   * three-colour palette, assembled into one character. Same idea here,
   * without the hardware.
   */
  readonly inks: readonly string[];
}

export const ENEMIES: readonly Enemy[] = [
  {
    name: "goblin",
    glyph: "G",
    // Skin, a darker skin for the underside, eye white, and the outline.
    inks: ["#6fd968", "#ffffff", "#1a212b"],
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
    inks: ["#9a3ad5", "#ffffff", "#1a212b"],
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
    inks: ["#ff5f4d", "#ffb3a8", "#1a212b"],
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
          if (ch === ".") continue;
          const at = ch.charCodeAt(0) - 49;
          if (at < 0 || at >= one.inks.length) {
            wrong.push(`${one.name} f${f} r${y}: glyph "${ch}" has no ink`);
          }
        }
      }
    }
    if (one.inks.length < 3) wrong.push(`${one.name}: ${one.inks.length} inks, want at least 3`);
    if (one.inks.length > 7) wrong.push(`${one.name}: ${one.inks.length} inks, more than a digit`);
    for (const ink of one.inks) {
      if (!/^#[0-9a-f]{6}$/.test(ink)) wrong.push(`${one.name}: "${ink}" is not a colour`);
    }
    // Every ink has to be USED, or it is a colour somebody meant to draw with
    // and forgot -- and an unused ink in a four-colour budget is a wasted
    // quarter of the character.
    const used = new Set(one.frames.flatMap((rows) => rows.join("").split("")));
    for (let at = 0; at < one.inks.length; at++) {
      if (!used.has(String.fromCharCode(49 + at))) {
        wrong.push(`${one.name}: ink ${at + 1} (${one.inks[at]}) is never drawn with`);
      }
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
    "// Rows of digits plus a list of colours, rather than the two-bits-a-pixel",
    "// a CREATURE uses. A creature has to fit in a link and spec S5 fixes it at",
    "// three inks; an enemy travels nowhere, so it can have as many materials as",
    "// it needs -- which is what the era's best work actually had, by way of",
    "// metasprites, and what these were missing.",
    "//",
    "// Cosmetic only: hard rule 4. Which one a level carries travels in the wire",
    "// format, but no engine is ever told, and all three behave exactly as the",
    "// single old guard did.",
    "",
    "export interface Enemy {",
    "  readonly name: string;",
    "  /** What the level text calls it. */",
    "  readonly glyph: string;",
    "  /** Two frames: legs together, legs apart. Digits index `inks`. */",
    "  readonly frames: readonly (readonly string[])[];",
    "  /** Colours, indexed by digit: \"1\" is inks[0]. */",
    "  readonly inks: readonly string[];",
    "}",
    "",
    "export const ENEMIES: readonly Enemy[] = [",
  ];
  for (const one of ENEMIES) {
    lines.push("  {");
    lines.push(`    name: ${JSON.stringify(one.name)},`);
    lines.push(`    glyph: ${JSON.stringify(one.glyph)},`);
    lines.push(`    inks: [${one.inks.map((i) => JSON.stringify(i)).join(", ")}],`);
    lines.push("    frames: [");
    for (const rows of one.frames) {
      lines.push("      [");
      for (const row of rows) lines.push(`        ${JSON.stringify(row)},`);
      lines.push("      ],");
    }
    lines.push("    ],");
    lines.push("  },");
  }
  lines.push("];");
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
