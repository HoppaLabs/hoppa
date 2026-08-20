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

import { ROAM4_LEVEL_TEXT } from "../../core/fixtures.ts";
import { PRESETS, capsToBuild, type Creature } from "../../core/creature.ts";
import { CodecError, encodeLevel } from "../../core/codec.ts";
import { levelFromHash, linkFor, resultFromHash, resultLinkFor, slugify } from "./link.ts";
import { encodeQr, QrError } from "../../core/qr.ts";
import { loadCharacter, loadDraft, playedBefore, rememberPlayed, setSoundOn, soundOn } from "../stash.ts";
import { Sounds, soundsFor, type Moment } from "./sound.ts";
import { draftToText } from "../../core/draft.ts";
import { parseLevel } from "../../core/level.ts";
import { colourFor } from "../../core/palette.ts";
import { SPRITE_H, SPRITE_W, spriteIndex } from "../../core/sprite.ts";
import { hashHex } from "../../core/hash.ts";
import { engineFor, UnknownBehaviourError } from "../../engines/registry.ts";
import { Readout } from "./readout.ts";
import { Recorder, beats, proofKey, type Replayable } from "../../core/proof.ts";
import { Buttons, KEY_BITS, Loop, type Moving } from "./realtime.ts";
import { HELD_ACT, HELD_DOWN, HELD_LEFT, HELD_RIGHT, HELD_SWING, HELD_UP } from "../../engines/types.ts";
import { reachFor } from "../../engines/roam/v4.ts";
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
import { goOffline } from "../offline.ts";

const BUILT_IN_NAME = "First Run";

/**
 * The share gate. Spec S12: **you cannot share a level you have not beaten.**
 *
 * It is a quality filter, a difficulty signal and a piece of trash talk in one
 * mechanic -- and it is nearly free, because beating it is what proves the
 * level is beatable at all. Nobody can send a friend something impossible.
 *
 * It used to take your word for it: the page believed it had seen you win, and
 * that belief was what opened the button. Now every input is kept, and when
 * you win the whole run is REPLAYED into a fresh engine. The button appears
 * only if that replay also wins and lands on the same stateHash.
 *
 * That is the difference between "the page thinks you won" and "here is a
 * sequence of button presses that finishes this level" -- and it is the second
 * one that makes a link worth trusting. The proof stays here and never travels
 * (spec S10 has no room for it in the URL, and the sender is who it is for).
 */
const BEATEN_KEY = "hoppa.proof.v1";

interface StoredProof {
  readonly level: string;
  readonly creature: string;
  readonly log: number[];
  readonly key: number;
}

function storedProofs(): StoredProof[] {
  try {
    const raw = window.localStorage.getItem(BEATEN_KEY);
    const list = raw === null ? [] : (JSON.parse(raw) as unknown);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (p): p is StoredProof =>
        typeof p === "object" && p !== null &&
        typeof (p as StoredProof).level === "string" &&
        typeof (p as StoredProof).creature === "string" &&
        Array.isArray((p as StoredProof).log),
    );
  } catch {
    return [];
  }
}

function keepProof(proof: StoredProof): void {
  try {
    const kept = storedProofs().filter(
      (p) => !(p.level === proof.level && p.creature === proof.creature),
    );
    // A handful is plenty; this is a convenience, not a record.
    window.localStorage.setItem(BEATEN_KEY, JSON.stringify([proof, ...kept].slice(0, 24)));
  } catch {
    // No storage is fine: you simply have to beat it again in this sitting.
  }
}

/** The run in progress, and whether a replay of it has actually won. */
let recorder = new Recorder();
let proven = false;

function hasBeatenThis(): boolean {
  return proven;
}

/** Replay what was just played. Only a win here opens the button. */
function proveIt(): boolean {
  const log = recorder.log();
  if (!beats(log, () => engineFor(level, chosen) as unknown as Replayable, STATUS_WON)) {
    return false;
  }
  keepProof({
    level: levelCode,
    creature: chosen.id,
    log: [...log],
    key: proofKey(levelCode, chosen.id, log),
  });
  return true;
}

