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
    inks: ["#61d161", "#c6e3b5", "#ffffff", "#15322a"],
    frames: [
      [
        "................",
        "..44........44..",
        ".4224......4224.",
        ".422122..221224.",
        ".42211111111224.",
        ".42211111111224.",
        ".42211311311224.",
        ".42211311311224.",
        ".42211111111224.",
        ".42214444441224.",
        ".42211111111224.",
        "..422111111224..",
        "...4221111224...",
        "....42111124....",
        "....44....44....",
        "................",
      ],
      [
        "................",
        "..44........44..",
        ".4224......4224.",
        ".422122..221224.",
        ".42211111111224.",
        ".42211111111224.",
        ".42211311311224.",
        ".42211311311224.",
        ".42211111111224.",
        ".42214444441224.",
        ".42211111111224.",
        "..422111111224..",
        "...4221111224...",
        ".4211......1124.",
        ".44..........44.",
        "................",
      ],
    ],
  },
  {
    name: "bat",
    glyph: "B",
    inks: ["#b561d1", "#4f2b82", "#ffffff", "#181532"],
    frames: [
      [
        "................",
        "4..............4",
        "42............24",
        "422..........224",
        "4222.4....4.2224",
        "4222414..4142224",
        ".42241111114224.",
        "..241331133142..",
        "...4111111114...",
        "....41133114....",
        ".....411114.....",
        ".....411114.....",
        "......4444......",
        "................",
        "................",
        "................",
      ],
      [
        "................",
        "................",
        "................",
        "................",
        ".....4....4.....",
        "....414..414....",
        "....41111114....",
        "...4133113314...",
        "..241111111142..",
        ".42241133114224.",
        "4222.411114.2224",
        "422..411114..224",
        "42....4444....24",
        "4..............4",
        "................",
        "................",
      ],
    ],
  },
  {
    name: "lizard",
    glyph: "D",
    inks: ["#61c78e", "#badecb", "#ffffff", "#193226", "#ff9f3d", "#ffe9a3"],
    frames: [
      [
        "................",
        "........4444....",
        ".......411114...",
        ".......4113314..",
        ".....441111114..",
        "....424111224...",
        "...4224111224...",
        ".....44111224...",
        "....424111224...",
        "...4224111224...",
        ".....44111224...",
        "....414111224...",
        "..4114414.424...",
        "4114..414.424...",
        ".44..4444.4444..",
        "................",
      ],
      [
        "................",
        "........4444....",
        ".......411114...",
        ".......411331455",
        ".....44111111456",
        "....424111224.5.",
        "...4224111224...",
        ".....44111224...",
        "....424111224...",
        "...4224111224...",
        ".....44111224...",
        "....414111224...",
        "..4114414..424..",
        "4114..414..424..",
        ".44..4444..4444.",
        "................",
      ],
    ],
  },
];

/**
 * Measurable properties of a sprite, so "does this look right" has an answer
 * that is not an opinion.
 *
 * Suggested as an adversarial check against reference artwork. The references
 * turned out to be unusable -- one was a JPEG, and JPEG destroys the flat
 * regions and hard edges that pixel art IS, measuring 74 colours and 87 orphan
 * pixels where a real sprite has a handful. But the measurements are worth
 * having anyway, because they caught three things in OUR art that the eye did
 * not: the bat had 18 orphan pixels and the dragon 15, against the goblin's 1.
 *
 * An orphan is an inked pixel with no neighbour of its own colour. The craft
 * writing is unanimous that these read as dirt rather than as detail, and that
 * they are the first thing lost when a sprite moves over a busy background.
 * One or two, placed deliberately, are how an eye is drawn; fifteen is noise.
 */
export interface Measured {
  readonly inks: number;
  readonly fill: number;
  readonly orphans: number;
  readonly symmetry: number;
  readonly headShare: number;
}

export function measure(rows: readonly string[]): Measured {
  const h = rows.length;
  const w = (rows[0] as string).length;
  const at = (x: number, y: number): string | null => {
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    const ch = (rows[y] as string)[x] as string;
    return ch === "." ? null : ch;
  };

  const seen = new Set<string>();
  let inked = 0;
  let orphans = 0;
  let top = h;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = at(x, y);
      if (ch === null) continue;
      inked = (inked + 1) | 0;
      seen.add(ch);
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      // EIGHT-way, not four. A one-pixel diagonal is how every slope in pixel
      // art is drawn, and a four-way test calls every pixel of one an orphan --
      // so this metric spent a while reporting 16 orphans on a bat whose only
      // crime was having wings with sloping edges. A real orphan touches
      // nothing of its own colour in any direction.
      let touching = false;
      for (let dy = -1; dy <= 1 && !touching; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (at(x + dx, y + dy) === ch) { touching = true; break; }
        }
      }
      if (!touching) orphans = (orphans + 1) | 0;
    }
  }

  let mirrored = 0;
  let both = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = at(x, y);
      const b = at(w - 1 - x, y);
      if (a === null && b === null) continue;
      both = (both + 1) | 0;
      if (a === b) mirrored = (mirrored + 1) | 0;
    }
  }

  const tall = bottom - top + 1;
  const headTo = top + Math.floor(tall * 0.45);
  let head = 0;
  for (let y = top; y <= headTo; y++) {
    for (let x = 0; x < w; x++) if (at(x, y) !== null) head = (head + 1) | 0;
  }

  return {
    inks: seen.size,
    fill: inked / (w * h),
    orphans,
    symmetry: both === 0 ? 0 : mirrored / both,
    headShare: inked === 0 ? 0 : head / inked,
  };
}

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
    // A walk beat moves the legs and nothing else, so the mass barely shifts.
    // A WING beat legitimately moves a lot of it -- that is the animation. So
    // the check is a share of the smaller frame rather than a flat count: a
    // third is a bat flapping, and half is a sprite inflating.
    const drift = Math.abs((mass[0] as number) - (mass[1] as number));
    const share = drift / Math.min(mass[0] as number, mass[1] as number);
    if (share > 0.33) {
      wrong.push(`${one.name}: frames differ by ${(share * 100) | 0}% of the smaller, too much`);
    }
    if ((mass[0] as number) < 40) wrong.push(`${one.name}: only ${mass[0]} pixels, too small`);

    for (let f = 0; f < one.frames.length; f++) {
      const seen = measure(one.frames[f] as readonly string[]);
      // Deliberate single pixels are how an eye gets drawn. A scatter of them
      // is noise, and the first thing a busy background eats.
      // Eight of them is about four eye pixels plus a few deliberate points.
      // Beyond that it is scatter.
      if (seen.orphans > 8) {
        wrong.push(`${one.name} f${f}: ${seen.orphans} orphan pixels, reads as dirt`);
      }
      // The head carries every identity signal at this size, so it gets a
      // third to a half of the drawing. Less and the face has no room.
      if (seen.headShare < 0.3) {
        wrong.push(`${one.name} f${f}: head is ${(seen.headShare * 100) | 0}% of it, too small`);
      }
    }
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
