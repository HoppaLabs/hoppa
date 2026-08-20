// Day 5 play page: the level can now arrive in the URL.
//
// If the fragment carries a level, that is what you play -- and it is played
// under the behaviour version IT pins, not the newest one, which is the whole
// reason old engine builds stay in the bundle. Otherwise you get the built-in
// level.
//
// Input arrives from taps, swipes or arrow keys; all three feed the same
// engine.step() so the input log is identical whichever you use.
//
// The engine is chosen by the level's behaviour= field, never hardcoded here.
// That is what lets a link from day 5 onwards pin the rules it was beaten under.

import { ROAM1_LEVEL_TEXT } from "../../core/fixtures.ts";
import { PRESETS, SPENDABLE, capsToBuild, type Creature } from "../../core/creature.ts";
import { CodecError, encodeLevel } from "../../core/codec.ts";
import { levelFromHash, linkFor } from "./link.ts";
import { encodeQr, QrError } from "../../core/qr.ts";
import { loadCharacter } from "../stash.ts";
import { parseLevel } from "../../core/level.ts";
import { hashHex } from "../../core/hash.ts";
import { engineFor } from "../../engines/registry.ts";
import { Readout } from "./readout.ts";
import { Buttons, KEY_BITS, Loop, type Moving } from "./realtime.ts";
import { HELD_ACT, HELD_DOWN, HELD_LEFT, HELD_RIGHT, HELD_UP } from "../../engines/types.ts";
import { reachFor } from "../../engines/roam/v1.ts";
import {
  INPUT_DOWN,
  INPUT_LEFT,
  INPUT_RIGHT,
  INPUT_UP,
  INPUT_WAIT,
  STATUS_WON,
  type Input,
} from "../../engines/types.ts";
import { GridRenderer } from "./renderer.ts";

const BUILT_IN_NAME = "First Run";

/**
 * The share gate. Spec S12: **you cannot share a level you have not beaten.**
 *
 * It is a quality filter, a difficulty signal and a piece of trash talk in one
 * mechanic -- and it is nearly free, because beating it is what proves the level
 * is beatable at all. Nobody can send a friend something impossible.
 *
 * Beating a level is remembered, so coming back tomorrow does not take the
 * ability away. Day 9 replaces this with the real thing: the input log is
 * verified before a link is produced.
 */
const BEATEN_KEY = "hoppa.beaten.v1";

