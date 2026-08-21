import { expect, test } from "bun:test";
import { ENEMIES, enemyByGlyph } from "../src/core/enemies.ts";
import { ENEMIES as DRAWN, check } from "../tools/enemies.ts";
import { ENEMY_GLYPHS, GLYPH_BAT, GLYPH_DRAGON, GLYPH_GUARD, parseLevel } from "../src/core/level.ts";
import { decodeLevel, encodeLevel, levelToText } from "../src/core/codec.ts";
import { hashHex } from "../src/core/hash.ts";
import { engineFor } from "../src/engines/registry.ts";
import { PRESETS } from "../src/core/creature.ts";
import { HELD_RIGHT } from "../src/engines/types.ts";
import { SPRITE_H, SPRITE_W } from "../src/core/sprite.ts";

const renderer = await Bun.file("src/web/play/renderer.ts").text();
const levelMain = await Bun.file("src/web/level/main.ts").text();
const draft = await Bun.file("src/core/draft.ts").text();

function room(a: string, b: string, c: string): string {
  const rows = [
    "########################",
    "#......................#",
    "#......................#",
    `#...${a}......${b}......${c}....#`,
    "#......................#",
    "#..$...............$...#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#..@................>..#",
    "#......................#",
    "#......................#",
    "#......................#",
    "########################",
  ];
  return ["hoppa/1 roam seed=zoo tiles=1 behaviour=7", ...rows].join("\n") + "\n";
}

test("the art is well formed: two frames each, and they are the same creature", () => {
  // check() is the generator's own gate. The one that matters is the mass
  // comparison: a walk beat moves the LEGS, and a frame that loses a fifth of
  // its pixels reads as the animal deflating rather than stepping. It caught
  // the bat's wings-down frame at 18 pixels light.
  expect(check()).toEqual([]);
  expect(ENEMIES.length).toBe(3);
  for (const one of ENEMIES) {
    expect(one.frames.length).toBe(2);
    for (const frame of one.frames) {
      expect(frame.length).toBe(SPRITE_H);
      for (const row of frame) expect(row.length).toBe(SPRITE_W);
      expect(frame.join("").replace(/\./g, "").length).toBeGreaterThan(40);
    }
  }
});

