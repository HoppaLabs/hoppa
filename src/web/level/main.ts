// The level editor.
//
// Draw a room, put things in it, play it. If you beat it you may send it --
// the share gate on the play page is unchanged, and it is the thing that stops
// an impossible level ever reaching a friend. So this page does NOT have to
// prove a level is winnable; it only has to stop a kid wasting an attempt on
// something obviously broken, in words they can act on.
//
// The level travels to the play page the same way a shared level does: in the
// URL fragment. There is no handoff to invent, no second storage format, and
// "play it" and "somebody sent me this" land in exactly the same code.

import { GRID_H, GRID_W } from "../../core/grid.ts";
import {
  GLYPH_BAT, GLYPH_DRAGON,
  GLYPH_EXIT, GLYPH_FIRE, GLYPH_FLOOR, GLYPH_GUARD, GLYPH_LADDER,
  GLYPH_START, GLYPH_TREASURE, GLYPH_WALL,
} from "../../core/level.ts";
import { parseLevel } from "../../core/level.ts";
import {
  blankDraft, draftFromLevel, draftToText, paint, retarget, tally,
  type Draft, type Glyph,
} from "../../core/draft.ts";
import { adviceFor } from "../../core/advice.ts";
import { newestBuild } from "../../core/builds.ts";
import { decodeLevel, encodeLevel } from "../../core/codec.ts";
import { slugify } from "../play/link.ts";
import { GridRenderer, tileChip } from "../play/renderer.ts";
import { RUBBER_ICON } from "../icons.ts";
import { ask } from "../ask.ts";
import { PACK } from "../../core/pack.ts";
import {
  TILE_FIRE,
  TILE_ACTOR, TILE_EXIT_LOCKED, TILE_FLOOR, TILE_GUARD,
  TILE_LADDER, TILE_TREASURE, TILE_WALL,
} from "../../core/tiles.ts";
import { loadDraft, saveDraft } from "../stash.ts";
import { goOffline } from "../offline.ts";

// --- what you can draw with ---------------------------------------------------
//
// Plain words only. "Tile", "entity", "spawn point" and "patrol" are all things
// a nine-year-old would have to be taught before they could draw a room.

interface Tool {
  readonly glyph: Glyph;
  readonly label: string;
  /**
   * Drawn with a rubber over its tile, the way the character editor draws its
   * see-through pen. Clearing a cell paints floor, so the tile underneath is
   * honest -- but "the tool that takes things away" is what it IS.
   */
  readonly rubber?: boolean;
  /**
   * What it is called in the side-on game.
   *
   * The same entity is a flame below ground and spikes out in the open, so a
   * button labelled "fire" that paints spikes is a button that lies -- exactly
   * what skyColour exists to stop, one level up.
   */
  readonly skyLabel?: string;
  /** Only offered for the games that have it. */
  readonly engines?: readonly string[];
  /** Shows "3 of 8" under the button when there is a limit worth knowing. */
  readonly limit?: number;
}

const TOOLS: readonly Tool[] = [
  // The rubber first, the way it is first on the character editor. It is the
  // tool you reach for most and the one you want before you have decided what
  // you are drawing, and it was sitting second behind the wall.
  { glyph: GLYPH_FLOOR, label: "clear", rubber: true },
  { glyph: GLYPH_WALL, label: "wall" },
  { glyph: GLYPH_START, label: "start" },
  { glyph: GLYPH_EXIT, label: "door / exit" },
  { glyph: GLYPH_TREASURE, label: "treasure", limit: 8 },
  // Three enemies, one tool each. They walk, chase and die exactly alike --
  // what changes is what a child sees walking towards them, which at nine
  // years old is most of what an enemy IS.
  { glyph: GLYPH_GUARD, label: "goblin", limit: 10 },
  { glyph: GLYPH_BAT, label: "bat", limit: 10 },
  { glyph: GLYPH_DRAGON, label: "dragon", limit: 10 },
  { glyph: GLYPH_LADDER, label: "ladder", engines: ["dash"] },
  // One tool, two names. It is the same entity either way -- what changes is
  // what the world draws, because a flame standing on grass looks like a
  // mistake and spikes in a cave look like a floor. See src/core/tileset.ts.
  { glyph: GLYPH_FIRE, label: "fire", skyLabel: "spikes", limit: 10 },
];

