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

import { PACK } from "../../core/pack.ts";
import { PIP_MAX, PRESETS, capsToBuild, sameCreature, type Creature } from "../../core/creature.ts";
import { CodecError, decodeLevel, encodeLevel } from "../../core/codec.ts";
import {
  challengeFromHash, challengeLinkFor, levelFromHash, linkFor, resultFromHash, resultLinkFor,
  slugify,
} from "./link.ts";
import { paintQrOnto } from "../qrpaint.ts";
import { loadCharacter, loadDraft, setSoundOn, soundOn } from "../stash.ts";
import { Sounds, soundsFor, type Moment } from "./sound.ts";
import { aPlace as isAPlace, draftToText } from "../../core/draft.ts";
import { parseLevel } from "../../core/level.ts";
import { colourFor } from "../../core/palette.ts";
import { SPRITE_H, SPRITE_W, spriteIndex } from "../../core/sprite.ts";
import { hashHex } from "../../core/hash.ts";
import { engineFor, UnknownBehaviourError } from "../../engines/registry.ts";
import { Readout } from "./readout.ts";
import { Recorder, beats, proofKey, replay, type Replayable } from "../../core/proof.ts";
import { Buttons, KEY_BITS, Loop, type Moving } from "./realtime.ts";
import { HELD_ACT, HELD_DOWN, HELD_LEFT, HELD_NONE, HELD_RIGHT, HELD_SWING, HELD_UP } from "../../engines/types.ts";
import { reachFor } from "../../engines/roam/v5.ts";
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
import { weaponArt, weaponSays } from "./weapon.ts";
import { goOffline } from "../offline.ts";
import { holdStill } from "../nozoom.ts";
import { paintLogo } from "../logo.ts";
import { bucketHelps, hasWater } from "./water.ts";
import { SURFACE_ROW, Surfacer, above, surfaceSays } from "./surface.ts";
import { ONE } from "../../core/fixed.ts";
import { tilesetFor } from "../../core/tileset.ts";
import { sendLink } from "../send.ts";
import { inviteText } from "../invite.ts";
import { AIR_QUIET, breathPips, breathWarning, type Breath } from "./breath.ts";
import { keepsFresh, scoreFromTicks } from "./best.ts";
import { PAD_MASK, heldFor } from "./dpad.ts";
import { TILE_FLOW, TILE_LADDER } from "../../core/tiles.ts";


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
/** Whether THIS run has been replayed yet. Cleared by reset(); see proveIt(). */
let provedThisRun = false;

/**
 * A place, rather than a level.
 *
 * Almost every difference the garden makes to this page hangs off this one
 * question: there is no clock, no hearts, no win screen and no share gate,
 * because there is nothing to win, nothing to lose and nothing to prove.
 */
function aPlace(): boolean {
  // The version matters: calm/1 is somewhere to be, calm/2 is a level wearing
  // a garden. See src/core/draft.ts and adr/0045.
  return isAPlace(level.engine, level.behaviourVersion);
}

/**
 * Whether the button is offered at all -- which is now: always.
 *
 * THE SHARE GATE IS OPEN. "You cannot share a level you haven't beaten" was
 * spec S12 and one of the founding mechanics, and it came down to this:
 *
 *   "the kids want to share a level even if they haven't played it"
 *
 * It was already half-open. A garden was let through, on the grounds that the
 * gate is "the biggest wall in front of the youngest player, who can paint
 * long before they can finish a room" -- and that argument was never about
 * gardens. It is about six-year-olds, and it applies to every room they draw.
 *
 * What the gate bought was "nobody receives an impossible level". Most of that
 * is kept without it: L1-L5 still refuse a level with no way out or treasure
 * walled off from the start, and the editor still shows a bot playing the room
 * on demand. What is genuinely given up is the guarantee for a level that
 * passes every check and is still too hard for anyone -- and the honest answer
 * to that is the message, which now says whether it has been beaten. See
 * adr/0046.
 */
function hasBeatenThis(): boolean {
  return true;
}

/**
 * The time on the run that actually won, which is not the time on the clock.
 *
 * The share button opens as soon as you have beaten the level, and it stays
 * open -- including on a fresh load, off a proof kept from yesterday, with the
 * clock at zero. Sending "beaten in 0s" would be a lie, and sending the time
 * of a run still in progress would be a different one.
 *
 * -1 until a win is known.
 */
let wonIn = -1;

/**
 * Replay what was just played. Only a win here opens the button.
 *
 * Runs on EVERY win, not only the first. It used to sit behind `!proven`, so
 * the second time you beat a level nothing happened at all and the share
 * message kept quoting your first run -- reported exactly that way.
 *
 * A faster run replaces the kept one, log and time together, because the log
 * is the evidence for the time. A slower one leaves both alone: what you send
 * is your best, which is what "Beat that" means.
 */
function proveIt(): boolean {
  const log = recorder.log();
  if (!beats(log, () => engineFor(level, chosen) as unknown as Replayable, STATUS_WON)) {
    return false;
  }
  const fresh = log.length;
  const kept = keptTicks();
  if (!keepsFresh(fresh, kept)) {
    // Slower than the one on file. Still a win -- the button stays open -- but
    // the boast stays the better run.
    wonIn = scoreFromTicks(kept as number, moving !== null);
    return true;
  }
  wonIn = scoreFromTicks(fresh, moving !== null);
  keepProof({
    level: levelCode,
    creature: chosen.id,
    log: [...log],
    key: proofKey(levelCode, chosen.id, log),
  });
  return true;
}

