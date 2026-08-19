// Day 4 play page: pick a creature, then collect the treasure, dodge the
// patrols, and get out. The level and the rules do not change between creatures
// -- only the eight numbers do, and that is the whole demonstration.
//
// Input arrives from taps, swipes or arrow keys; all three feed the same
// engine.step() so the input log is identical whichever you use.
//
// The engine is chosen by the level's behaviour= field, never hardcoded here.
// That is what lets a link from day 5 onwards pin the rules it was beaten under.

import { DAY4_LEVEL_TEXT } from "../../core/fixtures.ts";
import { PRESETS, type Creature } from "../../core/creature.ts";
import { parseLevel } from "../../core/level.ts";
import { hashHex } from "../../core/hash.ts";
import { engineFor } from "../../engines/registry.ts";
import type { DelveV4 } from "../../engines/delve/v4.ts";
import {
  INPUT_DOWN,
  INPUT_LEFT,
  INPUT_RIGHT,
  INPUT_UP,
  INPUT_WAIT,
  STATUS_PLAYING,
  STATUS_WON,
  type Input,
} from "../../engines/types.ts";
import { GridRenderer } from "./renderer.ts";

const level = parseLevel(DAY4_LEVEL_TEXT);
let chosen: Creature = PRESETS[0] as Creature;
// engineFor returns the Engine contract; the play page also wants the delve
// read-outs (turns, treasure), which is what this cast is for.
const build = () => engineFor(level, chosen) as unknown as DelveV4;
let engine = build();

const canvas = document.getElementById("grid") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLElement;
const pad = document.getElementById("pad") as HTMLElement;
const stage = document.getElementById("stage") as HTMLElement;
const over = document.getElementById("over") as HTMLElement;
const stable = document.getElementById("stable") as HTMLElement;
const trait = document.getElementById("trait") as HTMLElement;
const verdict = document.getElementById("verdict") as HTMLElement;
const saying = document.getElementById("saying") as HTMLElement;
const tally = document.getElementById("tally") as HTMLElement;
const renderer = new GridRenderer(canvas);

let blockedUntil = 0;

function finished(): boolean {
  return engine.currentStatus() !== STATUS_PLAYING;
}

function paint(): void {
  const blocked = engine.didBump() && performance.now() < blockedUntil;
  renderer.draw(engine.render(), blocked);

  const got = engine.collectedCount();
  const total = engine.treasureTotal();
  const alert = engine.alertLevel();
  const max = engine.alertMax();
  // The alarm reads as pips rather than a number: how close to caught is a
  // thing you want to see, not read.
  const pips = "\u25cf".repeat(alert) + "\u25cb".repeat(Math.max(0, max - alert));
  hud.innerHTML =
    `<span class="${engine.tookFreeStep() ? "free" : ""}"><b>${engine.turns()}</b> turns</span>` +
    `<span class="${got === total ? "done" : "gold"}"><b>${got}/${total}</b> treasure</span>` +
    `<span class="alarm alarm-${alert}"><b>${pips}</b></span>` +
    `<span>${hashHex(engine.stateHash())}</span>`;

  if (finished()) {
    const won = engine.currentStatus() === STATUS_WON;
    over.className = won ? "show" : "show lost";
    verdict.textContent = won ? "out" : engine.wasCaught() ? "caught" : "lost";
    saying.textContent = engine.message() ?? "";
    tally.textContent = `${engine.turns()} turns · ${got}/${total} treasure`;
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
  paintStable();
  paint();
}

// --- the stable -------------------------------------------------------------

/** What this creature is good and bad at, in one line a kid can act on. */
function traitLine(creature: Creature): string {
  const probe = engineFor(level, creature) as unknown as DelveV4;
  const parts = [
    probe.noise() > 1 ? "heard from far off" : "quiet on its feet",
    `survives ${probe.alertMax() - 1} ${probe.alertMax() - 1 === 1 ? "scare" : "scares"}`,
    creature.caps.HASTE >= 128 ? "often moves for free" : "moves at one pace",
    probe.reachCells() > 0 ? "picks up gems from a step away" : "must stand on a gem to take it",
  ];
  return parts.join(" · ");
}

function paintStable(): void {
  stable.innerHTML = "";
  for (const creature of PRESETS) {
    const button = document.createElement("button");
    button.className = creature.id === chosen.id ? "on" : "";
    button.innerHTML = `<b>${creature.name}</b>MASS ${creature.caps.MASS}`;
    button.setAttribute("aria-pressed", String(creature.id === chosen.id));
    button.addEventListener("click", () => {
      if (creature.id === chosen.id) return;
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

paintStable();
resize();
