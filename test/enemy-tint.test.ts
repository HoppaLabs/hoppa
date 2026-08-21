// A creature that has noticed you is LIT. It does not get a box.
//
// Reported with a screenshot -- "When enemy sprites move there background
// changes" -- of a shark sitting in a grey rectangle, and then narrowed by the
// reporter to "I think it appears after they attack", which is what pinned it:
// the rectangle was the chasing tint.
//
//   ctx.fillStyle = "#ff8a3d"; ctx.globalAlpha = 0.28;
//   ctx.fillRect(left, top, size, size);
//
// A hard-edged square, the size of a TILE, over a sprite that is not square.
// In the dungeon it passed for a glow. Over the reef's navy it comes out
// rgb(84,73,94) -- a grey box behind the shark, exactly the one in the
// picture. The stunned flash was the same thing in white.
//
// The tint now goes into the ink of the pixels the creature occupies, so it
// lands on the creature and nowhere else.

import { expect, test } from "bun:test";
import { CHASE_MIX, CHASE_TINT, STUN_MIX, mix } from "../src/web/play/renderer.ts";
import { REEF } from "../src/core/tileset.ts";

const renderer = await Bun.file("src/web/play/renderer.ts").text();

test("mixing nothing changes nothing, and mixing everything is the tint", () => {
  expect(mix("#123456", "#abcdef", 0)).toBe("rgb(18,52,86)");
  expect(mix("#123456", "#abcdef", 1)).toBe("rgb(171,205,239)");
});

test("the tint is the same colour and strength the rectangle was", () => {
  // The READING must not change -- only where it lands. If these drift, the
  // "it has noticed you" signal a child has learned changes meaning.
  expect(CHASE_TINT).toBe("#ff8a3d");
  expect(CHASE_MIX).toBe(0.28);
  expect(STUN_MIX).toBe(0.5);
});

test("the box a phone actually showed is what these numbers produce", () => {
  // The reef's water, with the old rectangle over it. Kept as a number so the
  // report and the cause stay attached to each other.
  const water = REEF.ground;
  expect(water).toBe("#12306b");
  expect(mix(water, CHASE_TINT, CHASE_MIX)).toBe("rgb(84,73,94)");
});

test("no state is painted as a rectangle over the tile any more", () => {
  // Source-read on purpose: this is a thing you can only otherwise see by
  // being attacked underwater on a phone.
  expect(renderer).not.toContain('ctx.fillStyle = "#ff8a3d";');
  expect(renderer).not.toContain("ctx.globalAlpha = 0.28;");
  // ...and the tinted sets exist to replace them.
  expect(renderer).toContain("private enemyChasing: HTMLCanvasElement[][] = [];");
  expect(renderer).toContain("private enemyStunned: HTMLCanvasElement[][] = [];");
});

test("the stamps are rebuilt when the weapon changes, not just the world", () => {
  // The stunned tint says which thing hit it -- a wand freezes blue, a sword
  // flashes white -- so a cache keyed on the world alone would show the wrong
  // one to whoever picked the other weapon.
  expect(renderer).toContain("const key = `${this.tiles().name}/${this.weapon}`;");
});