/** How long the kept proof for this level and creature took, if there is one. */
function keptTicks(): number | null {
  for (const proof of storedProofs()) {
    if (proof.level !== levelCode || proof.creature !== chosen.id) continue;
    if (proof.key !== proofKey(levelCode, chosen.id, proof.log)) continue;
    return proof.log.length;
  }
  return null;
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
    const run = replay(proof.log, () => engineFor(level, chosen) as unknown as Replayable);
    if (run.status === STATUS_WON) {
      // The kept log IS the run, so its length is the time it took. Counted the
      // way this engine counts: seconds where the world moves on its own, turns
      // where it waits for you.
      wonIn = scoreFromTicks(run.ticks, moving !== null);
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
/**
 * A challenge: a level sent WITH the time the sender did it in.
 *
 * The difference from a reply is who is on the other end. A reply goes back to
 * the person whose level it is; a challenge goes out to somebody who has never
 * seen it. Same idea either way -- here is a number, go on then.
 */
let challenge: ReturnType<typeof challengeFromHash> = null;
try {
  reply = resultFromHash(window.location.hash);
  challenge = reply === null ? challengeFromHash(window.location.hash) : null;
  shared = reply !== null
    ? { level: reply.level, slug: reply.slug }
    : challenge !== null
    ? { level: challenge.level, slug: challenge.slug }
    : levelFromHash(window.location.hash);
} catch (err) {
  loadError = err instanceof CodecError ? err.message : String(err);
}

/**
 * The room the game opens on: the first of the six it ships with.
 *
 * It used to open on the level the engines were developed against -- four
 * gems, three guards, corridors a cell wide -- because that was the only level
 * that existed. A child who taps a link and draws nothing now gets a room with
 * nothing in it to go wrong, and five more behind it.
 */
const FRONT_DOOR = PACK[0] as (typeof PACK)[number];
let level = shared === null ? decodeLevel(FRONT_DOOR.code) : shared.level;
let levelName = shared === null ? FRONT_DOOR.name : shared.slug.replace(/-/g, " ");

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
/**
 * "Edit character" has to remember which level you were on.
 *
 * The drawing page sends you back to `../` when you tap play, which
 * drops the fragment -- and the fragment IS the level. So you went off to give
 * your creature another point, came back, and were playing the built-in level
 * instead of the one you were in the middle of.
 *
 * The level travels with the link. Always as `p/<slug>/<code>`, even when you
 * arrived on a score link: you have read the boast, and what you want on the
 * way back is the level to try your new creature on.
 */
const drawLink = document.getElementById("draw") as HTMLAnchorElement | null;

const buildLink = document.getElementById("build") as HTMLAnchorElement | null;
if (buildLink !== null) {
  // Every room is a starting point, the six that ship included: "edit level"
  // opens the one you are looking at rather than an empty grid.
  buildLink.href = `./level/#from/${encodeLevel(level)}`;
  buildLink.textContent = "edit level";
}
if (drawLink !== null && shared !== null) {
  drawLink.href = `./make/#back/${slugify(levelName)}/${encodeLevel(level)}`;
}
// A character you made wins over the ready-made ones: it is yours, and it is
// the reason the spec says never to cut the drawing day.
const another = document.getElementById("another") as HTMLButtonElement | null;
if (another !== null) {
  another.addEventListener("click", () => {
    const where = anotherRoom();
    // hashchange reloads the page, exactly as arriving on a link does.
    if (where !== null) window.location.hash = where.slice(1);
  });
}

const saved = loadCharacter();
/** The row without the visitor: yours, if you have drawn one, then the presets. */
const homeRoster: readonly Creature[] = [...(saved === null ? [] : [saved.creature]), ...PRESETS];
// Whoever beat your level comes with the reply, so you can try their creature
// against your own level. That is the point of sending one back.
const visitor: Creature | null = reply?.creature ?? null;
/**
 * ...unless they used one of the ready-made ones, which is the common case.
 *
 * Then their creature IS that preset -- same drawing, same build, same name --
 * and adding it would show the row "Bash, Bash". Reported with a screenshot of
 * exactly that. The label moves onto the preset instead of a copy of it.
 */
const twin = visitor === null ? -1 : homeRoster.findIndex((one) => sameCreature(one, visitor));
const roster: readonly Creature[] =
  visitor === null || twin >= 0
    ? homeRoster
    : [...(saved === null ? [] : [saved.creature]), visitor, ...PRESETS];
/** Where the friend's creature sits in the row, or -1 when there is no reply. */
const guestAt = visitor === null ? -1 : twin >= 0 ? twin : (saved === null ? 0 : 1);
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
  level = decodeLevel(FRONT_DOOR.code);
  levelName = FRONT_DOOR.name;
}
const levelCode = encodeLevel(level);

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
//
// THIS BLOCK WAS PASTED INTO THE MIDDLE OF THE COMMENT BELOW and sat inside it
// -- so the play page's logo was never drawn at all, on any build, and nothing
// noticed because a comment type-checks perfectly. Reported as "the hoppa logo
// seems to have disappeared", which is generous: it had never arrived.
// test/logo.test.ts now asserts the call is reachable code on every page.
const logoCanvas = document.getElementById("logo") as HTMLCanvasElement | null;
if (logoCanvas !== null) paintLogo(logoCanvas, window.innerWidth >= 560 ? 3 : 2);

/**
 * One of the six the game ships with.
 *
 * They arrive as `#p/` links like any other level, which is the point -- but
 * it means the page cannot tell "somebody sent me this" from "I tapped it in
 * the list" by the URL alone. It matters, because a room the game ships with
 * has nobody to send a score back TO.
 */
/**
 * Another one of the nine, at random, never the one you are on.
 *
 * The rooms used to be a list under the game and are now the level editor's
 * examples, which is the right place for them to be things you EDIT -- but it
 * left the play page with no way to reach room two, let alone room nine. A
 * player who tapped the link and never opened the editor saw one room, forever,
 * and reported not being able to find the fire.
 *
 * It hands out an ordinary #p/ link, so tapping this is the same act as tapping
 * one in a message. Nothing new is reachable this way.
 *
 * Random by the clock, which is fine here and would not be anywhere else: this
 * picks what you look at next, it is not part of any run, and no engine is ever
 * told about it. Shuffling from the CURRENT room means it can never hand you
 * the one you are already on, so every tap is a change.
 */
function anotherRoom(): string | null {
  const others = PACK.filter((room) => room.code !== levelCode);
  if (others.length === 0) return null;
  const pick = others[Date.now() % others.length] as (typeof PACK)[number];
  return `#p/${pick.slug}/${pick.code}`;
}

const shipped = new Set(PACK.map((room) => room.code));
const isShipped = shipped.has(levelCode);

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
const mine = levelIsMine();
// A reply is always sent back: somebody put a time on your level, and the
// answer to that is your own time, not the level they have already played.
//
// One of the six is neither yours nor a friend's. There is nobody to send a
// score back to, and what you actually want to pass on is the room -- so it
// shares as a level, exactly as it did before the six existed.
const sendingBack = reply !== null || (shared !== null && !isShipped && !mine);

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
const sent = document.getElementById("sent") as HTMLElement;
const shut = document.getElementById("shut") as HTMLButtonElement;

/**
 * Whether the end-of-run panel has been waved away.
 *
 * The panel is repainted every tick while a run is over, so "hidden" has to be
 * a thing the page remembers rather than a class somebody removed once -- it
 * would be back within a thirtieth of a second.
 */
let panelShut = false;
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

/**
 * Which enemy stands in which cell, for the still frames the renderer draws
 * from the tile grid. The moving frames get it per actor; this is the same
 * information for the frame between turns.
 */
function guardArtMap(from: typeof level): Map<number, number> {
  const art = new Map<number, number>();
  for (let i = 0; i < from.guardCells.length; i = (i + 1) | 0) {
    art.set(from.guardCells[i] as number, from.guardArt[i] ?? 0);
  }
  return art;
}

/** Which way the current in each cell flows. Same arrangement as the enemies. */
function flowArtMap(from: typeof level): Map<number, number> {
  const art = new Map<number, number>();
  for (let i = 0; i < from.currentCells.length; i = (i + 1) | 0) {
    art.set(from.currentCells[i] as number, from.currentDirs[i] ?? 1);
  }
  return art;
}

/**
 * What each cell really holds, for the ones a creature can stand on.
 *
 * The actor's own tile index overwrites the cell it occupies, so without this
 * the frame draws floor under the sprite and the ladder rung, bridge plank or
 * current it is standing on vanishes for as long as you are there.
 *
 * Ladders and currents only. A FIRE can be put out -- roam/8's bucket -- and
 * the level does not know which ones are, so reading that from here would
 * light a doused one back up whenever somebody stood on it.
 */
function underMap(from: typeof level): Map<number, number> {
  const under = new Map<number, number>();
  for (let cell = 0; cell < from.ladders.length; cell = (cell + 1) | 0) {
    if (from.ladders[cell] === 1) under.set(cell, TILE_LADDER);
  }
  const flowing = from.currentCells ?? new Int16Array(0);
  for (let i = 0; i < flowing.length; i = (i + 1) | 0) {
    under.set(flowing[i] as number, TILE_FLOW);
  }
  return under;
}


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

  // A link too long for a QR is still a link. Say nothing and show the button.
  if (!paintQrOnto(qrCanvas, url)) return;

  // The square always carries the LEVEL, even on a run where the button sends
  // a score back -- somebody sitting next to you wants to play it, not read
  // about your time. But it is only "your level" when it actually is yours.
  qrHint.innerHTML = mine
    ? "a friend's phone can scan this to play <b>your level</b>"
    : "a friend's phone can scan this to play <b>this level</b>";
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
  sendIt.textContent = aPlace() ? "share this place"
    : sendingBack ? "send your score" : "share level";
}