function beatenLevels(): string[] {
  try {
    const raw = window.localStorage.getItem(BEATEN_KEY);
    const list = raw === null ? [] : (JSON.parse(raw) as unknown);
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function rememberBeaten(code: string): void {
  try {
    const list = beatenLevels();
    if (!list.includes(code)) {
      // Keep the list short; it is a convenience, not a record.
      window.localStorage.setItem(BEATEN_KEY, JSON.stringify([code, ...list].slice(0, 40)));
    }
  } catch {
    // No storage is fine: you simply have to beat it again in this sitting.
  }
}

let beatenNow = false;

function hasBeatenThis(): boolean {
  return beatenNow;
}

/**
 * A real-time engine takes a bitmask of held buttons once per tick and is
 * driven by a clock; a turn-based one takes one move per press. The page
 * supports both, because a link pins its engine and old links must keep
 * working -- see docs/adr/0006.
 */
function isRealtime(engine: unknown): boolean {
  return typeof (engine as { where?: unknown }).where === "function";
}

// A level from a link, if there is one. A broken code must say so out loud
// rather than dumping the player into a different level and looking fine.
let loadError: string | null = null;
let shared: ReturnType<typeof levelFromHash> = null;
try {
  shared = levelFromHash(window.location.hash);
} catch (err) {
  loadError = err instanceof CodecError ? err.message : String(err);
}

const level = shared === null ? parseLevel(ROAM1_LEVEL_TEXT) : shared.level;
const levelName = shared === null ? BUILT_IN_NAME : shared.slug.replace(/-/g, " ");
// A character you made wins over the ready-made ones: it is yours, and it is
// the reason the spec says never to cut the drawing day.
const saved = loadCharacter();
const roster: readonly Creature[] = saved === null ? PRESETS : [saved.creature, ...PRESETS];
// A creature you drew borrows a preset's caps AND its id, so "which one is
// selected" has to be a slot in the roster. Comparing ids lights up two.
let chosenAt = 0;
let chosen: Creature = roster[0] as Creature;
// engineFor returns the Engine contract; the play page also wants the delve
// read-outs (turns, treasure), which is what this cast is for.
const build = () => engineFor(level, chosen);
let raw = build();
let engine = new Readout(raw);
let moving: Moving | null = isRealtime(raw) ? (raw as unknown as Moving) : null;
const buttons = new Buttons();
let loop: Loop | null = null;

const canvas = document.getElementById("grid") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLElement;
const pad = document.getElementById("pad") as HTMLElement;
const stage = document.getElementById("stage") as HTMLElement;
const over = document.getElementById("over") as HTMLElement;
const stable = document.getElementById("stable") as HTMLElement;
const said = document.getElementById("said") as HTMLElement;
const shareButton = document.getElementById("share") as HTMLButtonElement;
const sendIt = document.getElementById("sendit") as HTMLButtonElement;
const qrCanvas = document.getElementById("qr") as HTMLCanvasElement;
const qrHint = document.getElementById("qrhint") as HTMLElement;
const levelname = document.getElementById("levelname") as HTMLElement;
const trait = document.getElementById("trait") as HTMLElement;
const verdict = document.getElementById("verdict") as HTMLElement;
const saying = document.getElementById("saying") as HTMLElement;
const tally = document.getElementById("tally") as HTMLElement;
const renderer = new GridRenderer(canvas);

let blockedUntil = 0;

function finished(): boolean {
  return moving === null ? engine.finished() : moving.currentStatus() !== 0;
}

/**
 * Draw the share link as a QR code on the win screen.
 *
 * Drawn once, when the level is first beaten, rather than every frame: it is a
 * few thousand fills and the win screen is not the place to drop frames.
 */
let qrDrawn = false;

function paintQr(): void {
  if (qrDrawn) return;
  const base = `${window.location.origin}${window.location.pathname}`;
  const url = linkFor(level, levelName, base);

  let code;
  try {
    code = encodeQr(url);
  } catch (err) {
    // A link too long for a QR is still a link. Say nothing and show the button.
    if (!(err instanceof QrError)) throw err;
    return;
  }

  // Four modules of white all the way round, or no camera will lock on.
  const quiet = 4;
  const modules = code.size + quiet * 2;
  const scale = Math.max(2, Math.floor(Math.min(200, window.innerWidth - 80) / modules));
  const side = modules * scale;

  qrCanvas.width = side;
  qrCanvas.height = side;
  qrCanvas.style.width = `${side}px`;
  qrCanvas.style.height = `${side}px`;

  const ctx = qrCanvas.getContext("2d");
  if (ctx === null) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = "#000000";
  for (let y = 0; y < code.size; y++) {
    for (let x = 0; x < code.size; x++) {
      if (code.modules[y * code.size + x] === 1) {
        ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
      }
    }
  }

  qrCanvas.hidden = false;
  qrHint.hidden = false;
  qrDrawn = true;
}

/** Show or hide the two share buttons according to the gate. */
function paintShareGate(): void {
  const allowed = hasBeatenThis();
  shareButton.hidden = !allowed;
  sendIt.hidden = !allowed;
}

function paint(): void {
  if (moving !== null) {
    renderer.drawMoving(
      moving.render(),
      {
        ...moving.where(),
        swinging: moving.swinging(),
        blinking: moving.merciful(),
        swingLeft: moving.swingLeft(),
        swingLength: moving.swingLength(),
      },
      moving.enemyPositions(),
      reachFor(chosen),
    );
    paintMovingHud();
    return;
  }

  const blocked = engine.didBump() && performance.now() < blockedUntil;
  renderer.draw(engine.render(), blocked);

  // Every part of the HUD is optional, because an older behaviour version may
  // simply not have the idea. A day 1 link has no treasure and no alarm.
  const parts = [`<span class="${engine.tookFreeStep() ? "free" : ""}"><b>${engine.turns()}</b> turns</span>`];

  const treasure = engine.treasure();
  if (treasure !== null) {
    const done = treasure.got === treasure.total;
    parts.push(
      `<span class="${done ? "done" : "gold"}"><b>${treasure.got}/${treasure.total}</b> treasure</span>`,
    );
  }

  const alarm = engine.alarm();
  if (alarm !== null) {
    // The alarm reads as pips rather than a number: how close to caught is a
    // thing you want to see, not read.
    const pips =
      "\u25cf".repeat(alarm.level) + "\u25cb".repeat(Math.max(0, alarm.max - alarm.level));
    parts.push(`<span class="alarm alarm-${alarm.level}"><b>${pips}</b></span>`);
  }

  parts.push(`<span>${hashHex(engine.stateHash())}</span>`);
  hud.innerHTML = parts.join("");

  if (finished()) {
    const won = engine.currentStatus() === STATUS_WON;
    if (won && !beatenNow) {
      beatenNow = true;
      rememberBeaten(levelCode);
      paintShareGate();
    }
    if (won) paintQr();
    over.className = won ? "show" : "show lost";
    verdict.textContent = won ? "you win" : engine.wasCaught() ? "caught" : "oh no";
    saying.textContent = engine.message() ?? "";
    tally.textContent =
      treasure === null
        ? `${engine.turns()} turns`
        : `${engine.turns()} turns · ${treasure.got}/${treasure.total} treasure`;
  } else {
    over.className = "";
  }
}

function move(input: Input): void {
  if (finished()) return;
  engine.step(input);
  if (engine.didBump()) {
    blockedUntil = performance.now() + 140;
    navigator.vibrate?.(12);
    setTimeout(paint, 150);
  }
  // Being heard gets its own buzz: you need to feel it without looking away
  // from the guard that heard you.
  if (engine.wasSpotted() && !finished()) navigator.vibrate?.([8, 40, 8]);
  if (finished()) navigator.vibrate?.(engine.currentStatus() === STATUS_WON ? [20, 60, 20] : 200);
  paint();
}

/** The HUD for a real-time run: hearts, treasure, and a clock that ticks. */
function paintMovingHud(): void {
  const game = moving as Moving;
  const health = game.health();
  const hearts = "\u2665".repeat(health.hp) + "\u2661".repeat(Math.max(0, health.max - health.hp));
  const got = game.collectedCount();
  const total = game.treasureTotal();

  hud.innerHTML =
    `<span class="hearts hearts-${health.hp}"><b>${hearts}</b></span>` +
    `<span class="${got === total ? "done" : "gold"}"><b>${got}/${total}</b> treasure</span>` +
    `<span><b>${game.seconds()}</b>s</span>`;

  if (finished()) {
    const won = game.currentStatus() === STATUS_WON;
    if (won && !beatenNow) {
      beatenNow = true;
      rememberBeaten(levelCode);
      paintShareGate();
    }
    if (won) paintQr();
    over.className = won ? "show" : "show lost";
    verdict.textContent = won ? "you win" : "oh no";
    saying.textContent = game.message() ?? "";
    tally.textContent = `${game.seconds()} seconds · ${got}/${total} treasure`;
  } else {
    over.className = "";
  }
}

function reset(): void {
  if (loop !== null) loop.stop();
  // The code is for this level, so it survives a replay -- but the panel is
  // hidden again until the next win.
  qrCanvas.hidden = true;
  qrHint.hidden = true;
  raw = build();
  engine = new Readout(raw);
  moving = isRealtime(raw) ? (raw as unknown as Moving) : null;
  buttons.clear();
  blockedUntil = 0;
  // Only when the creature changes: stamping 256 pixels every frame is the
  // difference between smooth and not on a cheap phone.
  renderer.setSprite(chosen.sprite);
  paintStable();
  paint();

  if (moving !== null) {
    loop = new Loop(moving, buttons, paint, finished);
    loop.start();
  }
}

// --- the stable -------------------------------------------------------------

/**
 * What this creature is good and bad at, in one line a kid can act on.
 *
 * The four characteristics carry between engines, but the VERB does not:
 * strength is how hard you hit from above and how high you jump from the side.
 * Saying "hits hard" on a platformer would be a small lie, and the whole point
 * of the budget is that a kid can predict what their creature will do.
 */
const STRENGTH_WORDS: Record<string, readonly [string, string, string]> = {
  dash: ["jumps miles", "jumps all right", "can barely hop"],
  default: ["hits hard", "hits all right", "barely swings"],
};

function traitLine(creature: Creature): string {
  const build = capsToBuild(creature.caps);
  const words = STRENGTH_WORDS[level.engine] ?? (STRENGTH_WORDS.default as readonly string[]);
  const strength = build.FORCE >= 4 ? words[0] : build.FORCE >= 2 ? words[1] : words[2];
  return [
    strength,
    build.HASTE >= 4 ? "quick on its feet" : build.HASTE >= 2 ? "steady" : "slow",
    `${2 + build.GUARD} hearts`,
    build.REACH >= 4 ? "long arms" : build.REACH >= 2 ? "fair reach" : "short arms",
  ].join(" · ");
}

/**
 * The action button. A sword from above, a jump from the side -- the icon has
 * to say which, because it is the same button and a kid will press it before
 * reading anything.
 */
const SWORD_ICON = `<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
  <path d="M20 3 L21 4 L11 14 L10 13 Z" fill="#ffe9a3"/>
  <path d="M7 15 L9 17 L6 20 L4 18 Z" fill="#cdd6e0"/>
  <path d="M8.5 14.5 L9.5 15.5" stroke="#7c8899" stroke-width="2"/>
</svg>`;

const JUMP_ICON = `<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
  <path d="M12 3 L18 11 L14 11 L14 16 L10 16 L10 11 L6 11 Z" fill="#ffe9a3"/>
  <rect x="5" y="19" width="14" height="2.5" rx="1" fill="#7c8899"/>
</svg>`;

function paintActionButton(): void {
  const button = document.getElementById("wait") as HTMLButtonElement;
  const jumping = level.engine === "dash";
  button.innerHTML = jumping ? JUMP_ICON : SWORD_ICON;
  button.setAttribute("aria-label", jumping ? "jump" : "swing your sword");
}

/**
 * The one thing this creature is best at, for the button face -- as a plain
 * comparative. "Most nerve" was jargon; "Tougher" is a word a child already
 * owns. The full picture goes in the trait line underneath.
 */
function bestAt(creature: Creature): string {
  const build = capsToBuild(creature.caps);
  let best = SPENDABLE[0] as (typeof SPENDABLE)[number];
  for (const spend of SPENDABLE) {
    if (build[spend.key] > build[best.key]) best = spend;
  }
  return best.compare;
}

function paintStable(): void {
  stable.innerHTML = "";
  for (let at = 0; at < roster.length; at++) {
    const creature = roster[at] as Creature;
    const selected = at === chosenAt;
    const button = document.createElement("button");
    button.className = selected ? "on" : "";
    button.innerHTML = `<b>${creature.name}</b>${bestAt(creature)}`;
    button.setAttribute("aria-pressed", String(selected));
    button.addEventListener("click", () => {
      if (at === chosenAt) return;
      chosenAt = at;
      chosen = creature;
      reset();
    });
    stable.appendChild(button);
  }
  trait.textContent = traitLine(chosen);
}

// --- layout -----------------------------------------------------------------

function resize(): void {
  const chromeHeight = pad.offsetHeight + 110; // title, hud, padding
  renderer.fit(stage.clientWidth, Math.max(140, window.innerHeight - chromeHeight));
  paint();
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 100));

// --- taps -------------------------------------------------------------------

const BUTTONS: ReadonlyArray<readonly [string, Input]> = [
  ["up", INPUT_UP],
  ["right", INPUT_RIGHT],
  ["down", INPUT_DOWN],
  ["left", INPUT_LEFT],
  ["wait", INPUT_WAIT],
];

/** Which held-button bit each pad key maps to in a real-time game. */
const PAD_BITS: ReadonlyArray<readonly [string, number]> = [
  ["up", HELD_UP],
  ["right", HELD_RIGHT],
  ["down", HELD_DOWN],
  ["left", HELD_LEFT],
  ["wait", HELD_ACT],
];

for (const [id, input] of BUTTONS) {
  const el = document.getElementById(id) as HTMLButtonElement;
  const bit = PAD_BITS.find(([name]) => name === id)?.[1] ?? 0;

  el.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    if (moving !== null) {
      // Held, not tapped: you keep walking while your thumb is down.
      buttons.set(bit, true);
      el.setPointerCapture(ev.pointerId);
      return;
    }
    move(input);
  });
  for (const name of ["pointerup", "pointercancel", "pointerleave"]) {
    el.addEventListener(name, () => {
      if (moving !== null) buttons.set(bit, false);
    });
  }
}