/**
 * The two games, and the rules a NEW level is drawn under.
 *
 * The version comes from the registry, never from a number written here. A
 * hardcoded one went stale the moment dash/3 shipped, and every level drawn
 * afterwards was quietly still dash/2 -- so the sword a child had just been
 * given did nothing in the levels they made with it.
 */
const GAMES = [
  { engine: "roam", label: "from above" },
  { engine: "dash", label: "from the side" },
] as const;

function currentBuild(engine: string): number {
  const newest = newestBuild(engine);
  return newest > 0 ? newest : newestBuild(GAMES[0].engine);
}

const TILE_OF: Record<string, number> = {
  [GLYPH_WALL]: TILE_WALL,
  [GLYPH_FLOOR]: TILE_FLOOR,
  [GLYPH_START]: TILE_ACTOR,
  [GLYPH_EXIT]: TILE_EXIT_LOCKED,
  [GLYPH_TREASURE]: TILE_TREASURE,
  [GLYPH_GUARD]: TILE_GUARD,
  [GLYPH_BAT]: TILE_GUARD,
  [GLYPH_DRAGON]: TILE_GUARD,
  [GLYPH_LADDER]: TILE_LADDER,
  [GLYPH_FIRE]: TILE_FIRE,
};

// --- the page -----------------------------------------------------------------

const paper = document.getElementById("paper") as HTMLCanvasElement;
const aim = document.getElementById("aim") as HTMLCanvasElement;
const viewport = document.getElementById("viewport") as HTMLElement;
const zoomButton = document.getElementById("zoom") as HTMLButtonElement;
const pans = document.getElementById("pans") as HTMLElement;
const toolsBox = document.getElementById("tools") as HTMLElement;
const gamesBox = document.getElementById("games") as HTMLElement;
const says = document.getElementById("says") as HTMLElement;
const nameBox = document.getElementById("name") as HTMLInputElement;
const playButton = document.getElementById("play") as HTMLButtonElement;
const clearButton = document.getElementById("clear") as HTMLButtonElement;

const renderer = new GridRenderer(paper);
const tiles = new Uint8Array(GRID_W * GRID_H);

/**
 * A level in the URL is one to CHANGE, and it beats whatever draft was in
 * storage: you got here by tapping "edit level" on a level somebody
 * sent you, and that is a deliberate act. This is the remix loop -- your
 * friend's room, your walls, your creature -- and it is why the level lives in
 * the link rather than on a server.
 */
/**
 * Bring a draft up to the rules a new level is drawn under.
 *
 * A LINK pins its version forever -- that is what makes a shared level replay
 * as it was beaten. A DRAFT is not a link: it is unfinished work, and it should
 * follow the current rules. Without this, a level half-drawn last week is still
 * made under last week's engine, and so is anything remixed from an old link.
 */
function freshen(draft: Draft): Draft {
  // An engine this build does not offer -- a retired one from an old link --
  // becomes the default game rather than an unplayable header.
  const engine = newestBuild(draft.engine) > 0 ? draft.engine : GAMES[0].engine;
  return retarget(draft, engine, currentBuild(engine));
}

function opening(): { draft: Draft; name: string } {
  if (window.location.hash.startsWith("#from/")) {
    try {
      const level = decodeLevel(window.location.hash.slice("#from/".length));
      return { draft: freshen(draftFromLevel(level)), name: "my version" };
    } catch {
      // A broken code is not worth an error page: fall through to the draft.
    }
  }
  const saved = loadDraft();
  if (saved !== null) return { ...saved, draft: freshen(saved.draft) };
  return { draft: blankDraft(GAMES[0].engine, currentBuild(GAMES[0].engine)), name: "my level" };
}

const start = opening();
let draft: Draft = start.draft;
let tool: Glyph = GLYPH_WALL;
let saying = "";
nameBox.value = start.name;

