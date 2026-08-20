import { expect, test } from "bun:test";
import { GALLERY } from "../src/core/gallery.ts";
import { GALLERY as DRAWN, check } from "../tools/gallery.ts";
import { PALETTE, colourFor } from "../src/core/palette.ts";
import {
  SPRITE_H, SPRITE_PIXELS, SPRITE_W, inkedCount, pixelsToText, spriteFromRows,
} from "../src/core/sprite.ts";

const make = await Bun.file("src/web/make/main.ts").text();
const html = await Bun.file("src/web/make/index.html").text();

test("the art is well formed and every one of them can be seen", () => {
  // check() is the generator's own gate: right size, drawable glyphs, real
  // palette indices, and -- the one that matters -- a body colour that stands
  // out from the square it is drawn on. Four of the first fourteen failed it:
  // the star was #1a212b on #222a35, which is 1.1:1 and simply invisible.
  expect(check()).toEqual([]);
});

test("sixteen, because fourteen leaves a hole in the last row", () => {
  // Reported as "looks like you are missing a character, there is a blank
  // slot". Sixteen fills a grid of two, four or eight; fourteen fills none of
  // them, and the gap reads as a character that failed to load.
  expect(GALLERY.length).toBe(16);
  expect(GALLERY.length % 4).toBe(0);
  expect(html).toContain("grid-template-columns: repeat(4, 1fr)");
});

test("what ships is what was drawn", () => {
  // The art is written as glyphs because that is the only form anybody can
  // read in a diff on a phone; the bundle gets it packed. If they drift, the
  // character somebody starts from is not the one anybody looked at.
  expect(GALLERY.length).toBe(DRAWN.length);
  for (let at = 0; at < DRAWN.length; at++) {
    const source = DRAWN[at] as (typeof DRAWN)[number];
    const shipped = GALLERY[at] as (typeof GALLERY)[number];
    expect({ at, name: shipped.name }).toEqual({ at, name: source.name });
    expect(pixelsToText(shipped.sprite)).toBe(
      pixelsToText(spriteFromRows(source.rows, source.sub)),
    );
  }
});

test("...and packed, because a bundle is downloaded on mobile data", () => {
  // Sixteen sprites as glyph rows is about four kilobytes. Same trade as the
  // level pack, same reason -- docs/adr/0030.
  const shipped = Bun.file("src/core/gallery.ts").size;
  expect(shipped).toBeLessThan(4000);
  expect(Bun.file("tools/gallery.ts").size).toBeGreaterThan(shipped);
});

test("every character has a name, a face, and three real colours", () => {
  const names = new Set<string>();
  for (const one of GALLERY) {
    expect(one.name).toMatch(/^[a-z]+$/);
    expect(names.has(one.name)).toBe(false);
    names.add(one.name);
    expect(one.sprite.pixels.length).toBe(SPRITE_PIXELS);
    expect(one.sprite.sub.length).toBe(3);
    for (const index of one.sprite.sub) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(PALETTE.length);
    }
    // Something is actually drawn, and see-through stays see-through.
    expect(inkedCount(one.sprite)).toBeGreaterThan(40);
    expect(colourFor(one.sprite.sub, 0)).toBeNull();
  }
});

test("they are starting points, so taking one moves the pens with it", () => {
  // The taken character's colours ARE the three pens now. Leaving the palette
  // where it was would point it at a colour no longer on the page.
  expect(make.includes("function take(name: string, chosen: Sprite): void {")).toBe(true);
  expect(make.includes("sprite = { pixels: chosen.pixels.slice(), sub: [...chosen.sub] };")).toBe(
    true,
  );
  const body = make.slice(make.indexOf("function take("), make.indexOf("// --- the rest"));
  for (const call of ["paintInks();", "paintSwatches();", "paintCode();", "paint();"]) {
    expect({ call, made: body.includes(call) }).toEqual({ call, made: true });
  }
});

test("it asks before it destroys, and only when there is something to destroy", () => {
  // There is no undo on this page -- it says so twice -- so replacing ten
  // minutes of drawing on one mis-tap is not a thing to do quietly. But asking
  // every time is a toll on the child this feature exists for, who has drawn
  // nothing yet.
  expect(make.includes("if (inkedCount(sprite) === 0) {")).toBe(true);
  expect(make.includes("replace what you have drawn with the")).toBe(true);
  expect(make.includes('no.textContent = "keep mine";')).toBe(true);
});

test("a thumbnail is drawn from the sprite, never from a picture of one", () => {
  // Same pixels, same palette, same colourFor as the big canvas -- so a
  // thumbnail cannot disagree with what you get when you tap it.
  expect(make.includes("colourFor(example.sprite.sub, value)")).toBe(true);
  expect(make.includes("thumb.width = SPRITE_W;")).toBe(true);
  expect(SPRITE_W * SPRITE_H).toBe(SPRITE_PIXELS);
});