/**
 * A proof kept from an earlier visit, re-checked rather than trusted.
 *
 * Storage is not evidence: it is re-replayed on load, so an edited entry or one
 * from a build whose rules have changed simply does not open the button.
 */
function provenBefore(): boolean {
  for (const proof of storedProofs()) {
    if (proof.level !== levelCode || proof.creature !== chosen.id) continue;
    if (proof.key !== proofKey(levelCode, chosen.id, proof.log)) continue;
    if (beats(proof.log, () => engineFor(level, chosen) as unknown as Replayable, STATUS_WON)) {
      return true;
    }
  }
  return false;
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
/**
 * A reply: somebody beat your level and sent back how fast, with the creature
 * they did it on. Spec S16 day 11, minus the watching -- a replay of a real
 * run is 1,700 to 3,000 characters and would not survive a group chat, so what
 * comes back is the outcome and the creature. See link.ts.
 */
let reply: ReturnType<typeof resultFromHash> = null;
try {
  reply = resultFromHash(window.location.hash);
  shared = reply === null
    ? levelFromHash(window.location.hash)
    : { level: reply.level, slug: reply.slug };
} catch (err) {
  loadError = err instanceof CodecError ? err.message : String(err);
}

let level = shared === null ? parseLevel(ROAM4_LEVEL_TEXT) : shared.level;
let levelName = shared === null ? BUILT_IN_NAME : shared.slug.replace(/-/g, " ");

/**
 * A link can decode perfectly and still be one no engine will run.
 *
 * The wire format holds 31 entities; an engine holds eight treasures. So a
 * hand-made level, or a link somebody edited, can survive the codec and then
 * be refused by the engine -- and that refusal used to happen while the page
 * was still starting up, which left a WHITE SCREEN and no explanation. Found
 * by the red team, with a link carrying nine gems.
 *
 * Anything at all thrown here is caught on purpose. This is the boundary
 * between a stranger's URL and the page: whatever is wrong with it, the
 * player gets a level to play and a sentence telling them why it is not the
 * one they tapped.
 */
function refuses(candidate: typeof level, creature: Creature): string | null {
  try {
    engineFor(candidate, creature);
    return null;
  } catch (err) {
    if (err instanceof UnknownBehaviourError) return err.message;
    return `that level will not run here: ${(err as Error).message}`;
  }
}

// The remix loop. On a level somebody sent you, the editor link opens THAT
// level to change rather than an empty room -- your friend's rooms, your walls.
// It is the reason the level travels in the link instead of living on a server.
const buildLink = document.getElementById("build") as HTMLAnchorElement | null;
if (buildLink !== null && shared !== null) {
  buildLink.href = `./level/#from/${encodeLevel(level)}`;
  buildLink.textContent = "edit level";
}
// A character you made wins over the ready-made ones: it is yours, and it is
// the reason the spec says never to cut the drawing day.
const saved = loadCharacter();
// Whoever beat your level comes with the reply, so you can try their creature
// against your own level. That is the point of sending one back.
const guest: readonly Creature[] = reply?.creature == null ? [] : [reply.creature];
const roster: readonly Creature[] = [
  ...(saved === null ? [] : [saved.creature]),
  ...guest,
  ...PRESETS,
];
/** Where the friend's creature sits in the row, or -1 when there is no reply. */
const guestAt = guest.length === 0 ? -1 : (saved === null ? 0 : 1);
// A creature you drew borrows a preset's caps AND its id, so "which one is
// selected" has to be a slot in the roster. Comparing ids lights up two.
let chosenAt = 0;
let chosen: Creature = roster[0] as Creature;

// ...and if it will not run, fall back to the built-in level rather than
// failing to start. Checked before anything is built from it.
const refusal = refuses(level, chosen);
if (refusal !== null) {
  loadError = refusal;
  shared = null;
  level = parseLevel(ROAM4_LEVEL_TEXT);
  levelName = BUILT_IN_NAME;
}
/**
 * Is this a level I MADE, or one I was SENT?
 *
 * Both arrive as a hash, so the URL cannot tell them apart -- and the answer
 * decides what the share button does. A level you made goes out as a level; a
 * level you were sent goes back as a time. Getting this wrong means a kid taps
 * "play" in the editor and is then offered to send their friend a scoreboard
 * for a level the friend has never seen.
 *
 * The editor keeps what you drew, so the honest question is "is this the level
 * that is in my editor?".
 */
function levelIsMine(): boolean {
  const kept = loadDraft();
  if (kept === null) return false;
  try {
    return encodeLevel(parseLevel(draftToText(kept.draft))) === encodeLevel(level);
  } catch {
    // A draft from an older build may no longer encode. That only means it is
    // not this level.
    return false;
  }
}
// A reply is always sent back: somebody put a time on your level, and the
// answer to that is your own time, not the level they have already played.
const sendingBack = reply !== null || (shared !== null && !levelIsMine());

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
const boast = document.getElementById("boast") as HTMLElement;
const sendIt = document.getElementById("sendit") as HTMLButtonElement;
const qrCanvas = document.getElementById("qr") as HTMLCanvasElement;
const qrHint = document.getElementById("qrhint") as HTMLElement;
const levelname = document.getElementById("levelname") as HTMLElement;
const trait = document.getElementById("trait") as HTMLElement;
const verdict = document.getElementById("verdict") as HTMLElement;
const saying = document.getElementById("saying") as HTMLElement;
const flash = document.getElementById("flash") as HTMLElement;
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
  // The square always carries the LEVEL, even on a run where the button sends
  // a score back -- somebody sitting next to you wants to play it, not read
  // about your time. But it is only "your level" when it actually is yours.
  qrHint.innerHTML = sendingBack
    ? "a friend's phone can scan this to play <b>this level</b>"
    : "a friend's phone can scan this to play <b>your level</b>";
  qrHint.hidden = false;
  qrDrawn = true;
}