/**
 * Size the level to the space actually available.
 *
 * Not to the device: the same phone is 390 wide held one way and 844 the other,
 * and a tablet is neither. The side panel wraps under the level on a narrow
 * screen and sits beside it on a wide one, so what the canvas may take is
 * whatever the row has left over -- measured, never assumed.
 */
/**
 * The cell size to draw at, or null for "the whole level at once".
 *
 * On a phone the level is as wide as it can be when it all fits -- 24 cells
 * across about 370 points is roughly a 15 point cell, and a fingertip is nearer
 * 40. You cannot have both the whole level and a comfortable target on a screen
 * that size, so this is the choice, and pinching is how you make it.
 */
let viewTile: number | null = null;

/**
 * The cell size the button aims for, in points. Apple and Google both put the
 * smallest safe touch target near 44; this is under that because you can slide
 * to correct before letting go, and a 44 point cell would show six columns.
 */
const COMFORTABLE = 34;
/** As close as pinching will go. Beyond this you are looking at four squares. */
const MAX_TILE = 64;

/** The size the whole level fits at, which is also as far out as you can pinch. */
let fitTile = 1;

/** Where the viewport is looking, in cells, when the level is bigger than it. */
let panX = 0;
let panY = 0;

function refit(): void {
  const board = document.getElementById("board") as HTMLElement;
  const side = document.getElementById("side") as HTMLElement;
  const wide = board.clientWidth >= 760;
  const GAP = 14;

  // Measure the tools rather than guessing at them: their height changes with
  // the game (the side-on one has a ladder) and their width with the font a
  // reader has forced on us.
  const sideBox = side.getBoundingClientRect();
  const availableWidth = Math.max(240, board.clientWidth - (wide ? sideBox.width + GAP : 0));
  // The height budget must NOT subtract the tools when they sit BELOW the
  // level: the page scrolls, so they do not have to share the screen with it.
  // Subtracting them squeezed the level to 10 point cells on a real phone --
  // where the browser's own chrome already eats a chunk of innerHeight --
  // while the game page, which sizes the same level by width, got 15. Same
  // level, same phone, two thirds the size. Reported with screenshots.
  const availableHeight = wide
    ? Math.max(200, window.innerHeight - 90)
    : Math.max(180, Math.round(window.innerHeight * 0.75));

  // Fit first, then multiply: the zoom is "twice as big as it would otherwise
  // be", not a fixed cell size, so it means the same thing on every screen.
  renderer.fit(availableWidth, availableHeight);
  fitTile = renderer.tileSize();
  // You can pinch in as far as MAX_TILE and out until the level fits, and no
  // further either way: past the fit there is nothing left to see, and past
  // MAX_TILE there is nothing left on screen.
  const target = viewTile === null ? fitTile : viewTile;
  renderer.setTileSize(Math.max(fitTile, Math.min(MAX_TILE, Math.round(target))));

  // The window through which the level is seen. At 1x it is the whole thing.
  viewport.style.width = `${Math.min(availableWidth, renderer.tileSize() * GRID_W)}px`;
  viewport.style.height = `${Math.min(availableHeight, renderer.tileSize() * GRID_H)}px`;

  aim.width = paper.width;
  aim.height = paper.height;
  aim.style.width = paper.style.width;
  aim.style.height = paper.style.height;

  clampPan();
  paintViewbar();
  repaint();
}

/** Keep the view inside the level, and centred when the level is smaller. */
function clampPan(): void {
  const tile = renderer.tileSize();
  const acrossVisible = viewport.clientWidth / tile;
  const downVisible = viewport.clientHeight / tile;
  const maxX = Math.max(0, GRID_W - acrossVisible);
  const maxY = Math.max(0, GRID_H - downVisible);
  panX = Math.max(0, Math.min(maxX, panX));
  panY = Math.max(0, Math.min(maxY, panY));
  paper.style.transform = `translate(${-panX * tile}px, ${-panY * tile}px)`;
  aim.style.transform = paper.style.transform;
}