test("an enemy may have more materials than a creature can", () => {
  // A CREATURE is three inks and has to be: it travels inside a link, and spec
  // S5 fixes it at two bits a pixel. One of those three is the outline, so a
  // creature has two materials -- which is why these read flat beside the
  // era's best work. That work is not more detailed pixel by pixel; it has
  // more distinct materials, which the hardware got from metasprites.
  //
  // An enemy travels nowhere. It is art in the bundle, and the only thing
  // holding it to three inks was drawing it with the creature machinery.
  for (const one of ENEMIES) {
    expect(one.inks.length).toBeGreaterThanOrEqual(3);
    // Nine: a row is characters and "1".."9" is what there is.
    expect(one.inks.length).toBeLessThanOrEqual(9);
    // ...and every one of them is spent. A ramp with an unused step is a step
    // that was never drawn with.
    const used = new Set(one.frames.flat().join("").split("").filter((c) => c !== "."));
    expect({ enemy: one.name, unused: one.inks.length - used.size }).toEqual({
      enemy: one.name, unused: 0,
    });
    for (const ink of one.inks) expect(ink).toMatch(/^#[0-9a-f]{6}$/);
  }
  // ...and every ink is actually drawn with. An unused colour in a budget this
  // small is a quarter of the character thrown away.
  expect(check()).toEqual([]);
});

test("what ships is what was drawn", () => {
  expect(ENEMIES.map((one) => one.name)).toEqual(DRAWN.map((one) => one.name));
  expect(ENEMIES.map((one) => one.glyph)).toEqual([...ENEMY_GLYPHS]);
});

test("a letter picks the art and nothing else", () => {
  expect(enemyByGlyph(GLYPH_GUARD)?.name).toBe("goblin");
  expect(enemyByGlyph(GLYPH_BAT)?.name).toBe("bat");
  // The third enemy is a big lizard, not a dragon. A dragon needs five things
  // to read -- horns, snout, wings, legs, eyes -- and a 16x16 frame has room
  // for about two once the outline is paid for. Every version robbed one
  // feature to pay another. Dropping the wings is what made it drawable.
  expect(enemyByGlyph(GLYPH_DRAGON)?.name).toBe("lizard");
  expect(enemyByGlyph("Z")).toBeUndefined();
});

test("all three walk, chase and die exactly alike", () => {
  // This is the whole reason three enemies needed no new behaviour version.
  // Hard rule 4: the art never reaches an engine, so a room of dragons and the
  // same room of goblins are the same run, hash for hash.
  const creature = PRESETS[0] as (typeof PRESETS)[number];
  const play = (text: string): string => {
    const engine = engineFor(parseLevel(text), creature);
    for (let i = 0; i < 240; i++) engine.step(i % 50 < 25 ? HELD_RIGHT : 0);
    return hashHex(engine.stateHash());
  };
  const goblins = play(room("G", "G", "G"));
  expect(play(room("B", "B", "B"))).toBe(goblins);
  expect(play(room("D", "D", "D"))).toBe(goblins);
  expect(play(room("G", "B", "D"))).toBe(goblins);
});

test("three kinds cost exactly what one kind cost", () => {
  // The wire format's kind field is three bits and only five of its eight
  // values were ever used, so the other two enemies were free: the same 12
  // bits an entity has always taken.
  const mixed = encodeLevel(parseLevel(room("G", "B", "D")));
  const plain = encodeLevel(parseLevel(room("G", "G", "G")));
  expect(mixed.length).toBe(plain.length);
});

test("...and the kind survives the trip through a link", () => {
  const text = room("G", "B", "D");
  const there = parseLevel(text);
  const back = decodeLevel(encodeLevel(there));
  expect([...back.guardArt]).toEqual([...there.guardArt]);
  expect([...back.guardArt]).toEqual([0, 1, 2]);
  // ...and comes back out as the letters somebody drew, not as three goblins.
  expect(levelToText(back)).toBe(levelToText(there));
});

test("every link ever sent still means what it meant", () => {
  // Kinds 0 to 4 are untouched, and a level with no bats or dragons encodes
  // exactly as it always did.
  const old = parseLevel(room("G", "G", "G"));
  expect([...old.guardArt]).toEqual([0, 0, 0]);
  expect(() => decodeLevel(encodeLevel(old))).not.toThrow();
});

test("enemies are drawn from stamps, which is what fixes the look", () => {
  // The old drawing was fillRects at fractional coordinates scaled by a
  // non-integer squash factor every frame. Sampled on the canvas, one enemy
  // held 17 distinct colours; all three together now hold 5. A stamp cannot be
  // anti-aliased, cannot be scaled by a fraction, and cannot tween.
  expect(renderer.includes("private stampEnemies(): void {")).toBe(true);
  expect(renderer.includes("ctx.drawImage(stamp, left, top, size, size);")).toBe(true);
  // Whole pixels, both axes.
  expect(renderer.includes("const left = Math.round(px(enemy.x) - size / 2);")).toBe(true);
  expect(renderer.includes("const foot = Math.round(px(enemy.y) + size / 2);")).toBe(true);
  // Stepped by distance, not by a clock: it strides while walking and stands
  // still when standing still.
  expect(renderer.includes("const travelled = ((enemy.x + enemy.y) / (ONE >> 1)) | 0;")).toBe(true);
  // ...and the squash-and-stretch is gone, along with the scaling it needed.
  expect(renderer).not.toContain("const squash = 1 - wave * 0.12;");
  expect(renderer).not.toContain("const drawW = size * squash;");
});

test("the level editor offers all three, and counts them together", () => {
  for (const label of ['label: "goblin"', 'label: "bat"', 'label: "lizard"']) {
    expect({ label, there: levelMain.includes(label) }).toEqual({ label, there: true });
  }
  // The cap is on enemies, not on each kind: the engine holds so many walking
  // things and does not care which is a bat. Per-kind counting would have let
  // a room carry thirty.
  expect(draft.includes("countOfAny(cells, ENEMY_GLYPHS) >= MAX_GUARDS")).toBe(true);
});
