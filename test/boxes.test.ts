// Surprise boxes, in the two games that have them.
//
//     "What about if we had question mark boxes like in Mario -- it gives you
//      treasure or maybe unleashes an enemy? Kids will like surprising their
//      friends."
//     "I want the author to decide if it's treasure or an enemy."
//     "We need something equivalent for Zelda esque games."
//
// dash/10 is the Mario side of that and roam/10 the Zelda side. They are the
// same box: a WALL until somebody hits it, holding what the author put in it.
// What differs is how you knock on it -- from underneath in a side-on room,
// with your weapon in a room seen from above.

import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { engineFor } from "../src/engines/registry.ts";
import { newestBuild } from "../src/core/builds.ts";
import { PRESETS } from "../src/core/creature.ts";
import { GRID_H, GRID_W } from "../src/core/grid.ts";
import { ONE, toCell } from "../src/core/fixed.ts";
import { TILE_BOX, TILE_BOX_OPEN } from "../src/core/tiles.ts";
import { HELD_ACT, HELD_NONE, HELD_RIGHT, HELD_SWING } from "../src/engines/types.ts";

const WHO = PRESETS[0] as (typeof PRESETS)[number];

interface Boxed {
  step(held: number): number;
  render(): Uint8Array;
  where(): { x: number; y: number; facing: number };
  stateHash(): number;
  enemiesLeft(): number;
  boxesLeft?(): number;
  exitOpen?(): boolean;
  justOpened?(): boolean;
}

/** A flat room with one box three cells to the right of the start. */
function room(engine: string, box: string): string {
  const rows = [`hoppa/1 ${engine} seed=box tiles=0 behaviour=${newestBuild(engine)}`];
  const sideOn = engine === "dash";
  for (let y = 0; y < GRID_H; y++) {
    if (sideOn) { rows.push(y === GRID_H - 1 ? "#".repeat(GRID_W) : "#" + ".".repeat(GRID_W - 2) + "#"); continue; }
    const edge = y === 0 || y === GRID_H - 1;
    rows.push(edge ? "#".repeat(GRID_W) : "#" + ".".repeat(GRID_W - 2) + "#");
  }
  const line = sideOn ? GRID_H - 2 : 6;
  const put = (y: number, x: number, ch: string): void => {
    const s = rows[y + 1] as string;
    rows[y + 1] = s.slice(0, x) + ch + s.slice(x + 1);
  };
  put(line, 2, "@");
  put(line, 5, box);
  put(line, 18, "$");
  put(line, 20, ">");
  return rows.join("\n") + "\n";
}

function start(engine: string, box: string): Boxed {
  return engineFor(parseLevel(room(engine, box)), WHO) as unknown as Boxed;
}

const GAMES = ["roam", "dash"] as const;

test("both games are on a build that knows what a box is", () => {
  expect(newestBuild("roam")).toBe(10);
  expect(newestBuild("dash")).toBe(10);
});

test("a shut box is a wall you cannot walk through", () => {
  // The whole mechanic. It blocks the way, so you have to deal with it -- and
  // dealing with it is a gamble the author already knows the answer to.
  for (const engine of GAMES) {
    const game = start(engine, "?");
    for (let i = 0; i < 120; i = (i + 1) | 0) game.step(HELD_RIGHT);
    expect({ engine, past: toCell(game.where().x) >= 5 }).toEqual({ engine, past: false });
  }
});

test("...and both kinds are drawn IDENTICALLY, or there is no surprise", () => {
  // A trap your friend can see coming is not a trap. The engine emits TILE_BOX
  // for a box with a gem in it and TILE_BOX for a box with a bear in it; only
  // the level editor is allowed to know the difference, because the author is
  // the one person entitled to.
  for (const engine of GAMES) {
    const gem = [...start(engine, "?").render()];
    const monster = [...start(engine, "!").render()];
    expect({ engine, same: gem.join() === monster.join() }).toEqual({ engine, same: true });
    expect({ engine, boxes: gem.filter((t) => t === TILE_BOX).length })
      .toEqual({ engine, boxes: 1 });
  }
});

/**
 * Walk up to the box and swing at it.
 *
 * The weapon is a DIFFERENT BUTTON in the two games, and that is not a detail
 * the test may paper over: from above the action button is the weapon, and
 * from the side the action button is JUMP and the weapon has its own. Swinging
 * with HELD_ACT in a platformer makes the creature hop, which is exactly what
 * the first version of this file did -- every dash case failed and the boxes
 * were fine.
 */
function weaponBit(engine: string): number {
  return engine === "dash" ? HELD_SWING : HELD_ACT;
}

function walkAndSwing(game: Boxed, engine: string): void {
  for (let i = 0; i < 120; i = (i + 1) | 0) game.step(HELD_RIGHT);
  for (let i = 0; i < 6; i = (i + 1) | 0) {
    game.step(HELD_RIGHT | (i === 0 ? weaponBit(engine) : HELD_NONE));
  }
}