/**
 * Sharing lives in exactly one place: the win screen, next to the QR code and
 * the score. A second button in the footer was redundant once the win screen
 * existed, and it lingered after a reload, which read as "you can share this"
 * at a moment the player had not just earned anything.
 */
function paintShareGate(): void {
  sendIt.hidden = !hasBeatenThis();
  // A level you made is sent as a level; one you were sent goes back as a
  // time. The button says which, because they are different acts.
  sendIt.textContent = sendingBack ? "send your score" : "share level";
}

// --- noise ------------------------------------------------------------------
//
// The engines are not told about any of this and must not be: an engine that
// knows about sound is an engine whose behaviour could depend on it. Every cue
// is worked out by comparing one frame's read-outs with the last, which is why
// none of it can affect a replay.

const sounds = new Sounds(soundOn());
const soundButton = document.getElementById("sound") as HTMLButtonElement;

function paintSoundButton(): void {
  soundButton.textContent = sounds.isOn() ? "sound on" : "sound off";
  soundButton.setAttribute("aria-pressed", String(sounds.isOn()));
}

soundButton.addEventListener("click", () => {
  sounds.setOn(!sounds.isOn());
  setSoundOn(sounds.isOn());
  paintSoundButton();
  if (sounds.isOn()) {
    // The tap that turns it on is also the gesture a browser wants before it
    // will let a page make a noise, so this both confirms the setting and
    // unlocks it. The winning fanfare, because it is the longest and the
    // easiest to be sure you heard.
    sounds.play("won");
    // ...and if you heard nothing, the most likely reason by far is not this
    // code. An iPhone's side switch silences web audio, and there is no way for
    // a page to ask whether it is on.
    said.textContent = "sound on — hearing nothing? check the switch on the side of your phone";
  } else {
    said.textContent = "";
  }
});
paintSoundButton();

