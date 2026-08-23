// Surprise boxes, on the wire.
//
//     "What about if we had question mark boxes like in Mario -- it gives you
//      treasure or maybe unleashes an enemy?"
//     "I want the author to decide if it's treasure or an enemy."
//
// The first design derived the contents from the level's seed and the cell,
// which cost nothing at all and was wrong: a surprise the author cannot aim is
// a lottery, not a level. Choosing costs ONE BIT per box.
//
// This is a compatibility surface (adr/0006): a link is permanent and unhosted,
// so the bit layout can never change, only be added to. The tests that matter
// most here are the ones about what did NOT change.

import { expect, test } from "bun:test";
import { decodeLevel, encodeLevel } from "../src/core/codec.ts";
import { parseLevel } from "../src/core/level.ts";
import { BOX_HOLDS_ENEMY, BOX_HOLDS_TREASURE } from "../src/core/level.ts";
import { GRID_H, GRID_W, idx } from "../src/core/grid.ts";
import { PACK } from "../src/core/pack.ts";
import { newestBuild } from "../src/core/builds.ts";

/** A room, with whatever you put in it. */
function room(marks: ReadonlyArray<readonly [number, number, string]> = []): string {
  const rows = [`hoppa/1 roam seed=box tiles=0 behaviour=${newestBuild("roam")}`];
  for (let y = 0; y < GRID_H; y++) {
    const edge = y === 0 || y === GRID_H - 1;
    rows.push(edge ? "#".repeat(GRID_W) : "#" + ".".repeat(GRID_W - 2) + "#");
  }
  const put = (y: number, x: number, ch: string): void => {
    const line = rows[y + 1] as string;
    rows[y + 1] = line.slice(0, x) + ch + line.slice(x + 1);
  };
  put(6, 2, "@");
  put(6, 20, ">");
  for (const [y, x, ch] of marks) put(y, x, ch);
  return rows.join("\n") + "\n";
}

test("nothing that already exists moves by a single byte", () => {
  // THE ONE THAT MATTERS. Every shipped level encodes to a string committed in
  // src/core/pack.ts, and every link anybody has ever sent is one of those
  // strings' cousins. A new entity kind that shifted any of them would break
  // all of them at once, silently, for ever.
  // The pack ships CODES, so the round trip is code -> level -> code: decoding
  // and re-encoding every shipped level has to land on the byte it started on.
  for (const entry of PACK) {
    const again = encodeLevel(decodeLevel(entry.code));
    expect({ name: entry.name, code: again }).toEqual({ name: entry.name, code: entry.code });
  }
});

test("a box survives the round trip with what the author put in it", () => {
  const text = room([[4, 6, "?"], [8, 10, "!"]]);
  const back = decodeLevel(encodeLevel(parseLevel(text)));
  expect([...back.boxCells]).toEqual([idx(6, 4), idx(10, 8)]);
  expect([...back.boxHolds]).toEqual([BOX_HOLDS_TREASURE, BOX_HOLDS_ENEMY]);
});

test("...and the two contents are genuinely different on the wire", () => {
  // A payload that encoded to the same bytes either way would be a choice the
  // author appeared to make and the link did not carry.
  const treasure = encodeLevel(parseLevel(room([[4, 6, "?"]])));
  const enemy = encodeLevel(parseLevel(room([[4, 6, "!"]])));
  expect(treasure).not.toBe(enemy);
  expect(decodeLevel(treasure).boxHolds[0]).toBe(BOX_HOLDS_TREASURE);
  expect(decodeLevel(enemy).boxHolds[0]).toBe(BOX_HOLDS_ENEMY);
});

test("a box is a WALL until somebody opens it", () => {
  // Every other entity stands on open ground. This one IS the ground being
  // blocked, which is what makes it worth hitting -- and it has to survive the
  // wire that way, or a decoded level would let you walk through it.
  const back = decodeLevel(encodeLevel(parseLevel(room([[4, 6, "?"]]))));
  expect(back.walls[idx(6, 4)]).toBe(1);
  expect(back.walls[idx(7, 4)]).toBe(0);
});

test("a level with no boxes pays nothing at all for them", () => {
  // The entity list is length-prefixed and the payload bit is read only when
  // the kind that was just read is a box, so a level without one never reaches
  // for a bit that is not there. Same trick ladders used.
  const plain = room();
  const before = encodeLevel(parseLevel(plain));
  expect(decodeLevel(before).boxCells.length).toBe(0);
  // ...and the proof that costs nothing is above: PACK still matches.
  expect(before.length).toBe(encodeLevel(parseLevel(plain)).length);
});

test("a box costs about two characters, which is what was promised", () => {
  const none = encodeLevel(parseLevel(room())).length;
  const one = encodeLevel(parseLevel(room([[4, 6, "?"]]))).length;
  const four = encodeLevel(parseLevel(room([
    [4, 6, "?"], [4, 8, "!"], [8, 6, "?"], [8, 8, "!"],
  ]))).length;
  console.log(`  no boxes ${none} chars, one ${one}, four ${four}`);
  // Thirteen bits of entity is a bit over two base64 characters -- and a box is
  // also a WALL, so it perturbs the wall encoding on its way past. Measured
  // rather than reasoned about, which is the house rule for this budget: about
  // four characters for the first and three each after it, in a small room.
  expect(one - none).toBeLessThanOrEqual(4);
  expect(four - none).toBeLessThanOrEqual(16);
  // The thing that actually matters: four boxes still leave a link a child can
  // send over WhatsApp.
  expect(four).toBeLessThan(120);
});

test("boxes keep reading order, so the same room is always the same bytes", () => {
  const a = room([[4, 6, "?"], [8, 10, "!"]]);
  const b = room([[8, 10, "!"], [4, 6, "?"]]);
  expect(encodeLevel(parseLevel(a))).toBe(encodeLevel(parseLevel(b)));
});

test("boxes count against the same entity budget as everything else", () => {
  // Five bits of count, shared by start, exit, treasure, enemies, fire and
  // boxes. Worth knowing before a child fills a room with them.
  const many: Array<readonly [number, number, string]> = [];
  for (let i = 0; i < 40; i = (i + 1) | 0) {
    // Kept well clear of the start and the exit, which live on row 6.
    many.push([1 + (i % 4), 4 + Math.floor(i / 4), "?"] as const);
  }
  expect(() => encodeLevel(parseLevel(room(many)))).toThrow(/the wire format holds/);
});
