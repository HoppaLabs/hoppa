// The sprite editor. Spec S5: 16x16 at 2bpp, three colours plus transparent.
//
// Spec S5 also says the pixel editor and the level editor are the same canvas
// grid interaction with different palettes, so the painting behaviour here is
// written to be lifted out on day 10 rather than rewritten.

import { PALETTE, colourFor, normaliseSubPalette } from "../../core/palette.ts";
import {
  SPRITE_H,
  SPRITE_W,
  emptySprite,
  spriteIndex,
  starterSprite,
  withPixel,
  type Sprite,
} from "../../core/sprite.ts";
import { PRESETS, reskin, type Creature } from "../../core/creature.ts";
import { loadCreature, saveCreature, buildNameOf } from "../stash.ts";

const paper = document.getElementById("paper") as HTMLCanvasElement;
const context = paper.getContext("2d") as CanvasRenderingContext2D;
const inks = document.getElementById("inks") as HTMLElement;
const swatches = document.getElementById("swatches") as HTMLElement;
const nameField = document.getElementById("name") as HTMLInputElement;
const buildButton = document.getElementById("build") as HTMLButtonElement;
const slotName = document.getElementById("slotname") as HTMLElement;
const note = document.getElementById("note") as HTMLElement;

const saved = loadCreature();
let sprite: Sprite = saved === null ? starterSprite() : saved.sprite;
let ink = 1;
let slot = 0;
let buildIndex = 0;

if (saved !== null) {
  nameField.value = saved.name;
  const name = buildNameOf(saved);
  buildIndex = Math.max(0, PRESETS.findIndex((p) => p.name === name));
}
buildButton.textContent = `body: ${(PRESETS[buildIndex] as Creature).name}`;

// --- drawing ----------------------------------------------------------------

const CELL = 20; // 16 * 20 = 320, a whole number of pixels at any zoom

function paint(): void {
  context.fillStyle = "#0d1014";
  context.fillRect(0, 0, paper.width, paper.height);

  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const value = sprite.pixels[spriteIndex(x, y)] as number;
      const colour = colourFor(sprite.sub, value);
      if (colour === null) {
        // Transparent reads as a checker, the way every pixel editor shows it.
        context.fillStyle = (x + y) % 2 === 0 ? "#141a22" : "#0f141a";
      } else {
        context.fillStyle = colour;
      }
      context.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }

  // A faint grid, so you can count squares without squinting.
  context.strokeStyle = "rgba(124,136,153,.18)";
  context.lineWidth = 1;
  for (let i = 0; i <= SPRITE_W; i++) {
    context.beginPath();
    context.moveTo(i * CELL + .5, 0);
    context.lineTo(i * CELL + .5, SPRITE_H * CELL);
    context.stroke();
    context.beginPath();
    context.moveTo(0, i * CELL + .5);
    context.lineTo(SPRITE_W * CELL, i * CELL + .5);
    context.stroke();
  }
}

function cellAt(event: PointerEvent): { x: number; y: number } {
  const box = paper.getBoundingClientRect();
  const x = Math.floor(((event.clientX - box.left) / box.width) * SPRITE_W);
  const y = Math.floor(((event.clientY - box.top) / box.height) * SPRITE_H);
  return { x, y };
}

let painting = false;

function apply(event: PointerEvent): void {
  const { x, y } = cellAt(event);
  const before = sprite.pixels[spriteIndex(x, y)];
  if (before === undefined || before === ink) return;
  sprite = withPixel(sprite, x, y, ink);
  paint();
}

paper.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  painting = true;
  paper.setPointerCapture(event.pointerId);
  apply(event);
});
paper.addEventListener("pointermove", (event) => {
  if (painting) apply(event);
});
for (const name of ["pointerup", "pointercancel", "pointerleave"]) {
  paper.addEventListener(name, () => {
    painting = false;
  });
}

// --- the four inks ----------------------------------------------------------

function paintInks(): void {
  inks.innerHTML = "";
  for (let value = 0; value <= 3; value++) {
    const button = document.createElement("button");
    button.className = value === ink ? "on" : "";
    if (value === 0) button.classList.add("none");
    else button.style.background = colourFor(sprite.sub, value) as string;
    button.setAttribute("aria-label", value === 0 ? "see-through" : `colour ${value}`);
    button.addEventListener("click", () => {
      ink = value;
      paintInks();
    });
    inks.appendChild(button);
  }
}

// --- the master palette -----------------------------------------------------

function paintSwatches(): void {
  swatches.innerHTML = "";
  for (let index = 0; index < PALETTE.length; index++) {
    const button = document.createElement("button");
    button.style.background = PALETTE[index] as string;
    button.className = sprite.sub[slot] === index ? "on" : "";
    button.setAttribute("aria-label", `palette colour ${index}`);
    button.addEventListener("click", () => {
      const sub = [...sprite.sub];
      sub[slot] = index;
      sprite = { pixels: sprite.pixels, sub: normaliseSubPalette(sub) };
      paintSwatches();
      paintInks();
      paint();
    });
    swatches.appendChild(button);
  }
}

for (const index of [0, 1, 2]) {
  const button = document.getElementById(`slot${index + 1}`) as HTMLButtonElement;
  button.addEventListener("click", () => {
    slot = index;
    slotName.textContent = String(index + 1);
    for (const other of [0, 1, 2]) {
      (document.getElementById(`slot${other + 1}`) as HTMLButtonElement).className =
        other === index ? "on" : "";
    }
    paintSwatches();
  });
}

// --- the rest ---------------------------------------------------------------

buildButton.addEventListener("click", () => {
  buildIndex = (buildIndex + 1) % PRESETS.length;
  buildButton.textContent = `body: ${(PRESETS[buildIndex] as Creature).name}`;
  note.textContent = "";
});

(document.getElementById("clear") as HTMLButtonElement).addEventListener("click", () => {
  sprite = { pixels: emptySprite(sprite.sub).pixels, sub: sprite.sub };
  paint();
});

(document.getElementById("go") as HTMLButtonElement).addEventListener("click", () => {
  const name = nameField.value.trim().slice(0, 12) || "Mine";
  const base = PRESETS[buildIndex] as Creature;
  saveCreature(name, base.name, reskin(base, name, sprite));
  note.textContent = "saved — off to the dungeon";
  window.location.href = "../";
});

paintInks();
paintSwatches();
paint();
