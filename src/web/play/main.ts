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

import { DAY4_LEVEL_TEXT } from "../../core/fixtures.ts";
import { PRESETS, type Creature } from "../../core/creature.ts";
import { CodecError } from "../../core/codec.ts";
import { levelFromHash, linkFor } from "./link.ts";
import { loadCreature } from "../stash.ts";
import { parseLevel } from "../../core/level.ts";
import { hashHex } from "../../core/hash.ts";
import { engineFor } from "../../engines/registry.ts";
import { Readout } from "./readout.ts";
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

const BUILT_IN_NAME = "The Three Bands";

// A level from a link, if there is one. A broken code must say so out loud
// rather than dumping the player into a different level and looking fine.
let loadError: string | null = null;
let shared: ReturnType<typeof levelFromHash> = null;
try {
  shared = levelFromHash(window.location.hash);
} catch (err) {
  loadError = err instanceof CodecError ? err.message : String(err);
}

const level = shared === null ? parseLevel(DAY4_LEVEL_TEXT) : shared.level;
const levelName = shared === null ? BUILT_IN_NAME : shared.slug.replace(/-/g, " ");
// A creature you drew wins over the presets: it is yours, and it is the reason
// the spec says never to cut day 6.
const mine = loadCreature();
const roster: readonly Creature[] = mine === null ? PRESETS : [mine, ...PRESETS];
// A creature you drew borrows a preset's caps AND its id, so "which one is
// selected" has to be a slot in the roster. Comparing ids lights up two.
let chosenAt = 0;
let chosen: Creature = roster[0] as Creature;
// engineFor returns the Engine contract; the play page also wants the delve
// read-outs (turns, treasure), which is what this cast is for.
const build = () => new Readout(engineFor(level, chosen));
let engine = build();

const canvas = document.getElementById("grid") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLElement;
const pad = document.getElementById("pad") as HTMLElement;
const stage = document.getElementById("stage") as HTMLElement;
const over = document.getElementById("over") as HTMLElement;
const stable = document.getElementById("stable") as HTMLElement;
const said = document.getElementById("said") as HTMLElement;
const levelname = document.getElementById("levelname") as HTMLElement;
const trait = document.getElementById("trait") as HTMLElement;
const verdict = document.getElementById("verdict") as HTMLElement;
const saying = document.getElementById("saying") as HTMLElement;
const tally = document.getElementById("tally") as HTMLElement;
const renderer = new GridRenderer(canvas);

let blockedUntil = 0;

function finished(): boolean {
  return engine.finished();
}

function paint(): void {
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
    over.className = won ? "show" : "show lost";
    verdict.textContent = won ? "out" : engine.wasCaught() ? "caught" : "lost";
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

function reset(): void {
  engine = build();
  blockedUntil = 0;
  // Only when the creature changes: stamping 256 pixels every frame is the
  // difference between smooth and not on a cheap phone.
  renderer.setSprite(chosen.sprite);
  paintStable();
  paint();
}

// --- the stable -------------------------------------------------------------

/**
 * What this creature is good and bad at, in one line a kid can act on.
 * Older behaviour versions ignore creatures entirely, so this says so rather
 * than promising a difference that will not arrive.
 */
function traitLine(creature: Creature): string {
  const probe = engineFor(level, creature) as unknown as {
    noise?(): number;
    alertMax?(): number;
    reachCells?(): number;
  };
  if (probe.noise === undefined) {
    return `this level was made before creatures — everyone plays it the same`;
  }
  const ceiling = probe.alertMax?.() ?? 3;
  const parts = [
    probe.noise() > 1 ? "heard from far off" : "quiet on its feet",
    `survives ${ceiling - 1} ${ceiling - 1 === 1 ? "scare" : "scares"}`,
    creature.caps.HASTE >= 128 ? "often moves for free" : "moves at one pace",
    (probe.reachCells?.() ?? 0) > 0
      ? "picks up gems from a step away"
      : "must stand on a gem to take it",
  ];
  return parts.join(" · ");
}

function paintStable(): void {
  stable.innerHTML = "";
  for (let at = 0; at < roster.length; at++) {
    const creature = roster[at] as Creature;
    const selected = at === chosenAt;
    const button = document.createElement("button");
    button.className = selected ? "on" : "";
    button.innerHTML = `<b>${creature.name}</b>MASS ${creature.caps.MASS}`;
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

for (const [id, input] of BUTTONS) {
  const el = document.getElementById(id) as HTMLButtonElement;
  el.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    move(input);
  });
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

window.addEventListener("keydown", (ev) => {
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

(document.getElementById("share") as HTMLButtonElement).addEventListener("click", async () => {
  const base = `${window.location.origin}${window.location.pathname}`;
  const url = linkFor(level, levelName, base);
  try {
    await navigator.clipboard.writeText(url);
    said.textContent = `link copied — ${url.length} characters`;
  } catch {
    // Clipboard access needs a secure context and a real gesture; when it is
    // refused, showing the link is still a way to send it.
    said.textContent = url;
  }
});

if (loadError !== null) {
  said.textContent = `that link would not open (${loadError}) — playing the built-in level instead`;
}

renderer.setSprite(chosen.sprite);
paintStable();
resize();
