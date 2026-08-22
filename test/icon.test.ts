// The icon: on a home screen, in a tab, and beside a link in WhatsApp.
//
// "There's a little yellow icon that goes with the share link, can we use the
// jaeger icon instead?" -- and it was two different pictures under one
// complaint, which is why it is worth a test rather than a one-line edit:
//
//   - icon-180/192/512 were the STARTER creature, whose main ink is #ffc23d.
//     That is the yellow one, and it is what a phone shows beside a pasted
//     link. It is also the home screen icon; they are the same file.
//   - the favicon was a yellow SQUARE, four pixels of #ffc23d written inline
//     as an SVG data URI on day one and never looked at again.
//
// Both are the jaeger now, and both are drawn from the real preset sprite, so
// neither can drift away from what the game looks like.

import { expect, test } from "bun:test";
import { faviconPng, iconPng } from "../tools/icon.ts";
import { PRESETS, VANCE } from "../src/core/creature.ts";
import { starterSprite } from "../src/core/sprite.ts";

const PAGES = ["src/web/play/index.html", "src/web/make/index.html", "src/web/level/index.html"];

test("every icon is the jaeger, and not the creature it used to be", () => {
  expect([...iconPng(180)]).toEqual([...iconPng(180, VANCE.sprite)]);
  // The control: it is not simply the same bytes whatever it is given.
  expect([...iconPng(180)]).not.toEqual([...iconPng(180, starterSprite())]);
});

test("the jaeger is a real preset, so the icon is a creature you can play as", () => {
  // The whole reason the icon is drawn from a sprite rather than an art file:
  // "it looks like the thing they were playing". That is only true while the
  // thing in the icon is in the picker.
  expect(PRESETS.some((one) => one.name === VANCE.name)).toBe(true);
});

test("the tab icon fills its square, and the home screen one keeps a margin", () => {
  // A home screen rounds the corners off, so the art keeps an eighth clear all
  // round. A favicon is drawn at sixteen or twenty pixels, where an eighth
  // given away to air is an eighth of everything.
  const lit = (png: Uint8Array): number => png.length;
  expect(lit(faviconPng())).toBeGreaterThan(0);
  // 32 with no margin scales a 16-pixel sprite by exactly 2; with the margin it
  // would only manage 1, and half the square would be empty.
  expect([...faviconPng()]).toEqual([...iconPng(32, VANCE.sprite, false)]);
  expect([...faviconPng()]).not.toEqual([...iconPng(32, VANCE.sprite, true)]);
});

test("no page still carries the yellow square", async () => {
  for (const page of PAGES) {
    const html = await Bun.file(page).text();
    expect({ page, svg: html.includes("data:image/svg+xml") }).toEqual({ page, svg: false });
    expect({ page, png: /<link rel="icon" type="image\/png" href="\.\.?\/icon-32\.png">/.test(html) })
      .toEqual({ page, png: true });
  }
});

test("the tab icon is in the offline shell, so a link opened cold still has it", async () => {
  // The favicon is a file rather than a data URI now, and a file that is not in
  // the shell is a file that 404s on a plane.
  const build = await Bun.file("tools/build.ts").text();
  expect(build).toContain('"icon-32.png",');
  expect(build).toContain("await Bun.write(`${OUT}/icon-32.png`, faviconPng());");
});
