// The sprite editor. Spec S5: 16x16 at 2bpp, three colours plus transparent.
//
// Spec S5 also says the pixel editor and the level editor are the same canvas
// grid interaction with different palettes, so the painting behaviour here is
// written to be lifted out on day 10 rather than rewritten.

import { PALETTE, colourFor, normaliseSubPalette } from "../../core/palette.ts";
import { RUBBER_ICON } from "../icons.ts";
import { ask } from "../ask.ts";
import {
  SPRITE_H,
  SPRITE_W,
  emptySprite,
  inkedCount,
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
import { forgetCharacter, loadCharacter, saveCharacter, startingCharacter } from "../stash.ts";
import { ChrError, decodeCharacter, encodeCharacter } from "../../core/chr.ts";
import { goOffline } from "../offline.ts";
import { holdStill } from "../nozoom.ts";
import { paintLogo } from "../logo.ts";
import { GALLERY } from "../../core/gallery.ts";

// The wordmark, drawn rather than typed. See src/web/logo.ts.
//
// Two on a phone and three from a tablet up. Whole scales only -- a fractional
// one blurs pixel art, and blurred pixel art reads as a mistake.
//
// PAINTED HERE, BEFORE ANYTHING MEASURES THE PAGE. An unsized <canvas> is
// 300x150 by definition, so a logo that has not been drawn yet is a 150px-tall
// header -- and the level is fitted to whatever the header leaves. Reported as
// "the game canvas has shrunk", and measured: 140px of a 210px level, a third
// of it, given to a header that was never that tall.
const logoCanvas = document.getElementById("logo") as HTMLCanvasElement | null;
if (logoCanvas !== null) paintLogo(logoCanvas, window.innerWidth >= 560 ? 3 : 2);


const paper = document.getElementById("paper") as HTMLCanvasElement;
const context = paper.getContext("2d") as CanvasRenderingContext2D;
const inks = document.getElementById("inks") as HTMLElement;
const askBox = document.getElementById("ask") as HTMLElement;
const swatches = document.getElementById("swatches") as HTMLElement;
const inkHint = document.getElementById("inkhint") as HTMLElement;
const nameField = document.getElementById("name") as HTMLInputElement;
const note = document.getElementById("note") as HTMLElement;
const stats = document.getElementById("stats") as HTMLElement;
const pointsLeft = document.getElementById("left") as HTMLElement;
const points = document.getElementById("points") as HTMLElement;
const codeBox = document.getElementById("code") as HTMLElement;
const pasteBox = document.getElementById("paste") as HTMLInputElement;
const loaded = document.getElementById("loaded") as HTMLElement;
const weaponsBox = document.getElementById("weapons") as HTMLElement;
const galleryBox = document.getElementById("gallery") as HTMLElement;
const took = document.getElementById("took") as HTMLElement;

const saved = loadCharacter() ?? startingCharacter();
let sprite: Sprite = saved.creature.sprite;
const build: Record<string, number> = { ...saved.build };
let ink = 1;
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
    if (value === 0) {
      button.classList.add("none");
      button.innerHTML = RUBBER_ICON;
    } else button.style.background = colourFor(sprite.sub, value) as string;
    button.setAttribute("aria-label", value === 0 ? "rub out" : `colour ${value}`);
    button.addEventListener("click", () => {
      ink = value;
      paintInks();
      // The palette belongs to the pen, so picking a pen re-points it.
      paintSwatches();
    });
    inks.appendChild(button);
  }
}

// --- the master palette -----------------------------------------------------

/**
 * The palette, always open, and always pointed at the pen you are drawing with.
 *
 * There used to be two selections over the same three colours: which pen you
 * drew with, and -- on a separate row of buttons numbered 1, 2, 3 -- which
 * colour the palette was editing. Nothing tied them together, so you could be
 * drawing in one colour while the palette quietly changed another, and the page
 * never said so. Reported as "it's too confusing picking the slots", which it
 * was: it is a whole second idea to hold, for no gain.
 *
 * There is one selection now. Tap a pen; the palette IS that pen.
 *
 * It also stays open. It was folded away on day 15 with the note "fifty-four
 * swatches is a wall, and it is only wanted for the two seconds somebody spends
 * changing what one of the three colours IS" -- which is what a settings panel
 * is, and this is not one. It is the paint box, and choosing colours is most of
 * what a child comes here to do. Measured: open it costs 176px, the row of
 * numbered buttons it replaces was 44, so about 130px net on a page already two
 * screens long.
 */
