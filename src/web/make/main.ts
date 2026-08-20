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
import {
  PIP_BUDGET,
  PIP_MAX,
  SPENDABLE,
  WEAPONS,
  creatureFromBuild,
  spent,
  type Build,
  type Weapon,
} from "../../core/creature.ts";
import { loadCharacter, saveCharacter, startingCharacter } from "../stash.ts";
import { ChrError, decodeCharacter, encodeCharacter } from "../../core/chr.ts";
import { encodeQr, QrError } from "../../core/qr.ts";

const paper = document.getElementById("paper") as HTMLCanvasElement;
const context = paper.getContext("2d") as CanvasRenderingContext2D;
const inks = document.getElementById("inks") as HTMLElement;
const swatches = document.getElementById("swatches") as HTMLElement;
const nameField = document.getElementById("name") as HTMLInputElement;
const note = document.getElementById("note") as HTMLElement;
const stats = document.getElementById("stats") as HTMLElement;
const pointsLeft = document.getElementById("left") as HTMLElement;
const points = document.getElementById("points") as HTMLElement;
const codeBox = document.getElementById("code") as HTMLElement;
const codeQr = document.getElementById("codeqr") as HTMLCanvasElement;
const pasteBox = document.getElementById("paste") as HTMLInputElement;
const loaded = document.getElementById("loaded") as HTMLElement;
const qrWhat = document.getElementById("qrwhat") as HTMLElement;
const weaponsBox = document.getElementById("weapons") as HTMLElement;

const saved = loadCharacter() ?? startingCharacter();
let sprite: Sprite = saved.creature.sprite;
const build: Record<string, number> = { ...saved.build };
let ink = 1;
let slot = 0;
let weapon: Weapon = saved.creature.weapon;
nameField.value = saved.creature.name;

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
  paintCode();
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
      paintCode();
      paint();
    });
    swatches.appendChild(button);
  }
}

for (const index of [0, 1, 2]) {
  const button = document.getElementById(`slot${index + 1}`) as HTMLButtonElement;
  button.addEventListener("click", () => {
    slot = index;
    for (const other of [0, 1, 2]) {
      (document.getElementById(`slot${other + 1}`) as HTMLButtonElement).className =
        other === index ? "on" : "";
    }
    paintSwatches();
  });
}

// --- the rest ---------------------------------------------------------------

// --- spending the points -----------------------------------------------------

function remaining(): number {
  return (PIP_BUDGET - spent(build as Build)) | 0;
}

function paintStats(): void {
  const left = remaining();
  pointsLeft.textContent = String(left);
  points.className = left === 0 ? "none" : "";
  points.lastChild!.textContent = left === 1 ? " point to spend" : " points to spend";

  stats.innerHTML = "";
  for (const spend of SPENDABLE) {
    const value = build[spend.key] as number;

    const row = document.createElement("div");
    row.className = "stat";

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = spend.compare;

    const dots = document.createElement("span");
    dots.className = "dots";
    dots.textContent = "\u25cf".repeat(value) + "\u25cb".repeat(PIP_MAX - value);

    const less = document.createElement("button");
    less.textContent = "\u2212";
    less.disabled = value <= 0;
    less.setAttribute("aria-label", `less ${spend.label}`);
    less.addEventListener("click", () => {
      build[spend.key] = Math.max(0, value - 1);
      paintStats();
      paintCode();
    });

    const more = document.createElement("button");
    more.textContent = "+";
    more.disabled = value >= PIP_MAX || left <= 0;
    more.setAttribute("aria-label", `more ${spend.label}`);
    more.addEventListener("click", () => {
      if (remaining() <= 0) return;
      build[spend.key] = Math.min(PIP_MAX, value + 1);
      paintStats();
      paintCode();
    });

    row.append(name, dots, less, more);
    stats.appendChild(row);
  }
}

(document.getElementById("clear") as HTMLButtonElement).addEventListener("click", () => {
  sprite = { pixels: emptySprite(sprite.sub).pixels, sub: sprite.sub };
  paint();
  paintCode();
});

(document.getElementById("go") as HTMLButtonElement).addEventListener("click", () => {
  const name = nameField.value.trim().slice(0, 12) || "Me";
  const made = creatureFromBuild("yours", name, "@", build as Build, sprite, weapon);
  saveCharacter(name, build as Build, made);
  note.textContent = "saved";
  window.location.href = "../";
});

// --- sword or wand --------------------------------------------------------------
//
// Cosmetic, and said so on the page. A wand reaches exactly as far as a sword
// and hits exactly as hard -- it is here because a sword is not every child's
// idea of their own character, not because it is a third thing to balance.