function paintViewbar(): void {
  const tile = renderer.tileSize();
  const scrolls = renderer.tileSize() * GRID_W > viewport.clientWidth + 1
    || tile * GRID_H > viewport.clientHeight + 1;
  zoomButton.textContent = renderer.tileSize() > fitTile ? "whole level" : "bigger";
  pans.hidden = !scrolls;
}

function repaint(): void {
  for (let i = 0; i < tiles.length; i = (i + 1) | 0) {
    tiles[i] = TILE_OF[draft.cells[i] as string] ?? TILE_FLOOR;
  }
  // Sky for the side-on game, so tapping "from the side" visibly changes the
  // world rather than only changing which tools are on offer.
  renderer.setSideOn(draft.engine === "dash");
  // The editor redraws only when something changes, so a spinning gem would sit
  // frozen at whatever angle the last tap caught it at.
  renderer.setSpinning(false);
  renderer.draw(tiles, false);
}

// --- somewhere to start from -------------------------------------------------

const examplesBox = document.getElementById("examples") as HTMLElement;
const askBox = document.getElementById("ask") as HTMLElement;
const took = document.getElementById("took") as HTMLElement;

/**
 * The six rooms the game ships with, offered here as levels to start FROM.
 *
 * They used to be a list on the play page, which made them things to play; a
 * child who wanted to make one still faced an empty grid. They are the same
 * six either way -- what changed is which page they are on, and therefore what
 * they are for. The drawing page does exactly this with sixteen characters,
 * and the two pages should not teach two different habits.
 */
function paintExamples(): void {
  examplesBox.innerHTML = "";
  for (let at = 0; at < PACK.length; at++) {
    const room = PACK[at] as (typeof PACK)[number];
    let theirs: Draft;
    try {
      theirs = freshen(draftFromLevel(decodeLevel(room.code)));
    } catch {
      // A room that will not decode is one example missing, not a broken page.
      continue;
    }
    const button = document.createElement("button");
    button.setAttribute("aria-label", `start from ${room.name}`);

    const thumb = document.createElement("canvas");
    // Drawn through the renderer the GAME uses, from the level's own cells, so
    // a thumbnail cannot disagree with what tapping it gives you.
    const small = new GridRenderer(thumb);
    small.setTileSize(4);
    small.setSideOn(theirs.engine === "dash");
    small.setSpinning(false);
    const shown = new Uint8Array(GRID_W * GRID_H);
    for (let i = 0; i < shown.length; i = (i + 1) | 0) {
      shown[i] = TILE_OF[theirs.cells[i] as string] ?? TILE_FLOOR;
    }
    small.draw(shown, false, true);

    const what = document.createElement("div");
    what.className = "what";
    what.textContent = room.name;
    button.append(thumb, what);
    button.addEventListener("click", () => offer(room.name, theirs));
    examplesBox.appendChild(button);
  }
}

/** Is there anything here somebody would mind losing? */
function drawnOn(): boolean {
  const empty = blankDraft(draft.engine, draft.behaviourVersion);
  return draft.cells.some((cell, at) => cell !== empty.cells[at]);
}

/**
 * Take one, or ask first.
 *
 * Same bargain as the drawing page: there is no undo, so replacing a level
 * somebody has worked on is not a thing to do quietly -- but asking a child who
 * has drawn nothing is a toll on exactly the person this is for.
 */
function offer(name: string, theirs: Draft): void {
  took.innerHTML = "";
  if (!drawnOn()) {
    take(name, theirs);
    return;
  }
  // Over the middle of the screen, not under the thumbnails: see src/web/ask.ts.
  ask(askBox, {
    question: `Replace the level you have drawn with ${name}?`,
    confirm: `use ${name}`,
    cancel: "keep mine",
    onConfirm: () => take(name, theirs),
  });
}

function take(name: string, theirs: Draft): void {
  draft = theirs;
  nameBox.value = `my ${name}`;
  // The example may be a side-on room while you were drawing a top-down one,
  // so the tools have to follow it or half of them would paint nothing.
  paintGames();
  repaint();
  store();
  review();
  took.textContent = `${name} — now change it`;
}