(document.getElementById("reset") as HTMLButtonElement).addEventListener("click", reset);
(document.getElementById("again") as HTMLButtonElement).addEventListener("click", (ev) => {
  ev.stopPropagation();
  reset();
});

// --- swipe ------------------------------------------------------------------

let touchX = 0;
let touchY = 0;
let touching = false;
const SWIPE_MIN = 18; // px before a drag counts as a direction

stage.addEventListener("pointerdown", (ev) => {
  if (moving !== null) return;
  touching = true;
  touchX = ev.clientX;
  touchY = ev.clientY;
});

stage.addEventListener("pointerup", (ev) => {
  if (!touching) return;
  touching = false;
  const dx = ev.clientX - touchX;
  const dy = ev.clientY - touchY;
  if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? INPUT_RIGHT : INPUT_LEFT);
  else move(dy > 0 ? INPUT_DOWN : INPUT_UP);
});

stage.addEventListener("pointercancel", () => {
  touching = false;
});

// --- keys -------------------------------------------------------------------

const KEYS: Record<string, Input> = {
  ArrowUp: INPUT_UP, w: INPUT_UP, k: INPUT_UP,
  ArrowRight: INPUT_RIGHT, d: INPUT_RIGHT, l: INPUT_RIGHT,
  ArrowDown: INPUT_DOWN, s: INPUT_DOWN, j: INPUT_DOWN,
  ArrowLeft: INPUT_LEFT, a: INPUT_LEFT, h: INPUT_LEFT,
  " ": INPUT_WAIT, ".": INPUT_WAIT, x: INPUT_WAIT,
};