const WEAPON_ART: Record<Weapon, string> = {
  sword: `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
    <path d="M12 2 L14.4 5.5 L14.4 14 L9.6 14 L9.6 5.5 Z" fill="#e2eaf2"/>
    <rect x="5.5" y="14" width="13" height="2.4" rx="1.2" fill="#8d7a5c"/>
    <rect x="10.8" y="16.4" width="2.4" height="4.2" fill="#a8b6c6"/>
    <circle cx="12" cy="21" r="1.8" fill="#8d7a5c"/>
  </svg>`,
  wand: `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
    <rect x="10.8" y="9" width="2.4" height="12.5" rx="1.2" transform="rotate(20 12 15)" fill="#e8dcf4"/>
    <path d="M12 1.5 L13.5 5.7 L17.7 7.2 L13.5 8.7 L12 12.9 L10.5 8.7 L6.3 7.2 L10.5 5.7 Z" fill="#f0e2ff"/>
    <circle cx="12" cy="7.2" r="1.5" fill="#ffffff"/>
  </svg>`,
};

/**
 * What each one does, on the button.
 *
 * This is the whole condition for letting the weapon matter. A child who picks
 * the wand because they like wands must not discover later that they picked a
 * different game -- so the choice says what it costs, and neither answer is
 * the wrong one.
 */
const WEAPON_SAYS: Record<Weapon, string> = {
  sword: "enemies gone for good, if you land the hits",
  wand: "enemies frozen on the spot, every time",
};

function paintWeapons(): void {
  weaponsBox.innerHTML = "";
  for (const choice of WEAPONS) {
    const button = document.createElement("button");
    button.className = choice === weapon ? "on" : "";
    button.setAttribute("aria-pressed", choice === weapon ? "true" : "false");
    button.innerHTML =
      `${WEAPON_ART[choice]}<span>${choice}</span>` +
      `<span class="says">${WEAPON_SAYS[choice]}</span>`;
    button.addEventListener("click", () => {
      weapon = choice;
      paintWeapons();
      paintCode();
    });
    weaponsBox.appendChild(button);
  }
}

// --- the code that IS the character -------------------------------------------

function currentCode(): string {
  const name = nameField.value.trim().slice(0, 12) || "Me";
  return encodeCharacter(name, build as Build, sprite, weapon);
}

function paintCode(): void {
  const code = currentCode();
  codeBox.textContent = code;

  try {
    const qr = encodeQr(code);
    const quiet = 4;
    const modules = qr.size + quiet * 2;
    const scale = Math.max(2, Math.floor(Math.min(180, window.innerWidth - 90) / modules));
    const side = modules * scale;
    codeQr.width = side;
    codeQr.height = side;
    codeQr.style.width = `${side}px`;
    codeQr.style.height = `${side}px`;
    const ctx = codeQr.getContext("2d");
    if (ctx !== null) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, side, side);
      ctx.fillStyle = "#000000";
      for (let y = 0; y < qr.size; y++) {
        for (let x = 0; x < qr.size; x++) {
          if (qr.modules[y * qr.size + x] === 1) {
            ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
          }
        }
      }
      codeQr.hidden = false;
      qrWhat.hidden = false;
    }
  } catch (err) {
    // A character too big for a QR still has a code to type.
    if (!(err instanceof QrError)) throw err;
    codeQr.hidden = true;
    qrWhat.hidden = true;
  }
}

(document.getElementById("copy") as HTMLButtonElement).addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentCode());
    loaded.textContent = "copied — send it to yourself";
  } catch {
    loaded.textContent = "select the code above and copy it";
  }
});

(document.getElementById("load") as HTMLButtonElement).addEventListener("click", () => {
  const typed = pasteBox.value;
  if (typed.trim().length === 0) {
    loaded.textContent = "paste a code into the box first";
    return;
  }
  try {
    const back = decodeCharacter(typed);
    sprite = back.creature.sprite;
    weapon = back.creature.weapon;
    for (const spend of SPENDABLE) build[spend.key] = back.build[spend.key];
    nameField.value = back.name;
    loaded.textContent = `${back.name} is back`;
    pasteBox.value = "";
    paintInks();
    paintSwatches();
    paintStats();
    paintWeapons();
    // Without this the box still shows the code for whatever was here BEFORE
    // the paste. On a page whose whole promise is "this code is your save
    // file", showing a stale one would hand a kid the wrong character.
    paintCode();
    paint();
  } catch (err) {
    loaded.textContent = err instanceof ChrError ? err.message : "that code did not work";
  }
});

nameField.addEventListener("input", paintCode);

paintInks();
paintSwatches();
paintStats();
paintWeapons();
paintCode();
paint();