/** What the run sounds like right now, read out rather than reported. */
function momentNow(): Moment {
  const treasure = moving === null ? engine.treasure() : null;
  return {
    hp: moving === null ? 0 : (moving as Moving).health().hp,
    treasure:
      moving === null
        ? (treasure?.got ?? 0)
        : (moving as Moving).collectedCount(),
    playing: !finished(),
    won:
      (moving === null ? engine.currentStatus() : (moving as Moving).currentStatus()) === STATUS_WON,
  };
}

let lastMoment: Moment = { hp: 0, treasure: 0, playing: true, won: false };

/** Called after every repaint, which is every tick on a real-time level. */
function listen(): void {
  const now = momentNow();
  for (const cue of soundsFor(lastMoment, now)) sounds.play(cue);
  lastMoment = now;
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
        // Side-on engines know about the ground and about falling; the ones
        // seen from above have neither idea, and get no jump animation.
        ...(airborneOf(moving)),
      },
      moving.enemyPositions(),
      reachFor(chosen),
    );
    paintMovingHud();
    listen();
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
    if (won && !proven) {
      // Not "the page saw a win", but "these presses, replayed cold, win".
      proven = proveIt();
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
  listen();
}

function move(input: Input): void {
  if (finished()) return;
  // Recorded before it is played, so the log is exactly what the engine saw.
  recorder.push(input);
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

/**
 * A line that says what just happened, and then gets out of the way.
 *
 * The engine has always produced these -- "Got it.", "Frozen solid.", "That
 * hurt." -- and nothing ever showed them outside the win screen, which is the
 * one moment they do not matter. In a real-time game they are how a child finds
 * out what their own weapon does: a sword kills and a wand freezes, and you
 * learn that from the first swing rather than from the picker.
 */
let flashUntil = 0;
function flashMessage(text: string | null): void {
  const now = performance.now();
  if (text !== null && text !== "") {
    flash.textContent = text;
    flash.className = "show";
    flashUntil = now + 900;
  } else if (now > flashUntil) {
    flash.className = "";
  }
}

/**
 * Whether this engine has a notion of being off the ground, and how fast it is
 * moving through it. Read off the engine rather than guessed from the level, so
 * a future side-on build gets the animation by exposing the same two things.
 */
function airborneOf(game: Moving): { airborne?: boolean; vy?: number } {
  const maybe = game as unknown as {
    onGround?: () => boolean;
    falling?: () => number;
    onLadder?: () => boolean;
  };
  if (typeof maybe.onGround !== "function" || typeof maybe.falling !== "function") return {};
  // A ladder is not a jump: hanging on one should not stretch you.
  const climbing = typeof maybe.onLadder === "function" && maybe.onLadder();
  return { airborne: !maybe.onGround() && !climbing, vy: maybe.falling() };
}

/** The HUD for a real-time run: hearts, treasure, and a clock that ticks. */
function paintMovingHud(): void {
  const game = moving as Moving;
  if (!finished()) flashMessage(loop === null ? null : loop.takeMessage());
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
    if (won && !proven) {
      // Not "the page saw a win", but "these presses, replayed cold, win".
      proven = proveIt();
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
  listen();
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
  // A new run needs a new log. Keeping the old one would let a losing attempt
  // inherit the presses of a winning one.
  recorder = new Recorder();
  // A new run: nothing that changed between the old one and this one is a
  // noise. Restarting is not losing four treasure.
  lastMoment = { hp: 0, treasure: 0, playing: true, won: false };
  // ...but a proof already earned still stands, including one from a previous
  // visit. Switching creature is a different run, so it is re-checked.
  proven = provenBefore();
  paintShareGate();
  // Only when the creature changes: stamping 256 pixels every frame is the
  // difference between smooth and not on a cheap phone.
  renderer.setSprite(chosen.sprite);
  renderer.setWeapon(chosen.weapon);
  renderer.setSideOn(level.engine === "dash");
  // Only the real-time engines redraw every frame. A turn-based level redraws
  // when you press something, so a spinning gem would freeze between moves.
  renderer.setSpinning(moving !== null);
  // A creature that swings a wand needs the wand on the button, not a sword.
  paintActionButton();
  paintStable();
  paint();

  if (moving !== null) {
    loop = new Loop(moving, buttons, paint, finished, (held) => recorder.push(held));
    loop.start();
  }
}

// --- the stable -------------------------------------------------------------

/**
 * What this creature is good and bad at, in one line a kid can act on.
 *
 * Strength and speed carry between engines, but the VERB does not:
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
  // Hearts follow strength, and saying so is the only way a kid finds out that
  // spending on strength buys more than a harder hit.
  //
  // Asked, never copied. This line used to compute "2 + strength" itself, which
  // was two separate lies: roam/4 hands out "3 + strength", so the picker
  // promised three hearts while the HUD drew four -- and a turn-based level has
  // no hearts at all, so it was promising hearts that were never there.
  const hearts = moving === null ? null : (moving as Moving).health().max;
  return [
    strength,
    build.HASTE >= 4 ? "quick on its feet" : build.HASTE >= 2 ? "steady" : "slow",
    ...(hearts === null ? [] : [`${hearts} hearts`]),
  ].join(" · ");
}

/**
 * The action button. A sword from above, a jump from the side -- the icon has
 * to say which, because it is the same button and a kid will press it before
 * reading anything.
 */
// Upright, with a crossguard and a pommel. The old icon was a thin diagonal
// with the blade and the grip nearly the same colour, and it read as a pencil.
const SWORD_ICON = `<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
  <path d="M12 2 L14.4 5.5 L14.4 14 L9.6 14 L9.6 5.5 Z" fill="#e2eaf2"/>
  <path d="M12 2 L12 14" stroke="#a8b6c6" stroke-width="1"/>
  <rect x="5.5" y="14" width="13" height="2.4" rx="1.2" fill="#8d7a5c"/>
  <rect x="10.8" y="16.4" width="2.4" height="4.2" fill="#a8b6c6"/>
  <circle cx="12" cy="21" r="1.8" fill="#8d7a5c"/>
</svg>`;

const WAND_ICON = `<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
  <rect x="10.8" y="9" width="2.4" height="12.5" rx="1.2" transform="rotate(20 12 15)" fill="#e8dcf4"/>
  <path d="M12 1.5 L13.5 5.7 L17.7 7.2 L13.5 8.7 L12 12.9 L10.5 8.7 L6.3 7.2 L10.5 5.7 Z" fill="#f0e2ff"/>
  <circle cx="12" cy="7.2" r="1.5" fill="#ffffff"/>
</svg>`;

const JUMP_ICON = `<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
  <path d="M12 3 L18 11 L14 11 L14 16 L10 16 L10 11 L6 11 Z" fill="#ffe9a3"/>
  <rect x="5" y="19" width="14" height="2.5" rx="1" fill="#7c8899"/>
</svg>`;

function paintActionButton(): void {
  const button = document.getElementById("wait") as HTMLButtonElement;
  const swingButton = document.getElementById("swing") as HTMLButtonElement | null;
  const jumping = level.engine === "dash";
  const wand = chosen.weapon === "wand";
  const weaponIcon = wand ? WAND_ICON : SWORD_ICON;
  const weaponSays = wand ? "wave your wand" : "swing your sword";

  button.innerHTML = jumping ? JUMP_ICON : weaponIcon;
  button.setAttribute("aria-label", jumping ? "jump" : weaponSays);

  // From the side the action button is jump, so the weapon gets its own key.
  // From above they would be the same button, so there is only one.
  if (swingButton !== null) {
    const separate = jumping && WEAPON_ENGINES.has(`${level.engine}/${level.behaviourVersion}`);
    swingButton.hidden = !separate;
    if (separate) {
      swingButton.innerHTML = weaponIcon;
      swingButton.setAttribute("aria-label", weaponSays);
    }
  }
}

/**
 * Side-on builds that have a weapon at all. dash/1 and dash/2 answer an enemy
 * only by being landed on, and showing a swing button on one of those levels
 * would offer a child a button that does nothing.
 */
const WEAPON_ENGINES: ReadonlySet<string> = new Set(["dash/3"]);


/**
 * A creature's own face, for its button.
 *
 * Three words of description tell you what a creature DOES; only the drawing
 * tells you which one is yours. That matters most for the character a kid drew
 * themselves, which otherwise sits in the row looking exactly like the presets.
 *
 * Painted at its true 16x16 and blown up by CSS with `image-rendering:
 * pixelated`, so it stays the drawing rather than becoming a smudge.
 */
function faceOf(creature: Creature): HTMLCanvasElement {
  const face = document.createElement("canvas");
  face.width = SPRITE_W;
  face.height = SPRITE_H;
  face.className = "face";
  const ctx = face.getContext("2d");
  if (ctx === null) return face;
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const colour = colourFor(creature.sprite.sub, creature.sprite.pixels[spriteIndex(x, y)] as number);
      // 0 is see-through, and the button's own background shows through it.
      if (colour === null) continue;
      ctx.fillStyle = colour;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return face;
}

function paintStable(): void {
  stable.innerHTML = "";
  stable.classList.toggle("tight", roster.length > 3);
  for (let at = 0; at < roster.length; at++) {
    const creature = roster[at] as Creature;
    const selected = at === chosenAt;
    const button = document.createElement("button");
    button.className = selected ? "on" : "";
    // The friend's creature can share a name with a preset -- if they beat your
    // level on Nim, the row has two Nims and "theirs" means nothing. Say which.
    if (at === guestAt) button.classList.add("guest");
    const words = document.createElement("span");
    words.className = "words";
    const named = document.createElement("b");
    named.textContent = creature.name;
    words.appendChild(named);
    // The face and the name, and nothing else. What a creature DOES is the
    // line underneath -- and that line says far more than the one word that
    // used to sit here ("hits hard · slow · 3 hearts" against "Stronger").
    //
    // The guest keeps a label, because it is not a description: if a friend
    // beat your level on a preset, their creature has that preset's name AND
    // its drawing, and nothing else on the button tells them apart.
    if (at === guestAt) words.appendChild(document.createTextNode("beat your level"));
    button.appendChild(faceOf(creature));
    button.appendChild(words);
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

/**
 * Everything on the page that is not the level, measured rather than guessed.
 *
 * This used to be `pad.offsetHeight + 110`, and the 110 was a constant standing
 * in for the title, the creature row and the HUD. Add a line above the picker,
 * or give a phone a fifth creature so the row wraps, and the constant is wrong
 * by exactly that much -- the body centres its overflow, so the title slides
 * off the top of the screen instead of the level getting smaller.
 */
function chromeHeight(): number {
  const style = getComputedStyle(document.body);
  const gap = Number.parseFloat(style.rowGap) || 0;
  let total =
    (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
  for (const kid of Array.from(document.body.children) as HTMLElement[]) {
    if (kid === stage) continue;
    // A hidden element is not taking up room, and must not be charged for.
    if (kid.hidden || kid.offsetParent === null) continue;
    total += kid.offsetHeight + gap;
  }
  return total;
}

function resize(): void {
  renderer.fit(stage.clientWidth, Math.max(140, window.innerHeight - chromeHeight()));
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
  ["swing", HELD_SWING],
];

for (const [id, input] of BUTTONS) {
  const el = document.getElementById(id) as HTMLButtonElement;
  const bit = PAD_BITS.find(([name]) => name === id)?.[1] ?? 0;

  el.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    // The weapon is the one noise the engine cannot be asked about: whether a
    // swing connected is state, but whether a child pressed the button is not.
    if (id === "wait" || id === "swing") sounds.play("swing");
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

/** Seconds on a real-time level, turns on a turn-based one, as the HUD shows. */
function myScore(): number {
  return moving === null ? engine.turns() : (moving as Moving).seconds();
}

/**
 * Sharing does one of two things, and which one is not a setting.
 *
 * A level you MADE gets sent as a level: here, play this. A level somebody
 * SENT you gets sent back as a result: I did it, this fast, on this creature.
 * The second is what turns a link into a conversation, and the page already
 * knows which situation it is in.
 */
async function share(): Promise<void> {
  if (!hasBeatenThis()) {
    said.textContent = "finish the level first, then you can send it";
    return;
  }
  const base = `${window.location.origin}${window.location.pathname}`;
  const url = sendingBack
    ? resultLinkFor(
        level,
        levelName,
        chosen.name,
        capsToBuild(chosen.caps),
        chosen.sprite,
        chosen.weapon,
        myScore(),
        base,
      )
    : linkFor(level, levelName, base);
  try {
    await navigator.clipboard.writeText(url);
    said.textContent = sendingBack
      ? "copied — send it back and see if they can beat your score"
      : "link copied — paste it to a friend";
  } catch {
    // Clipboard access needs a secure context and a real gesture; when it is
    // refused, showing the link is still a way to send it.
    said.textContent = url;
  }
}

sendIt.addEventListener("click", (ev) => {
  ev.stopPropagation();
  void share();
});

/**
 * The boast, at the top, before anything else happens.
 *
 * A reply is a challenge -- "I did it in 41 seconds, go on then" -- and it has
 * to be the first thing on screen or it is just a level with an odd link.
 */
if (reply !== null && reply.creature !== null) {
  const unit = moving === null ? "turns" : "seconds";
  boast.textContent = `${reply.who} beat this in ${reply.score} ${unit} — can you?`;
  boast.hidden = false;
}

if (loadError !== null) {
  // The reason is real information, but "the code is damaged" is not a sentence
  // a nine-year-old should have to parse when all they did was tap a link.
  said.textContent = "that link is broken — here is the usual level instead";
}

const levelCode = encodeLevel(level);

/**
 * The last few levels you played, as the links they arrived as.
 *
 * A level is only ever a link -- no accounts, no server, nothing to come back
 * to. The cost of that is real: play your cousin's level on Tuesday, close the
 * tab, and on Wednesday it is gone unless you still have the message. Keeping
 * the codes costs nothing and takes that cost away.
 *
 * Only levels that came from a link. The built-in one is always here, and a
 * list whose first entry is "the level you are already on" is furniture.
 */
function paintPlayed(): void {
  const row = document.getElementById("played") as HTMLElement;
  const others = playedBefore().filter((was) => was.code !== levelCode);
  row.innerHTML = "";
  if (others.length === 0) {
    row.hidden = true;
    return;
  }
  // Without this the entries read as two more buttons with no explanation.
  const label = document.createElement("span");
  label.textContent = "played before";
  row.appendChild(label);
  for (const was of others) {
    const link = document.createElement("a");
    // The same shape the link arrived as, so tapping one is exactly the same
    // act as tapping it in a message. hashchange reloads the page.
    // slugify and textContent, because this came out of storage: a tampered
    // record must not be able to put markup on the page or anything but a
    // slug in the URL.
    link.href = `#p/${slugify(was.name)}/${encodeURIComponent(was.code)}`;
    const label = document.createElement("b");
    label.textContent = was.name.replace(/-/g, " ");
    link.appendChild(label);
    row.appendChild(link);
  }
  row.hidden = false;
}

if (shared !== null) rememberPlayed(levelCode, shared.slug);
paintPlayed();

// Re-checked, not trusted: a stored proof is replayed before it counts.
proven = provenBefore();
paintShareGate();

renderer.setSprite(chosen.sprite);
renderer.setWeapon(chosen.weapon);
renderer.setSideOn(level.engine === "dash");
// Only the real-time engines redraw every frame. A turn-based level redraws
// when you press something, so a spinning gem would freeze between moves.
renderer.setSpinning(moving !== null);
paintActionButton();
paintStable();
resize();

// A real-time level starts running the moment the page is up: the world does
// not wait for a first press. This is the whole difference from the turn-based
// builds, so it must not be left to reset() to switch on.
if (moving !== null) {
  loop = new Loop(moving, buttons, paint, finished, (held) => recorder.push(held));
  loop.start();
}

// Everything above works with no network. This is what makes that true after
// the first visit as well -- see src/web/sw.ts.
goOffline("./");