test("a swing opens it, and then you can walk through where it was", () => {
  for (const engine of GAMES) {
    const game = start(engine, "?");
    walkAndSwing(game, engine);
    expect({ engine, shut: game.boxesLeft?.() }).toEqual({ engine, shut: 0 });
    expect({ engine, open: [...game.render()].filter((t) => t === TILE_BOX_OPEN).length })
      .toEqual({ engine, open: 1 });
    for (let i = 0; i < 120; i = (i + 1) | 0) game.step(HELD_RIGHT);
    expect({ engine, past: toCell(game.where().x) > 5 }).toEqual({ engine, past: true });
  }
});

test("a gem in a box is a gem: it counts toward the door", () => {
  // What stops boxes being decoration. A room can put a gem in one and mean it,
  // and the friend has to open the thing to get out.
  for (const engine of GAMES) {
    const game = start(engine, "?");
    expect({ engine, open: game.exitOpen?.() }).toEqual({ engine, open: false });
    walkAndSwing(game, engine);
    // One gem from the box, one still lying in the room.
    expect({ engine, open: game.exitOpen?.() }).toEqual({ engine, open: false });
    for (let i = 0; i < 400; i = (i + 1) | 0) game.step(HELD_RIGHT);
    expect({ engine, open: game.exitOpen?.() }).toEqual({ engine, open: true });
  }
});

test("a monster in a box is not in the room until the box is opened", () => {
  for (const engine of GAMES) {
    const game = start(engine, "!");
    expect({ engine, loose: game.enemiesLeft() }).toEqual({ engine, loose: 0 });
    walkAndSwing(game, engine);
    expect({ engine, loose: game.enemiesLeft() }).toEqual({ engine, loose: 1 });
  }
});

test("...and the swing that opens the box does NOT also kill it", () => {
  // Measured, and it was wrong the first time: opening the box before the
  // weapon resolved put a freshly released bear inside the same swing's reach,
  // so one press opened the box AND finished what came out. That is a button,
  // not a gamble.
  for (const engine of GAMES) {
    const game = start(engine, "!");
    walkAndSwing(game, engine);
    expect({ engine, standing: game.enemiesLeft() }).toEqual({ engine, standing: 1 });
  }
});

test("in the side-on game you open one by jumping into it from underneath", () => {
  // The way a platformer has opened a block since the mid eighties. Not
  // anybody's property -- the technique is public and every tile in this game
  // is ours -- and it is the reason a box overhead is worth drawing at all.
  const rows = [`hoppa/1 dash seed=bump tiles=0 behaviour=${newestBuild("dash")}`];
  for (let y = 0; y < GRID_H; y++) {
    rows.push(y === GRID_H - 1 ? "#".repeat(GRID_W) : "#" + ".".repeat(GRID_W - 2) + "#");
  }
  const put = (y: number, x: number, ch: string): void => {
    const s = rows[y + 1] as string;
    rows[y + 1] = s.slice(0, x) + ch + s.slice(x + 1);
  };
  put(GRID_H - 2, 4, "@");
  put(GRID_H - 4, 4, "?");        // directly overhead
  put(GRID_H - 2, 18, "$");
  put(GRID_H - 2, 20, ">");
  const game = engineFor(parseLevel(rows.join("\n") + "\n"), WHO) as unknown as Boxed;
  // HOLD the button. A one-tick tap is a hop -- dash/9's jump cut gives about
  // a third of the rise for a tap -- and a hop does not reach a box two rows
  // up. The first version of this tapped, and read as the bump not working.
  for (let i = 0; i < 60 && (game.boxesLeft?.() ?? 0) > 0; i = (i + 1) | 0) {
    game.step(HELD_ACT);
  }
  expect(game.boxesLeft?.()).toBe(0);
});

test("which boxes are open is in the hash, or a shared level would not replay", () => {
  // It decides what is a wall, what is in your purse and what is loose in the
  // room. Two clients replaying the same log have to agree about all three.
  for (const engine of GAMES) {
    const opened = start(engine, "?");
    const shut = start(engine, "?");
    walkAndSwing(opened, engine);
    for (let i = 0; i < 126; i = (i + 1) | 0) shut.step(HELD_RIGHT);
    expect({ engine, same: opened.stateHash() === shut.stateHash() })
      .toEqual({ engine, same: false });

    // ...and the same log twice is the same state.
    const a = start(engine, "!");
    const b = start(engine, "!");
    walkAndSwing(a, engine);
    walkAndSwing(b, engine);
    expect({ engine, same: a.stateHash() === b.stateHash() }).toEqual({ engine, same: true });
  }
});

test("the builds before them have never heard of a box", () => {
  // Hard rule 3, stated as the thing it protects: a link that pinned roam/9 or
  // dash/9 plays the game it was beaten under, and that game has no boxes in
  // it at all.
  for (const [engine, before] of [["roam", 9], ["dash", 9]] as const) {
    const text = room(engine, "?").replace(`behaviour=${newestBuild(engine)}`, `behaviour=${before}`);
    const game = engineFor(parseLevel(text), WHO) as unknown as Boxed;
    expect({ engine, knows: typeof game.boxesLeft }).toEqual({ engine, knows: "undefined" });
    // The cell is still a wall to them -- it is in the wall bitmap -- so an
    // old build simply sees a room with one more block in it.
    for (let i = 0; i < 120; i = (i + 1) | 0) game.step(HELD_RIGHT);
    expect({ engine, past: toCell(game.where().x) >= 5 }).toEqual({ engine, past: false });
  }
});