// --- drawing ------------------------------------------------------------------

/** Which cell is under this pointer, or null when it is off the level. */
function cellAt(event: PointerEvent): { x: number; y: number } | null {
  const box = paper.getBoundingClientRect();
  const x = Math.floor(((event.clientX - box.left) / box.width) * GRID_W);
  const y = Math.floor(((event.clientY - box.top) / box.height) * GRID_H);
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
  return { x, y };
}

/**
 * The aiming layer: a ring on the cell you are about to change, and two lines
 * running the full width and height of the level through it.
 *
 * The lines are the point. A fingertip covers about three cells, so the cell
 * you are aiming at is the one you cannot see; the lines stick out either side
 * of the finger, so you can read off exactly where you are without moving it.
 */
function paintAim(cell: { x: number; y: number } | null): void {
  const ctx = aim.getContext("2d");
  if (ctx === null) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const t = renderer.tileSize();
  ctx.clearRect(0, 0, t * GRID_W, t * GRID_H);
  if (cell === null) return;

  ctx.fillStyle = "rgba(255,194,61,.30)";
  ctx.fillRect(0, cell.y * t, t * GRID_W, t);
  ctx.fillRect(cell.x * t, 0, t, t * GRID_H);

  ctx.strokeStyle = "#ffc23d";
  ctx.lineWidth = Math.max(2, Math.round(t / 7));
  ctx.strokeRect(
    cell.x * t + ctx.lineWidth / 2,
    cell.y * t + ctx.lineWidth / 2,
    t - ctx.lineWidth,
    t - ctx.lineWidth,
  );
}

/**
 * Dragging paints a stroke of wall or rubs one out, because that is how you
 * draw a room. Dragging a start, a door, an enemy or a gem would scatter them
 * under your finger, so those are placed one tap at a time.
 */
function draggable(glyph: Glyph): boolean {
  return glyph === GLYPH_WALL || glyph === GLYPH_FLOOR || glyph === GLYPH_LADDER;
}

let drawing = false;
let lastCell = -1;

function put(x: number, y: number): void {
  const result = paint(draft, x, y, tool);
  if (result.changed) {
    draft = result.draft;
    saying = "";
    repaint();
    review();
    store();
  } else if (result.reason !== "") {
    saying = result.reason;
    review();
  }
}

/**
 * Walls paint under the finger as it moves, because that is how you draw a
 * room and a stroke is meant to be a stroke.
 *
 * Everything you place ONE of -- the start, the door, a gem, an enemy -- waits
 * for you to lift your finger. You press, the ring and the crosshair show you
 * where it would go, you slide until that is where you meant, and only then
 * does it happen. Tapping a 15 point cell accurately is hard; correcting an
 * aim you can see is easy.
 */
paper.addEventListener("pointerdown", (event) => {
  down.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (down.size >= 2) {
    beginPinch();
    return;
  }

  const cell = cellAt(event);
  if (cell === null) return;
  drawing = true;
  lastCell = cell.y * GRID_W + cell.x;
  // Capture keeps the events coming if the finger slides off the level while
  // aiming. It is a convenience, not a requirement, and it can refuse -- so it
  // happens AFTER the state is set. Doing it first meant one refusal threw the
  // whole gesture away and nothing was ever placed.
  try {
    paper.setPointerCapture(event.pointerId);
  } catch {
    // No capture: aiming still works, it just stops at the edge of the level.
  }
  paintAim(cell);
  if (draggable(tool)) put(cell.x, cell.y);
});

paper.addEventListener("pointermove", (event) => {
  if (down.has(event.pointerId)) {
    down.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }
  if (pinch !== null) {
    movePinch();
    return;
  }

  if (!drawing) return;
  const cell = cellAt(event);
  if (cell === null) return;
  const index = cell.y * GRID_W + cell.x;
  if (index === lastCell) return;
  lastCell = index;
  paintAim(cell);
  if (draggable(tool)) put(cell.x, cell.y);
});