function paintSwatches(): void {
  swatches.innerHTML = "";
  // The rubber is a pen with no colour. The palette stays where it is rather
  // than vanishing -- a page that changes height under a thumb gets mis-tapped
  // -- but there is nothing for it to change.
  const rubber = ink === 0;
  swatches.classList.toggle("idle", rubber);
  swatches.setAttribute("aria-disabled", String(rubber));
  inkHint.textContent = rubber ? "rubbing out, not drawing" : "tap a colour below to change it";

  for (let index = 0; index < PALETTE.length; index++) {
    const button = document.createElement("button");
    button.style.background = PALETTE[index] as string;
    button.className = !rubber && sprite.sub[ink - 1] === index ? "on" : "";
    button.setAttribute("aria-label", `palette colour ${index}`);
    button.addEventListener("click", () => {
      if (rubber) return;
      const sub = [...sprite.sub];
      sub[ink - 1] = index;
      sprite = { pixels: sprite.pixels, sub: normaliseSubPalette(sub) };
      // Changing a pen's colour repaints everything already drawn in it, which
      // is the point: it is how you try a creature in green.
      paintSwatches();
      paintInks();
      paintCode();
      paint();
    });
    swatches.appendChild(button);
  }
}

// --- somewhere to start from -------------------------------------------------

/**
 * Sixteen characters to begin with, because a blank grid is where most children
 * stop.
 *
 * They are STARTING POINTS, not choices: tapping one loads it into the editor
 * and everything about it can then be changed, which is the same call the six
 * levels made. Nothing here can reach stateHash() -- hard rule 4 -- so a
 * character begun from one of these plays exactly as one begun from nothing.
 */
function paintGallery(): void {
  galleryBox.innerHTML = "";
  for (const example of GALLERY) {
    const button = document.createElement("button");
    button.setAttribute("aria-label", `start from the ${example.name}`);
    const thumb = document.createElement("canvas");
    thumb.width = SPRITE_W;
    thumb.height = SPRITE_H;
    const pen = thumb.getContext("2d") as CanvasRenderingContext2D;
    for (let y = 0; y < SPRITE_H; y++) {
      for (let x = 0; x < SPRITE_W; x++) {
        const value = example.sprite.pixels[spriteIndex(x, y)] as number;
        const colour = colourFor(example.sprite.sub, value);
        if (colour === null) continue;
        pen.fillStyle = colour;
        pen.fillRect(x, y, 1, 1);
      }
    }
    button.appendChild(thumb);
    button.addEventListener("click", () => offer(example.name, example.sprite));
    galleryBox.appendChild(button);
  }
}

/**
 * Take one, or ask first.
 *
 * There is no undo on this page -- it says so, twice -- so replacing ten
 * minutes of drawing on one mis-tap is not a thing to do quietly. But asking
 * every time is a toll on the child this feature exists for, who has drawn
 * nothing yet. So it asks only when there is something to lose.
 */
function offer(name: string, chosen: Sprite): void {
  took.innerHTML = "";
  if (inkedCount(sprite) === 0) {
    take(name, chosen);
    return;
  }
  // The same moment on the other editor, so the same question in the same
  // place: see src/web/ask.ts.
  ask(askBox, {
    question: `Replace the character you have drawn with the ${name}?`,
    confirm: `use the ${name}`,
    cancel: "keep mine",
    onConfirm: () => take(name, chosen),
  });
}

