// A creature that has noticed you is LIT. It does not get a box, and it does
// not change colour.
//
// Two reports, five days apart, about the same three lines of drawing code.
//
// The first came with a screenshot -- "when enemy sprites move their background
// changes" -- of a shark sitting in a grey rectangle, narrowed by the reporter
// to "I think it appears after they attack", which is what pinned it:
//
//   ctx.fillStyle = "#ff8a3d"; ctx.globalAlpha = 0.28;
//   ctx.fillRect(left, top, size, size);
//
// A hard-edged square, the size of a TILE, over a sprite that is not square. In
// the dungeon it passed for a glow; over the reef's navy it came out
// rgb(84,73,94), which is the grey box in the picture. So the tint moved into
// the ink of the pixels the creature occupies, and landed on the creature.
//
// The second: "the shark ... seems to go browner for some reason". It did.
// Twenty-eight percent of #ff8a3d through a slate-blue body and a near-black
// rim is brown twice over -- the rim came out rgb(79,49,31), milk chocolate,
// and the rim is a third of the pixels at sixteen across. The tint had been
// drawn against a green goblin, where warmer reads as angrier, and never looked
// at against anything cold.
//
// So now only the OUTLINE changes and the body is left exactly alone.

import { expect, test } from "bun:test";
import { CHASE_RIM, OUTLINE_INK, STUN_MIX, chaseInks, mix } from "../src/web/play/renderer.ts";
import { CASTS, ENEMIES } from "../src/core/enemies.ts";
import { REEF } from "../src/core/tileset.ts";

const renderer = await Bun.file("src/web/play/renderer.ts").text();

test("mixing nothing changes nothing, and mixing everything is the tint", () => {
  expect(mix("#123456", "#abcdef", 0)).toBe("rgb(18,52,86)");
  expect(mix("#123456", "#abcdef", 1)).toBe("rgb(171,205,239)");
});

test("chasing changes the rim and NOTHING else, on every creature in the game", () => {
  // This is the whole report. A creature that has noticed you must still be
  // recognisably itself: a shark that goes brown is a different fish.
  const casts = [...Object.entries(CASTS), ["fallback", ENEMIES] as const];
  for (const [world, cast] of casts) {
    for (const one of cast as readonly { name: string; inks: readonly string[] }[]) {
      const lit = chaseInks(one.inks);
      const body = one.inks.filter((_, at) => at !== OUTLINE_INK);
      expect({ who: `${world}/${one.name}`, body: lit.filter((_, at) => at !== OUTLINE_INK) })
        .toEqual({ who: `${world}/${one.name}`, body });
      expect({ who: `${world}/${one.name}`, rim: lit[OUTLINE_INK] })
        .toEqual({ who: `${world}/${one.name}`, rim: CHASE_RIM });
    }
  }
});

test("the brown the report described is what the old numbers actually produced", () => {
  // Kept as numbers so the report and its cause stay attached to each other.
  // The shark's rim, and its darkest body ink, under the tint that shipped.
  expect(mix("#0b0f14", "#ff8a3d", 0.28)).toBe("rgb(79,49,31)");
  expect(mix("#2b3a4a", "#ff8a3d", 0.28)).toBe("rgb(102,80,70)");
  // ...and the grey box from the report before it, over the reef's water.
  expect(REEF.ground).toBe("#12306b");
  expect(mix(REEF.ground, "#ff8a3d", 0.28)).toBe("rgb(84,73,94)");
});

test("the rim is ink 5 in every cast, which is why picking it by index is safe", () => {
  // tools/enemies.ts writes the digit 6 on every edge pixel at emit time, so
  // ink 5 is the outline by construction rather than by luck. If a cast ever
  // arrives with a different arrangement, chaseInks() paints the wrong pixels
  // and nobody would see it until that world shipped.
  const lum = (hex: string): number => {
    const n = Number.parseInt(hex.slice(1), 16);
    return ((n >>> 16 & 255) * 299 + (n >>> 8 & 255) * 587 + (n & 255) * 114) / 1000;
  };
  const casts = [...Object.entries(CASTS), ["fallback", ENEMIES] as const];
  for (const [world, cast] of casts) {
    for (const one of cast as readonly { name: string; inks: readonly string[] }[]) {
      const darkest = one.inks.reduce((best, ink, at) => (lum(ink) < lum(one.inks[best] as string) ? at : best), 0);
      expect({ who: `${world}/${one.name}`, darkest }).toEqual({ who: `${world}/${one.name}`, darkest: OUTLINE_INK });
    }
  }
});

test("the stun flash still MIXES, because a frozen thing is a different thing", () => {
  // Stunned is not "angrier", it is "hit by that": a wand freezes blue, a
  // sword flashes white, and washing the whole creature is the point there.
  expect(STUN_MIX).toBe(0.5);
  expect(renderer).toContain("const stun = this.weapon === \"wand\" ? \"#7fd8ee\" : \"#ffffff\";");
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
  expect(renderer).toContain("const key = `${this.tiles().name}/${this.weapon}`;");
});
