// Day 1 play page: one coloured square, one grid, walls that stop you.
// Input arrives from taps, swipes or arrow keys; all three feed the same
// engine.step() so the input log is identical whichever you use.

import { DAY1_LEVEL_TEXT } from "../../core/fixtures.ts";
import { parseLevel } from "../../core/level.ts";
import { hashHex } from "../../core/hash.ts";
import { DelveV1 } from "../../engines/delve/v1.ts";
import {
  INPUT_DOWN,
  INPUT_LEFT,
  INPUT_RIGHT,
  INPUT_UP,
  type Input,
} from "../../engines/types.ts";
import { GridRenderer } from "./renderer.ts";

const level = parseLevel(DAY1_LEVEL_TEXT);
let engine = new DelveV1(level);

const canvas = document.getElementById("grid") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLElement;
const pad = document.getElementById("pad") as HTMLElement;
const stage = document.getElementById("stage") as HTMLElement;
const renderer = new GridRenderer(canvas);

let moves = 0;
let blockedUntil = 0;

function paint(): void {
  const blocked = engine.didBump() && performance.now() < blockedUntil;
  renderer.draw(engine.render(), blocked);
  const { x, y } = engine.position();
  hud.innerHTML = `<b>${moves}</b> moves &middot; (${x},${y}) &middot; ${hashHex(engine.stateHash())}`;
}

function move(input: Input): void {
  engine.step(input);
  moves++;
  if (engine.didBump()) {
    blockedUntil = performance.now() + 140;
    navigator.vibrate?.(12);
    setTimeout(paint, 150);
  }
  paint();
}

function reset(): void {
  engine = new DelveV1(level);
  moves = 0;
  paint();
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
];

for (const [id, input] of BUTTONS) {
  const el = document.getElementById(id) as HTMLButtonElement;
  el.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    move(input);
  });
}

(document.getElementById("reset") as HTMLButtonElement).addEventListener("click", reset);

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
};

window.addEventListener("keydown", (ev) => {
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

resize();