function take(name: string, chosen: Sprite): void {
  sprite = { pixels: chosen.pixels.slice(), sub: [...chosen.sub] };
  // The pens are the taken character's colours now, so the palette has to move
  // with them or it would be pointing at a colour that is no longer there.
  paintInks();
  paintSwatches();
  paintCode();
  paint();
  took.textContent = `${name} — now change it`;
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

/**
 * Where "play as this" goes.
 *
 * Normally back to the play page, which loads the built-in level. But if you
 * came here from a level -- the play page hands the level over in the link --
 * that is where you were and that is where you want to be, with the creature
 * you just changed. Coming back to a different level is how you lose your place
 * in a game you were halfway through.
 *
 * `#back/<slug>/<code>`, which is `#p/<slug>/<code>` with a different first
 * word, so the play page reads it with the code it already has.
 */

/**
 * Keep what is on the page, continuously.
 *
 * It used to be saved in ONE place: the "play as this" button. Everything else
 * -- every stroke, every colour, every pip, the name, the weapon -- lived in a
 * variable and nowhere else, so a child who drew for ten minutes and then
 * pressed the browser's back button lost all of it. Reported exactly that way:
 * "often the user is pressing the back button and the changes are not carrying
 * over".
 *
 * The level editor has always done this for a half-drawn room. A drawing is
 * worth at least as much, and losing one is the thing that makes a child stop.
 *
 * Written on a timer rather than per pixel: a stroke is a pointermove every
 * few milliseconds and stringifying a creature into localStorage that often is
 * work for nothing. A third of a second is far below noticing and far above
 * the cost.
 */
let pending = 0;

/**
 * Nothing is written until something is actually changed.
 *
 * The page repaints the code once on load, and that repaint is not a change: it
 * would write a starter character for anybody who merely opened this page and
 * went straight back. The play page reads "is there a saved character" as "did
 * you make one" -- it is what puts YOURS at the front of the row of creatures --
 * so a first visit has to leave storage exactly as it found it.
 */
let started = false;

function flush(): void {
  if (pending !== 0) {
    window.clearTimeout(pending);
    pending = 0;
  }
  const name = nameField.value.trim().slice(0, 12) || "Me";
  saveCharacter(name, build as Build, creatureFromBuild("yours", name, "@", build as Build, sprite, weapon));
}

function keep(): void {
  if (!started) return;
  if (pending !== 0) window.clearTimeout(pending);
  pending = window.setTimeout(flush, 300);
}

// A phone does not promise to run anything when a page goes away -- iOS in
// particular can drop a backgrounded tab without ever firing unload -- so the
// last write has to happen the moment the page stops being looked at, not on
// the way out.
window.addEventListener("pagehide", flush);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flush();
});

const playAgainAt = ((): string => {
  const hash = window.location.hash;
  if (!hash.startsWith("#back/")) return "../";
  const rest = hash.slice("#back/".length);
  // A name and a level, at least. Anything else is somebody's mangled link and
  // the built-in level is a fine place to end up.
  if (rest.split("/").length < 2) return "../";
  return `../#p/${rest}`;
})();

(document.getElementById("go") as HTMLButtonElement).addEventListener("click", () => {
  const name = nameField.value.trim().slice(0, 12) || "Me";
  const made = creatureFromBuild("yours", name, "@", build as Build, sprite, weapon);
  saveCharacter(name, build as Build, made);
  note.textContent = "saved";
  window.location.href = playAgainAt;
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
  // Every change to the character -- a pixel, a pip, a colour, the name, the
  // weapon -- repaints the code, because the code IS the character. So this is
  // the one place that knows something changed, and the only place the save
  // needs hooking to. Hanging it off any smaller set of handlers is how you end
  // up with the one that got missed.
  keep();
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

nameField.addEventListener("input", () => {
  paintCode();
});

paintInks();
paintSwatches();
paintGallery();
paintStats();
paintWeapons();
paintCode();
paint();

// Everything from here on is somebody changing something, and is kept.
started = true;

// --- starting over ----------------------------------------------------------
//
// Asked for after a character had been fiddled with past the point of wanting
// it. There was no way back: the page loads whatever is in storage, so a
// creature you had gone off could only be drawn over, never dropped.
//
// It is genuinely destructive -- the drawing goes, and spec §5b is blunt that
// the code is the only copy -- so it takes two taps and says so in between. A
// dialog would be the other way to do it; two taps is one fewer thing for a
// nine-year-old to read.

const forget = document.getElementById("forget") as HTMLButtonElement;
const forgotten = document.getElementById("forgotten") as HTMLElement;
let armed = false;

forget.addEventListener("click", () => {
  if (!armed) {
    armed = true;
    forget.classList.add("sure");
    forget.textContent = "tap again to forget it";
    forgotten.textContent = "the code above is the only copy — last chance to keep it";
    return;
  }

  forgetCharacter();
  const fresh = startingCharacter();
  sprite = fresh.creature.sprite;
  weapon = fresh.creature.weapon;
  for (const spend of SPENDABLE) build[spend.key] = fresh.build[spend.key];
  nameField.value = fresh.creature.name;

  armed = false;
  forget.classList.remove("sure");
  forget.textContent = "forget this character";
  forgotten.textContent = "gone — this is a blank one";

  paintInks();
  paintSwatches();
  paintStats();
  paintWeapons();
  // The code has to follow the character, or the box would still show the save
  // file for something that no longer exists.
  paintCode();
  paint();
});

// Everything above works with no network. This is what makes that true after
// the first visit as well -- see src/web/sw.ts.
holdStill();

goOffline("../");