paper.addEventListener("pointerup", (event) => {
  down.delete(event.pointerId);
  if (pinch !== null) {
    // Lifting one finger of a pinch ends the pinch; it does not start a stroke.
    if (down.size < 2) pinch = null;
    return;
  }

  if (!drawing) return;
  drawing = false;
  const cell = cellAt(event);
  paintAim(null);
  if (cell !== null && !draggable(tool)) put(cell.x, cell.y);
});

for (const name of ["pointercancel", "pointerleave"]) {
  paper.addEventListener(name, (event) => {
    down.delete((event as PointerEvent).pointerId);
    if (down.size < 2) pinch = null;
    drawing = false;
    paintAim(null);
  });
}

// --- looking around ---------------------------------------------------------------

zoomButton.addEventListener("click", () => {
  if (renderer.tileSize() > fitTile) {
    viewTile = null;
    panX = 0;
    panY = 0;
  } else {
    // Twice as big, or comfortable, whichever is bigger. A fixed multiple would
    // leave a small phone at 20 points a cell, which is no better than it was.
    viewTile = Math.max(fitTile * 2, COMFORTABLE);
  }
  refit();
});

// --- pinching -----------------------------------------------------------------------
//
// The gesture everybody already has. The button is kept because a seven-year-old
// may not think to try pinching on a level they have just started drawing, and
// one tap gets them straight to a size worth drawing at -- but pinching is how
// you actually settle on one.
//
// This runs on phones and tablets. There is no mouse to design for, so nothing
// here depends on hover, and nothing is laid out for a pointer that can be
// precise.

const down = new Map<number, { x: number; y: number }>();
let pinch: { gap: number; tile: number; cellX: number; cellY: number } | null = null;

function gapBetween(a: { x: number; y: number }, c: { x: number; y: number }): number {
  return Math.hypot(a.x - c.x, a.y - c.y);
}