window.addEventListener("keyup", (ev) => {
  if (moving === null) return;
  const bit = KEY_BITS[ev.key];
  if (bit !== undefined) {
    ev.preventDefault();
    buttons.set(bit, false);
  }
});

window.addEventListener("blur", () => buttons.clear());

window.addEventListener("keydown", (ev) => {
  if (moving !== null) {
    if (ev.key === "r" && finished()) {
      ev.preventDefault();
      reset();
      return;
    }
    const bit = KEY_BITS[ev.key];
    if (bit === undefined) return;
    ev.preventDefault();
    buttons.set(bit, true);
    return;
  }

  if (ev.key === "Enter" && finished()) {
    ev.preventDefault();
    reset();
    return;
  }
  const input = KEYS[ev.key];
  if (input === undefined) return;
  ev.preventDefault();
  move(input);
  const dir = BUTTONS.find(([, i]) => i === input)?.[0];
  if (dir !== undefined) {
    const el = document.getElementById(dir) as HTMLButtonElement;
    el.classList.add("lit");
    setTimeout(() => el.classList.remove("lit"), 90);
  }
});

levelname.textContent = levelName;

// A fragment-only change does not reload a page, so opening a second link in a
// tab that already has one would otherwise leave the old level on screen.
window.addEventListener("hashchange", () => window.location.reload());