// --- noise ------------------------------------------------------------------
//
// The engines are not told about any of this and must not be: an engine that
// knows about sound is an engine whose behaviour could depend on it. Every cue
// is worked out by comparing one frame's read-outs with the last, which is why
// none of it can affect a replay.

const sounds = new Sounds(soundOn());
const soundButton = document.getElementById("sound") as HTMLButtonElement;

/**
 * The icon IS the state: which half of the drawing is shown follows
 * `aria-pressed` in CSS, so there is no second copy of "is it on" to get out
 * of step with the first. All this sets is the pressed flag and what a screen
 * reader hears, which has to say what tapping WILL do, not what is true now.
 */
function paintSoundButton(): void {
  soundButton.setAttribute("aria-pressed", String(sounds.isOn()));
  soundButton.setAttribute("aria-label", sounds.isOn() ? "turn sound off" : "turn sound on");
}

soundButton.addEventListener("click", () => {
  sounds.setOn(!sounds.isOn());
  setSoundOn(sounds.isOn());
  paintSoundButton();
  // The tap that turns it on is also the gesture a browser wants before it
  // will let a page make a noise, so this both confirms the setting and
  // unlocks it. The winning fanfare, because it is the longest and the easiest
  // to be sure you heard.
  //
  // The fanfare IS the confirmation. There used to be a line of prose under
  // the game as well, about the side switch on an iPhone -- a paragraph of
  // troubleshooting, permanently parked under the level, for a problem most
  // people do not have.
  if (sounds.isOn()) sounds.play("won");
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
      // The engine spawns enemies straight down guardCells, so enemy N is
      // guard N and the art comes along by index. The engine is never told --
      // hard rule 4, and every one of them behaves exactly alike.
      moving.enemyPositions().map((enemy, at) => ({
        ...enemy,
        art: level.guardArt[at] ?? 0,
      })),
      reachFor(chosen),
    );
    paintMovingHud();
    paintPourState();
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
    if (won && !provedThisRun) {
      // Not "the page saw a win", but "these presses, replayed cold, win".
      // Once per RUN. Once per page was the bug: beat it again and nothing
      // re-ran, so the message kept quoting the first time for ever.
      provedThisRun = true;
      proven = proveIt() || proven;
      paintShareGate();
    }
    if (won) paintQr();
    over.className = panelShut ? "" : won ? "show" : "show lost";
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
/**
 * The bucket, while it is being emptied.
 *
 * Pouring takes sixteen ticks -- about half a second -- and during it the
 * button does nothing. Without saying so, a child taps it four more times
 * thinking it did not work, which is exactly what they did with the sword.
 */
function paintPourState(): void {
  const bucket = document.getElementById("water") as HTMLButtonElement | null;
  if (bucket === null || bucket.hidden || moving === null) return;
  const pouring = (moving as unknown as { pouring?: () => number }).pouring?.() ?? 0;
  bucket.classList.toggle("pouring", pouring > 0);
}

/**
 * The breath meter, underwater and nowhere else.
 *
 * Bubbles rather than a bar, and they EMPTY from the right, so it reads the
 * same way as the row of hearts already sitting next to it -- a child who has
 * learned one has learned the other.
 *
 * It goes orange and then red near the end. A meter that only changes length
 * is a meter nobody looks at while they are busy swimming; a colour arrives in
 * the corner of the eye, which is the whole point of a warning.
 *
 * AND IT SAYS THE WORD. Six dots next to six hearts is a second row of
 * something, and a child who has not been told what it is has no reason to
 * read it -- so when the air ran out and a heart went every DROWN_TICKS, what
 * they saw was damage arriving from nowhere. Reported exactly that way: "the
 * player character seems to randomly get hurt after passing a bubble". It was
 * not the bubble; the bubbles are decoration and no engine has ever read one.
 * It was drowning, silently.
 */
/** The lungful this engine has, if it is the kind of engine that breathes. */
function breathOf(game: Moving): Breath | undefined {
  return (game as unknown as { breath?: () => Breath }).breath?.();
}

function breathBar(game: Moving): string {
  const breath = breathOf(game);
  if (breath === undefined) return "";
  // Out is its own state, not the bottom of the meter. An empty row of circles
  // says "this is nearly used up"; it does not say "you are drowning RIGHT NOW
  // and that is where the hearts are going".
  if (breath.left <= 0) {
    return `<span class="air-0" aria-label="out of air"><b>no air!</b></span>`;
  }
  const pips = 6;
  const { lit, state } = breathPips(breath, pips);
  return `<span class="${state}"><b>` +
    "\u25cf".repeat(Math.max(0, lit)) + "\u25cb".repeat(Math.max(0, pips - lit)) +
    "</b> air</span>";
}

let airSaid = AIR_QUIET;

function paintMovingHud(): void {
  const game = moving as Moving;
  // Two voices, one strip of screen, and the CAUSE wins over the symptom.
  //
  // Drowning speaks through the engine as "That hurt." -- the same words as an
  // urchin, on a tick where nothing is nearby -- and it speaks again every
  // DROWN_TICKS, so left to itself it would crowd out the one line that says
  // what to do about it. Out of air, the air warning goes first; the rest of
  // the time the engine does, because then it really is about being hit.
  if (!finished()) {
    const said = loop === null ? null : loop.takeMessage();
    const heard = breathWarning(breathOf(game), airSaid);
    airSaid = heard.said;
    flashMessage(heard.text !== null ? heard.text : said);
  }
  const health = game.health();
  const hearts = "\u2665".repeat(health.hp) + "\u2661".repeat(Math.max(0, health.max - health.hp));
  const got = game.collectedCount();
  const total = game.treasureTotal();

  hud.innerHTML = aPlace()
    // A garden counts what you have picked and nothing else. Hearts you cannot
    // lose and a clock counting up on a thing with no finish are both just
    // scoreboards for a game nobody is playing.
    ? `<span class="gold"><b>${got}</b> ${got === 1 ? "flower" : "flowers"}</span>`
    : `<span class="hearts hearts-${health.hp}"><b>${hearts}</b></span>` +
      breathBar(game) +
      `<span class="${got === total ? "done" : "gold"}"><b>${got}/${total}</b> treasure</span>` +
      `<span><b>${game.seconds()}</b>s</span>`;

  if (finished()) {
    const won = game.currentStatus() === STATUS_WON;
    if (won && !provedThisRun) {
      // See paintHud: once per run, or a second win is never counted.
      provedThisRun = true;
      proven = proveIt() || proven;
      paintShareGate();
    }
    if (won) paintQr();
    over.className = panelShut ? "" : won ? "show" : "show lost";
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
  // A fresh run starts with a lungful and with both warnings unspent.
  airSaid = AIR_QUIET;
  // The code is for this level, so it survives a replay -- but the panel is
  // hidden again until the next win.
  qrCanvas.hidden = true;
  qrHint.hidden = true;
  sent.hidden = true;
  raw = build();
  engine = new Readout(raw);
  moving = isRealtime(raw) ? (raw as unknown as Moving) : null;
  buttons.clear();
  blockedUntil = 0;
  // A new run needs a new log. Keeping the old one would let a losing attempt
  // inherit the presses of a winning one.
  recorder = new Recorder();
  // A new run gets its panel back.
  panelShut = false;
  // A new run: nothing that changed between the old one and this one is a
  // noise. Restarting is not losing four treasure.
  lastMoment = { hp: 0, treasure: 0, playing: true, won: false };
  // ...but a proof already earned still stands, including one from a previous
  // visit. Switching creature is a different run, so it is re-checked.
  provedThisRun = false;
  proven = provenBefore();
  paintShareGate();
  // Only when the creature changes: stamping 256 pixels every frame is the
  // difference between smooth and not on a cheap phone.
  renderer.setSprite(chosen.sprite);
  renderer.setWeapon(chosen.weapon);
  renderer.setSideOn(level.engine === "dash", level.engine, level.tilesetId);
  renderer.setGuardArt(guardArtMap(level));
renderer.setFlowArt(flowArtMap(level));
  renderer.setUnder(underMap(level));
  // Only the real-time engines redraw every frame. A turn-based level redraws
  // when you press something, so a spinning gem would freeze between moves.
  renderer.setSpinning(moving !== null);
  // A creature that swings a wand needs the wand on the button, not a sword.
  paintActionButton();
  paintStable();
  paint();

  if (moving !== null) {
    loop = new Loop(moving, buttons, paint, finished, (held) => {
      recorder.push(held);
      watchTheSurface(held);
    });
    loop.start();
  }
}


// --- breaking the surface ---------------------------------------------------

/**
 * The Easter egg: swim up hard at the top of the reef and you come out on the
 * beach; push up at the top of the beach and you come out in the city.
 *
 * Not a win and not a loss -- you have escaped, and the room above starts as a
 * fresh game with the same creature. That is what makes this cost nothing: no
 * engine is told, no status is invented, nothing reaches stateHash(), and every
 * reef and beach link ever sent gains it without being re-shared. See
 * ./surface.ts for the rule and for why the push has to be held.
 */
const surfacer = new Surfacer();

/** The bundled room above this world, ready to navigate to. */
function roomAbove(): { slug: string; code: string; says: string } | null {
  const world = tilesetFor(level.engine === "dash", level.engine, level.tilesetId).name;
  const name = above(world);
  if (name === null) return null;
  for (const room of PACK) {
    if (room.name === name) return { slug: room.slug, code: room.code, says: surfaceSays(world) };
  }
  return null;
}

/** True once the page has committed to leaving, so it commits only once. */
let surfacing = false;

function watchTheSurface(held: number): void {
  if (surfacing || moving === null) return;
  const up = roomAbove();
  if (up === null) return;
  const at = (moving as Moving).where();
  const atTop = Math.floor(at.y / ONE) <= SURFACE_ROW;
  if (!surfacer.push(atTop, (held & HELD_UP) !== 0)) return;

  // Said before it happens, and left on screen while the page turns over. A
  // level that vanishes without a word is a crash; a level that says what it
  // did is a secret.
  surfacing = true;
  if (loop !== null) loop.stop();
  said.textContent = `${up.says} \u2014 hold on...`;
  window.setTimeout(() => {
    window.location.hash = `#p/${up.slug}/${up.code}`;
  }, 900);
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
/**
 * What this creature is: two numbers, and nothing else.
 *
 * This has now been three things. It began as three adjectives -- "hits hard ·
 * slow · 8 hearts" -- which hid the numbers a child had just spent points on.
 * Then it was the numbers AND what they buy, which was accurate and was too
 * much to read while a guard was walking towards you.
 *
 * So: the two values, as the same pips the make page counts out. "I gave it
 * four" and "it has four" are now literally the same picture, and everything
 * the numbers buy is discoverable by playing, which is the better way to find
 * it out anyway.
 */
function traitLine(creature: Creature): string {
  const build = capsToBuild(creature.caps);
  const pips = (n: number): string =>
    "\u25cf".repeat(n) + "\u25cb".repeat(PIP_MAX - n);
  return (
    // The name of the thing, not a description of the creature: "strength ●●●○"
    // reads as a measurement, where "strong ●●●○" reads as an opinion with
    // some dots after it.
    `<span class="pair"><b class="what">strength</b><b class="pips">${pips(build.FORCE)}</b></span>` +
    `<span class="pair"><b class="what">speed</b><b class="pips">${pips(build.HASTE)}</b></span>`
  );
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

// Three prongs on a bronze shaft, held upright like the sword. Underwater a
// sword read as the wrong tool for the room -- see weapon.ts.
const TRIDENT_ICON = `<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
  <path d="M4.6 3 L4.6 8.5 L6.9 8.5 L6.9 3 Z" fill="#dfe8f0"/>
  <path d="M10.85 1.6 L10.85 8.5 L13.15 8.5 L13.15 1.6 Z" fill="#dfe8f0"/>
  <path d="M17.1 3 L17.1 8.5 L19.4 8.5 L19.4 3 Z" fill="#dfe8f0"/>
  <path d="M4.6 3 L5.75 1.2 L6.9 3 Z" fill="#ffffff"/>
  <path d="M10.85 1.6 L12 0 L13.15 1.6 Z" fill="#ffffff"/>
  <path d="M17.1 3 L18.25 1.2 L19.4 3 Z" fill="#ffffff"/>
  <rect x="4" y="8.5" width="16" height="2.4" rx="1.2" fill="#dfe8f0"/>
  <rect x="10.85" y="10.9" width="2.3" height="11" fill="#b98d4a"/>
  <rect x="9.6" y="19.4" width="4.8" height="1.6" rx="0.8" fill="#8d7a5c"/>
</svg>`;

const JUMP_ICON = `<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
  <path d="M12 3 L18 11 L14 11 L14 16 L10 16 L10 11 L6 11 Z" fill="#ffe9a3"/>
  <rect x="5" y="19" width="14" height="2.5" rx="1" fill="#7c8899"/>
</svg>`;

/**
 * The bucket.
 *
 * A bucket, not a droplet or a wave: the child asked for "a water bucket to put
 * out the fires" and that is the object in their head. Drawn tipping, with the
 * water already leaving it, because a bucket sitting upright is a container and
 * a bucket pouring is a verb.
 */
const WATER_ICON = `<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
  <path d="M6.5 5.5 L17.5 5.5 L15.6 15 L8.4 15 Z" fill="#9aa8ba"/>
  <path d="M6.5 5.5 L17.5 5.5 L17.1 7.5 L6.9 7.5 Z" fill="#c3d0de"/>
  <path d="M8 5.5 a4 4 0 0 1 8 0" fill="none" stroke="#7c8899" stroke-width="1.3"/>
  <path d="M9.6 15 q2.4 3.4 2.4 5 a2.4 2.4 0 0 1 -4.8 0 q0 -1.6 2.4 -5 Z" fill="#5ec8f0"/>
  <circle cx="15.2" cy="18.4" r="1.5" fill="#5ec8f0"/>
  <circle cx="13.4" cy="21.4" r="1" fill="#7fd8ee"/>
</svg>`;

function paintActionButton(): void {
  const button = document.getElementById("wait") as HTMLButtonElement;
  const swingButton = document.getElementById("swing") as HTMLButtonElement | null;
  const jumping = level.engine === "dash";
  const art = weaponArt(chosen.weapon, level.engine);
  const weaponIcon = art === "wand" ? WAND_ICON : (art === "trident" ? TRIDENT_ICON : SWORD_ICON);
  const says = weaponSays(art);

  // A garden has no action button, because there is nothing for it to do:
  // there is no weapon, nothing jumps, and playing with a bunny is done by
  // walking into it. A button that cannot do anything is worse than no button,
  // and a SWORD in a cosy place is worse than either -- it says the game wants
  // something of you that it does not.
  button.hidden = aPlace();
  button.innerHTML = jumping ? JUMP_ICON : weaponIcon;
  button.setAttribute("aria-label", jumping ? "jump" : says);

  // From the side the action button is jump, so the weapon gets its own key.
  // From above they would be the same button, so there is only one.
  if (swingButton !== null) {
    const separate = jumping && hasWeapon(level.engine, level.behaviourVersion);
    swingButton.hidden = !separate;
    if (separate) {
      swingButton.innerHTML = weaponIcon;
      swingButton.setAttribute("aria-label", says);
    }
    // With no second button, the one button moves across to sit beside up on
    // the RIGHT. A thumb reaching for the weapon should find it in the same
    // place whichever game this is, and from the side that place is the right
    // of the pad -- the left one there is the jump.
    pad.classList.toggle("one", !separate);
  }

  // The bucket. From above only, and only when there is something to pour it
  // on: a button that can never do anything is worse than no button at all.
  const bucket = document.getElementById("water") as HTMLButtonElement | null;
  if (bucket !== null) {
    // Three questions, and the button needs all three: does this BUILD douse,
    // is a bucket the right tool for what this WORLD draws, and is there
    // anything here to pour it on.
    const wet = hasWater(level.engine, level.behaviourVersion)
      && bucketHelps(tilesetFor(level.engine === "dash", level.engine, level.tilesetId).hazard)
      && level.fireCells.length > 0;
    bucket.hidden = !wet;
    if (wet) bucket.innerHTML = WATER_ICON;
  }
}

/**
 * The first side-on build with a weapon at all.
 *
 * dash/1 and dash/2 answer an enemy only by being landed on, and showing a
 * swing button on one of those levels would offer a child a button that does
 * nothing. From dash/3 on, the swing key strikes.
 *
 * A THRESHOLD, not a list. It was a list naming "dash/3" alone, so dash/4 --
 * which is dash/3 plus a change to picking gems up, weapon untouched -- shipped
 * with no weapon button at all, and a child on one of those levels had no
 * answer to a guard but to walk round it. Every new dash build would have lost
 * it again, silently, which is exactly the failure the version table exists to
 * make loud.
 */
const FIRST_ARMED_DASH = 3;

function hasWeapon(engine: string, version: number): boolean {
  return engine === "dash" && version >= FIRST_ARMED_DASH;
}


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
  trait.innerHTML = traitLine(chosen);
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

/**
 * Every pad button that gets a listener. THE SWING HAS TO BE IN HERE.
 *
 * It was not, and the button worked exactly as well as a photograph of a
 * button: paintActionButton() unhides it for the side-on games and gives it a
 * sword, PAD_BITS maps it to HELD_SWING, and the loop below -- which reads
 * THIS list, not that one -- never reached it, so nothing was ever bound to it.
 * Tapping it did nothing at all.
 *
 * Reported by a nine-year-old as "the sword is not working on the side view
 * levels", which is precisely what it was. It survived because a keyboard goes
 * through KEY_BITS instead (c, C, Shift), and that always worked -- so every
 * test of it at a desk passed.
 *
 * The Input is only read by the turn-based games, where the weapon IS the
 * action button and this one is hidden; INPUT_WAIT is that button, so a tap
 * that somehow arrived there would do the right thing rather than nothing.
 */
/**
 * The round buttons. Directions come from the pad -- see below.
 *
 * "swing" and "water" both carry HELD_SWING: types.ts has said the bit is free
 * from above since it was added, and seen from above HELD_ACT is already the
 * weapon, so nothing else wanted it.
 */
const ACTION_KEYS: ReadonlyArray<readonly [string, number, Input]> = [
  ["wait", HELD_ACT, INPUT_WAIT],
  ["swing", HELD_SWING, INPUT_WAIT],
  ["water", HELD_SWING, INPUT_WAIT],
];

for (const [id, bit, input] of ACTION_KEYS) {
  const el = document.getElementById(id) as HTMLButtonElement;
  el.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    // The weapon is the one noise the engine cannot be asked about: whether a
    // swing connected is state, but whether a child pressed the button is not.
    if (id === "wait" || id === "swing") sounds.play("swing");
    if (id === "water") sounds.play("douse");
    if (moving !== null) {
      buttons.set(bit, true);
      el.setPointerCapture(ev.pointerId);
      return;
    }
    move(input);
  });
  for (const name of ["pointerup", "pointercancel"]) {
    el.addEventListener(name, () => {
      if (moving !== null) buttons.set(bit, false);
    });
  }
}

// --- the pad ----------------------------------------------------------------
//
// ONE control. It takes the pointer on the way down and keeps it until the
// thumb lifts, reading the position on every move -- so you can roll from
// right to down without letting go, and hold a diagonal with one thumb.
//
// Six separate buttons could do neither, which is what "the controls are quite
// poor" was about. Each captured the pointer for itself, so a slide went
// nowhere; each dropped its input on pointerleave, so a few pixels of drift
// stopped you mid-jump; and a diagonal wanted two fingers.

const dpad = document.getElementById("dpad") as HTMLElement;
const ARROWS: ReadonlyArray<readonly [string, number]> = [
  ["u", HELD_UP], ["r", HELD_RIGHT], ["d", HELD_DOWN], ["l", HELD_LEFT],
];

/** Light the arrows that are held, so the pad says what it thinks you meant. */
function paintPad(held: number): void {
  for (const [cls, bit] of ARROWS) {
    dpad.querySelector(`.${cls}`)?.classList.toggle("on", (held & bit) !== 0);
  }
}

/** Which directions a pointer at this page position is asking for. */
function padHeld(clientX: number, clientY: number): number {
  const box = dpad.getBoundingClientRect();
  const radius = Math.min(box.width, box.height) / 2;
  return heldFor(clientX - (box.left + box.width / 2), clientY - (box.top + box.height / 2), radius);
}

/** The single discrete move a turn-based engine wants from one press. */
function stepFor(held: number): Input | null {
  if ((held & HELD_UP) !== 0) return INPUT_UP;
  if ((held & HELD_DOWN) !== 0) return INPUT_DOWN;
  if ((held & HELD_LEFT) !== 0) return INPUT_LEFT;
  if ((held & HELD_RIGHT) !== 0) return INPUT_RIGHT;
  return null;
}

let padPointer = -1;

// The iOS selection loupe, and the last thing that stops it.
//
// Three goes at this now. `user-select: none` did not stop it; neither did
// `preventDefault` on pointerdown, because on iOS the pointer events are
// SYNTHESISED from touch and cancelling the synthetic one cancels nothing
// underneath; `-webkit-touch-callout: none` stopped the long-press menu but
// not the magnifier you get from a long-press DRAG, which is what a d-pad is.
//
// So: cancel the touch itself, on the pad only, with a non-passive listener.
// touchmove is the one that matters -- the loupe appears once the finger has
// moved with the touch still down -- and cancelling it there leaves pointerdown
// and pointer capture untouched, which is what actually drives the pad.
// The whole pad: the cross AND the round buttons beside it, because a thumb
// that slides off one onto the other is the exact gesture being reported.
for (const surface of [pad]) {
  if (surface === null) continue;
  surface.addEventListener("touchmove", (ev) => ev.preventDefault(), { passive: false });
  surface.addEventListener("touchstart", (ev) => ev.preventDefault(), { passive: false });
}

dpad.addEventListener("pointerdown", (ev) => {
  ev.preventDefault();
  const held = padHeld(ev.clientX, ev.clientY);
  if (moving === null) {
    // Turn-based: one press is one move, and a diagonal is not a move it has.
    const step = stepFor(held);
    if (step !== null) move(step);
    return;
  }
  padPointer = ev.pointerId;
  dpad.setPointerCapture(ev.pointerId);
  buttons.set(PAD_MASK, false);
  applyPad(held);
});

dpad.addEventListener("pointermove", (ev) => {
  if (padPointer !== ev.pointerId || moving === null) return;
  applyPad(padHeld(ev.clientX, ev.clientY));
});

for (const name of ["pointerup", "pointercancel"]) {
  dpad.addEventListener(name, (ev) => {
    if (padPointer !== (ev as PointerEvent).pointerId) return;
    padPointer = -1;
    applyPad(HELD_NONE);
  });
}

/** Hold exactly these directions and no others, and show it. */
function applyPad(held: number): void {
  for (const [, bit] of ARROWS) buttons.set(bit, (held & bit) !== 0);
  paintPad(held);
}

shut.addEventListener("click", (ev) => {
  ev.stopPropagation();
  // Only hides the panel. The run is still over and "start again" is still in
  // the footer -- this is for looking at the room, not for carrying on.
  panelShut = true;
  over.className = "";
});

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

/** Which arm of the pad a discrete move lights up. */
const KEY_ARROWS: Readonly<Record<number, string>> = {
  [INPUT_UP]: "u", [INPUT_RIGHT]: "r", [INPUT_DOWN]: "d", [INPUT_LEFT]: "l",
};

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
  // Light the arrow the key means, so the pad answers a keyboard the way it
  // answers a thumb. Directions live on the pad now, not on four buttons.
  const arrow = KEY_ARROWS[input];
  if (arrow !== undefined) {
    const el = dpad.querySelector(`.${arrow}`);
    el?.classList.add("on");
    setTimeout(() => el?.classList.remove("on"), 90);
  }
});