function midpoint(a: { x: number; y: number }, c: { x: number; y: number }) {
  return { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
}

/** The level coordinate under a point on the screen, in cells. */
function cellUnder(px: number, py: number): { cellX: number; cellY: number } {
  const box = viewport.getBoundingClientRect();
  const tile = renderer.tileSize();
  return {
    cellX: panX + (px - box.left) / tile,
    cellY: panY + (py - box.top) / tile,
  };
}

function beginPinch(): void {
  const points = [...down.values()];
  if (points.length < 2) return;
  const a = points[0] as { x: number; y: number };
  const c = points[1] as { x: number; y: number };
  const mid = midpoint(a, c);
  const under = cellUnder(mid.x, mid.y);
  pinch = { gap: Math.max(1, gapBetween(a, c)), tile: renderer.tileSize(), ...under };
  // A second finger means this was never a stroke. Drop anything in progress.
  drawing = false;
  paintAim(null);
}

function movePinch(): void {
  if (pinch === null) return;
  const points = [...down.values()];
  if (points.length < 2) return;
  const a = points[0] as { x: number; y: number };
  const c = points[1] as { x: number; y: number };

  const wanted = (pinch.tile * Math.max(1, gapBetween(a, c))) / pinch.gap;
  viewTile = Math.max(fitTile, Math.min(MAX_TILE, Math.round(wanted)));
  renderer.setTileSize(viewTile);

  // Keep the spot between the fingers where it was, so the level grows out of
  // what you are looking at rather than out of its top-left corner.
  const box = viewport.getBoundingClientRect();
  const mid = midpoint(a, c);
  const tile = renderer.tileSize();
  panX = pinch.cellX - (mid.x - box.left) / tile;
  panY = pinch.cellY - (mid.y - box.top) / tile;

  aim.width = paper.width;
  aim.height = paper.height;
  aim.style.width = paper.style.width;
  aim.style.height = paper.style.height;
  clampPan();
  paintViewbar();
  repaint();
}

const PANS: ReadonlyArray<readonly [string, number, number]> = [
  ["panleft", -4, 0],
  ["panright", 4, 0],
  ["panup", 0, -3],
  ["pandown", 0, 3],
];
for (const [id, dx, dy] of PANS) {
  const button = document.getElementById(id) as HTMLButtonElement;
  button.addEventListener("click", () => {
    panX += dx;
    panY += dy;
    clampPan();
  });
}

// --- the tool and game strips --------------------------------------------------

function paintTools(): void {
  toolsBox.innerHTML = "";
  for (const entry of TOOLS) {
    if (entry.engines !== undefined && !entry.engines.includes(draft.engine)) continue;

    const button = document.createElement("button");
    button.className = entry.glyph === tool ? "on" : "";
    button.setAttribute("aria-pressed", entry.glyph === tool ? "true" : "false");

    // The button shows the tile the game will draw, from the same code the game
    // draws it with -- so a wall looks like stonework, spikes look like spikes,
    // and switching to the side-on game changes the buttons because it changes
    // the world. They used to be flat colours written out a second time here,
    // and they had already drifted from the room.
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.appendChild(tileChip(TILE_OF[entry.glyph] as number, draft.engine === "dash", 22));
    if (entry.rubber === true) {
      const rubber = document.createElement("span");
      rubber.className = "rubber";
      rubber.innerHTML = RUBBER_ICON;
      chip.appendChild(rubber);
    }

    const label = document.createElement("span");
    label.textContent =
      draft.engine === "dash" && entry.skyLabel !== undefined ? entry.skyLabel : entry.label;

    button.append(chip, label);

    if (entry.limit !== undefined) {
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = `${tally(draft, entry.glyph)} of ${entry.limit}`;
      button.appendChild(count);
    }

    button.addEventListener("click", () => {
      tool = entry.glyph;
      saying = "";
      paintTools();
      review();
    });
    toolsBox.appendChild(button);
  }
}

function paintGames(): void {
  gamesBox.innerHTML = "";
  for (const game of GAMES) {
    const button = document.createElement("button");
    const on = game.engine === draft.engine;
    button.className = on ? "on" : "";
    button.textContent = game.label;
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.addEventListener("click", () => {
      if (game.engine === draft.engine) return;
      draft = retarget(draft, game.engine, currentBuild(game.engine));
      // A ladder tool with no ladders in this game would be a dead button.
      if (tool === GLYPH_LADDER && game.engine !== "dash") tool = GLYPH_WALL;
      saying = "";
      paintGames();
      paintTools();
      repaint();
      review();
      store();
    });
    gamesBox.appendChild(button);
  }
}

// --- what the level says about itself -------------------------------------------

function review(): void {
  const advice = adviceFor(draftToText(draft));

  if (saying !== "") {
    says.textContent = saying;
    says.className = "";
  } else if (advice.notes.length > 0) {
    const note = advice.notes[0] as { fatal: boolean; text: string };
    says.textContent = note.text;
    // Three states, three colours: this stops you playing, this is worth
    // knowing, this is fine. A child should not have to read to tell them apart.
    says.className = note.fatal ? "bad" : "warn";
  } else {
    says.textContent = "looks playable. try it and see.";
    says.className = "good";
  }

  playButton.disabled = !advice.playable;
  paintTools();
}

function store(): void {
  saveDraft(draft, nameBox.value);
}

// --- getting out ------------------------------------------------------------------

playButton.addEventListener("click", () => {
  const title = nameBox.value.trim() === "" ? "my level" : nameBox.value.trim();
  try {
    const code = encodeLevel(parseLevel(draftToText(draft)));
    store();
    window.location.href = `../#p/${slugify(title)}/${code}`;
  } catch (err) {
    says.textContent = "this level will not fit in a link";
    says.className = "bad";
    void err;
  }
});

clearButton.addEventListener("click", () => {
  draft = blankDraft(draft.engine, currentBuild(draft.engine));
  saying = "";
  repaint();
  review();
  store();
});

nameBox.addEventListener("input", store);

paintGames();
paintTools();
paintExamples();
refit();
review();

window.addEventListener("resize", refit);
window.addEventListener("orientationchange", refit);

// Everything above works with no network. This is what makes that true after
// the first visit as well -- see src/web/sw.ts.
goOffline("../");
