// Every side-on creature is drawn facing RIGHT.
//
// "The ducks are moving in the wrong direction" -- "sorry, seagulls".
//
// It is a contract with the renderer, not a style note. src/web/play/facing.ts
// mirrors a sprite when the thing is walking LEFT and leaves it alone
// otherwise, which is only correct if the art faces right to begin with. The
// shark and the gull did not.
//
// Nobody could tell for a long time, and the reason is worth keeping: until
// day 21 the top-down engines never mirrored anything at all, so every
// creature faced one fixed way and was wrong about half the time by accident.
// The moment enemies started actually turning, the two backwards ones turned
// confidently and pointlessly, which is far more noticeable than never turning.
//
// WHAT THIS CAN AND CANNOT DO. There is no way to ask a grid of digits which
// way it is looking. So each creature below names a LANDMARK -- an ink that
// only appears at the front of that animal -- and the landmark was checked by
// eye once, against a rendered sheet, at the size a phone draws it. That makes
// this a test of the ones we know about, and no help at all for a creature
// nobody has added here. A front-on creature (a bear, a jellyfish, a goblin)
// is exempt: mirroring it is invisible.

import { expect, test } from "bun:test";
import { CASTS, ENEMIES } from "../src/core/enemies.ts";

interface Cast { readonly name: string; readonly frames: readonly (readonly string[])[]; readonly inks: readonly string[] }

/** The creatures with a nose and a tail, and the ink that marks the nose. */
const SIDE_ON: ReadonlyArray<{
  world: string; name: string; ink: string; landmark: string; rows?: readonly number[];
}> = [
  // The shark's one white mark is its eye -- there is a whole comment in the
  // generator about it having briefly had two.
  { world: "reef", name: "shark", ink: "5", landmark: "the eye" },
  // The gull's orange is its beak, in the top half; the same ink draws its
  // feet lower down, so this looks only where the head is.
  { world: "beach", name: "gull", ink: "5", landmark: "the beak", rows: [0, 8] },
  // The lizard was already right, and is here as the control: if the rule
  // itself were inverted, this one would fail. Ink 5 is the white of its eye
  // -- four pixels in the whole drawing, and all of them in its head. NOT ink
  // 6, which is the outline and runs edge to edge: a landmark that is
  // everywhere measures nothing, and picking it first is how this test caught
  // itself before it caught anything else.
  { world: "fallback", name: "lizard", ink: "5", landmark: "the eye" },
];

function castOf(world: string): readonly Cast[] {
  if (world === "fallback") return ENEMIES as readonly Cast[];
  return (CASTS as Record<string, readonly Cast[]>)[world] as readonly Cast[];
}

/** Every column the landmark ink appears in, within the rows that matter. */
function columns(one: Cast, ink: string, rows: readonly number[] | undefined): number[] {
  const from = rows?.[0] ?? 0;
  const to = rows?.[1] ?? 16;
  const found: number[] = [];
  for (const frame of one.frames) {
    for (let y = from; y < to; y = (y + 1) | 0) {
      const row = frame[y] as string;
      for (let x = 0; x < 16; x = (x + 1) | 0) {
        if (row[x] === ink) found.push(x);
      }
    }
  }
  return found;
}

test("the nose of every side-on creature is on the RIGHT of its tile", () => {
  for (const who of SIDE_ON) {
    const one = castOf(who.world).find((c) => c.name === who.name);
    expect({ who: who.name, found: one !== undefined }).toEqual({ who: who.name, found: true });
    const found = columns(one as Cast, who.ink, who.rows);
    // The landmark has to exist, or the test is checking nothing at all --
    // which is how a mirrored sprite would sail through a lazier version of
    // this: no pixels, no failures.
    expect({ who: `${who.name} ${who.landmark}`, marks: found.length > 0 })
      .toEqual({ who: `${who.name} ${who.landmark}`, marks: true });
    const leftmost = Math.min(...found);
    expect({ who: `${who.name} ${who.landmark}`, leftmostColumn: leftmost > 7 })
      .toEqual({ who: `${who.name} ${who.landmark}`, leftmostColumn: true });
  }
});

test("the renderer only mirrors when walking left, which is what the rule serves", async () => {
  // The other end of the contract. If this ever flips, every sprite in the
  // game is backwards and this file is why.
  const facing = await Bun.file("src/web/play/facing.ts").text();
  expect(facing).toContain("this.face[seat] = x > before ? 1 : -1;");
  expect(facing).toContain("return this.face[seat] ?? 1;");
  const renderer = await Bun.file("src/web/play/renderer.ts").text();
  expect(renderer).toContain("const mirrored = this.facing.of(seat, enemy.x) < 0;");
});

test("the rule is written where the art is authored, not only here", async () => {
  // A convention that lives in a test file is a convention nobody drawing a
  // creature will ever read.
  const generator = await Bun.file("tools/enemies.ts").text();
  expect(generator).toContain("EVERY SIDE-ON CREATURE IS DRAWN FACING RIGHT.");
});
