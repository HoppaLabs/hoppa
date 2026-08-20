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
  GLYPH_EXIT, GLYPH_FLOOR, GLYPH_GUARD, GLYPH_LADDER,
  GLYPH_START, GLYPH_TREASURE, GLYPH_WALL,
} from "../../core/level.ts";
import { parseLevel } from "../../core/level.ts";
import {
  blankDraft, draftFromLevel, draftToText, paint, retarget, tally,
  type Draft, type Glyph,
} from "../../core/draft.ts";
import { adviceFor } from "../../core/advice.ts";
import { decodeLevel, encodeLevel } from "../../core/codec.ts";
import { slugify } from "../play/link.ts";
import { GridRenderer } from "../play/renderer.ts";
import {
  TILE_ACTOR, TILE_EXIT_LOCKED, TILE_FLOOR, TILE_GUARD,
  TILE_LADDER, TILE_TREASURE, TILE_WALL,
} from "../../core/tiles.ts";
import { loadDraft, saveDraft } from "../stash.ts";

// --- what you can draw with ---------------------------------------------------
//
// Plain words only. "Tile", "entity", "spawn point" and "patrol" are all things
// a nine-year-old would have to be taught before they could draw a room.

interface Tool {
  readonly glyph: Glyph;
  readonly label: string;
  readonly colour: string;
  /**
   * The swatch for the side-on game, where the terrain palette changes. A
   * button showing dark grey that paints green is a button that lies.
   */
  readonly skyColour?: string;
  /** Only offered for the games that have it. */
  readonly engines?: readonly string[];
  /** Shows "3 of 8" under the button when there is a limit worth knowing. */
  readonly limit?: number;
}

const TOOLS: readonly Tool[] = [
  { glyph: GLYPH_WALL, label: "wall", colour: "#39485c", skyColour: "#5c7a4a" },
  { glyph: GLYPH_FLOOR, label: "clear", colour: "#222a35", skyColour: "#a8d4f0" },
  { glyph: GLYPH_START, label: "start", colour: "#e8b76a" },
  { glyph: GLYPH_EXIT, label: "door / exit", colour: "#b07acb" },
  { glyph: GLYPH_TREASURE, label: "treasure", colour: "#5fd3f3", limit: 8 },
  { glyph: GLYPH_GUARD, label: "enemy", colour: "#ff5f4d", limit: 10 },
  { glyph: GLYPH_LADDER, label: "ladder", colour: "#c8a26a", engines: ["dash"] },
];

const GAMES = [
  { engine: "roam", behaviour: 3, label: "from above" },
  { engine: "dash", behaviour: 3, label: "from the side" },
] as const;

const TILE_OF: Record<string, number> = {
  [GLYPH_WALL]: TILE_WALL,
  [GLYPH_FLOOR]: TILE_FLOOR,
  [GLYPH_START]: TILE_ACTOR,
  [GLYPH_EXIT]: TILE_EXIT_LOCKED,
  [GLYPH_TREASURE]: TILE_TREASURE,
  [GLYPH_GUARD]: TILE_GUARD,
  [GLYPH_LADDER]: TILE_LADDER,
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
 * storage: you got here by tapping "change this level" on a level somebody
 * sent you, and that is a deliberate act. This is the remix loop -- your
 * friend's room, your walls, your creature -- and it is why the level lives in
 * the link rather than on a server.
 */
function opening(): { draft: Draft; name: string } {
  if (window.location.hash.startsWith("#from/")) {
    try {
      const level = decodeLevel(window.location.hash.slice("#from/".length));
      return { draft: draftFromLevel(level), name: "my version" };
    } catch {
      // A broken code is not worth an error page: fall through to the draft.
    }
  }
  const saved = loadDraft();
  if (saved !== null) return saved;
  return { draft: blankDraft(GAMES[0].engine, GAMES[0].behaviour), name: "my level" };
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
 * Whether the level is drawn bigger than the screen and scrolled.
 *
 * On a phone the level is as wide as it can be at "whole level" -- 24 cells
 * across about 370 points is roughly a 15 point cell, and a fingertip is nearer
 * 40. You cannot have both the whole level and a comfortable target on a screen
 * that size, so this is the choice: see everything, or see it properly.
 */
let big = false;

/**
 * The cell size "bigger" aims for, in points. Apple and Google both put the
 * smallest safe touch target near 44; this is under that because you can slide
 * to correct before letting go, and a 44 point cell would show six columns.
 */
const COMFORTABLE = 34;

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
  const availableHeight = wide
    ? Math.max(200, window.innerHeight - 90)
    : Math.max(150, window.innerHeight - sideBox.height - 140);

  // Fit first, then multiply: the zoom is "twice as big as it would otherwise
  // be", not a fixed cell size, so it means the same thing on every screen.
  renderer.fit(availableWidth, availableHeight);
  const fitted = renderer.tileSize();
  // Twice as big, or comfortable, whichever is bigger. A fixed multiple would
  // leave a small phone at 20 points a cell, which is no better than it was.
  if (big) renderer.setTileSize(Math.max(fitted * 2, COMFORTABLE));

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
  zoomButton.textContent = big ? "whole level" : "bigger";
  pans.hidden = !scrolls;
}

function repaint(): void {
  for (let i = 0; i < tiles.length; i = (i + 1) | 0) {
    tiles[i] = TILE_OF[draft.cells[i] as string] ?? TILE_FLOOR;
  }
  // Sky for the side-on game, so tapping "from the side" visibly changes the
  // world rather than only changing which tools are on offer.
  renderer.setSideOn(draft.engine === "dash");
  renderer.draw(tiles, false);
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
  const cell = cellAt(event);
  if (cell === null) return;
  paper.setPointerCapture(event.pointerId);
  drawing = true;
  lastCell = cell.y * GRID_W + cell.x;
  paintAim(cell);
  if (draggable(tool)) put(cell.x, cell.y);
});

paper.addEventListener("pointermove", (event) => {
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
  if (!drawing) return;
  drawing = false;
  const cell = cellAt(event);
  paintAim(null);
  if (cell !== null && !draggable(tool)) put(cell.x, cell.y);
});

for (const name of ["pointercancel", "pointerleave"]) {
  paper.addEventListener(name, () => {
    drawing = false;
    paintAim(null);
  });
}

// --- looking around ---------------------------------------------------------------

zoomButton.addEventListener("click", () => {
  big = !big;
  if (!big) { panX = 0; panY = 0; }
  refit();
});

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

    const chip = document.createElement("span");
    chip.className = "chip";
    chip.style.background =
      draft.engine === "dash" && entry.skyColour !== undefined ? entry.skyColour : entry.colour;

    const label = document.createElement("span");
    label.textContent = entry.label;

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
      draft = retarget(draft, game.engine, game.behaviour);
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
  draft = blankDraft(draft.engine, draft.behaviourVersion);
  saying = "";
  repaint();
  review();
  store();
});

nameBox.addEventListener("input", store);

paintGames();
paintTools();
refit();
review();

window.addEventListener("resize", refit);
window.addEventListener("orientationchange", refit);