levelname.textContent = levelName;

// A fragment-only change does not reload a page, so opening a second link in a
// tab that already has one would otherwise leave the old level on screen.
window.addEventListener("hashchange", () => window.location.reload());

/** Seconds on a real-time level, turns on a turn-based one, as the HUD shows. */
/** Short form, for a line in a group chat: "22s" rather than "22 seconds". */
function scoreUnit(): string {
  return moving === null ? " turns" : "s";
}

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
/**
 * Sending a level, in the order a phone is actually good at.
 *
 * The four steps live in src/web/send.ts, because the level editor sends links
 * too and the fallback chain is not a thing to keep two copies of. This end
 * decides only WHAT is being sent and what to call it.
 */
async function share(): Promise<void> {
  const base = `${window.location.origin}${window.location.pathname}`;
  // A level and nothing else is an invitation; a level with the time you did it
  // in is a challenge, and a challenge is what a child actually wants to send.
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
    : wonIn >= 0
    ? challengeLinkFor(level, levelName, wonIn, chosen.name, base)
    : linkFor(level, levelName, base);

  await sendLink({
    url,
    text: inviteText({
      sendingBack,
      mine,
      beaten: sendingBack || wonIn >= 0,
      score: sendingBack ? myScore() : wonIn,
      unit: scoreUnit(),
      name: levelName,
    }),
    copied: sendingBack
      ? "copied \u2014 send it back and see if they can beat your score"
      : "link copied \u2014 send it to a friend",
    say: (words: string, bad = false): void => {
      sent.className = bad ? "bad" : "";
      sent.textContent = words;
      sent.hidden = false;
    },
  });
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
} else if (challenge !== null && challenge.score >= 0) {
  // Same thing said to a different person: a reply goes back to whoever made
  // the level, a challenge goes out to somebody who has never seen it.
  const unit = moving === null ? "turns" : "seconds";
  const who = challenge.who.replace(/-/g, " ");
  boast.textContent = `${who} did this in ${challenge.score} ${unit} — can you do better?`;
  boast.hidden = false;
}

if (loadError !== null) {
  // The reason is real information, but "the code is damaged" is not a sentence
  // a nine-year-old should have to parse when all they did was tap a link.
  said.textContent = "that link is broken — here is the usual level instead";
}


// Re-checked, not trusted: a stored proof is replayed before it counts.
proven = provenBefore();
paintShareGate();

renderer.setSprite(chosen.sprite);
renderer.setWeapon(chosen.weapon);
renderer.setSideOn(level.engine === "dash", level.engine, level.tilesetId);
renderer.setGuardArt(guardArtMap(level));
renderer.setFlowArt(flowArtMap(level));
renderer.setUnder(underMap(level));
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
  loop = new Loop(moving, buttons, paint, finished, (held) => {
    recorder.push(held);
    watchTheSurface(held);
  });
  loop.start();
}

// Everything above works with no network. This is what makes that true after
// the first visit as well -- see src/web/sw.ts.
holdStill();

goOffline("./");