async function share(): Promise<void> {
  if (!hasBeatenThis()) {
    said.textContent = "finish the level first, then you can send it";
    return;
  }
  const base = `${window.location.origin}${window.location.pathname}`;
  const url = linkFor(level, levelName, base);
  try {
    await navigator.clipboard.writeText(url);
    said.textContent = "link copied — paste it to a friend";
  } catch {
    // Clipboard access needs a secure context and a real gesture; when it is
    // refused, showing the link is still a way to send it.
    said.textContent = url;
  }
}

shareButton.addEventListener("click", share);
sendIt.addEventListener("click", (ev) => {
  ev.stopPropagation();
  void share();
});

if (loadError !== null) {
  // The reason is real information, but "the code is damaged" is not a sentence
  // a nine-year-old should have to parse when all they did was tap a link.
  said.textContent = "that link is broken — here is the usual level instead";
}

const levelCode = encodeLevel(level);
beatenNow = beatenLevels().includes(levelCode);
paintShareGate();

renderer.setSprite(chosen.sprite);
paintActionButton();
paintStable();
resize();

// A real-time level starts running the moment the page is up: the world does
// not wait for a first press. This is the whole difference from the turn-based
// builds, so it must not be left to reset() to switch on.
if (moving !== null) {
  loop = new Loop(moving, buttons, paint, finished);
  loop.start();
}
