// Standing on a thing does not rub it out.
//
// "When the player sprites moves over a bridge or ladder or current the prop
// sprites disappear, can we draw the player sprite on top?"
//
// The engine emits one tile index per cell and the actor's own index
// overwrites whatever it is standing on. A moving frame draws the actors
// separately at their real positions, so the cell they occupy is painted as
// what is UNDER them -- and that was plain floor, always, which erased the
// rung, the plank or the current for as long as you were there.
//
// Ladders and currents are read off the level, the same way guardArt and
// flowArt already are. A fire is deliberately not: roam/8's bucket can put one
// out, the level does not know which are out, and reading it from there would
// relight a doused one whenever somebody stood on it.

import { expect, test } from "bun:test";
import { standingOn } from "../src/web/play/renderer.ts";
import {
  TILE_ACTOR, TILE_FLOOR, TILE_FLOW, TILE_GUARD, TILE_GUARD_REELING, TILE_LADDER, TILE_WALL,
} from "../src/core/tiles.ts";

const LADDER_CELL = 40;
const FLOW_CELL = 41;
const under = new Map<number, number>([[LADDER_CELL, TILE_LADDER], [FLOW_CELL, TILE_FLOW]]);

test("an actor on a ladder leaves the ladder showing", () => {
  expect(standingOn(TILE_ACTOR, true, under, LADDER_CELL)).toBe(TILE_LADDER);
});

test("an actor on a current leaves the current showing", () => {
  expect(standingOn(TILE_ACTOR, true, under, FLOW_CELL)).toBe(TILE_FLOW);
});

test("an enemy standing on one does the same -- a bat on a bridge", () => {
  expect(standingOn(TILE_GUARD, true, under, LADDER_CELL)).toBe(TILE_LADDER);
  expect(standingOn(TILE_GUARD_REELING, true, under, LADDER_CELL)).toBe(TILE_LADDER);
});

test("on bare ground it is still bare ground", () => {
  expect(standingOn(TILE_ACTOR, true, under, 7)).toBe(TILE_FLOOR);
  expect(standingOn(TILE_ACTOR, true, null, LADDER_CELL)).toBe(TILE_FLOOR);
});

test("nothing else is touched", () => {
  for (const tile of [TILE_WALL, TILE_LADDER, TILE_FLOW, TILE_FLOOR]) {
    expect(standingOn(tile, true, under, LADDER_CELL)).toBe(tile);
  }
});

test("a still frame keeps the actor's own tile, because nothing draws it after", () => {
  // The turn-based games have no separate sprite pass: the actor IS the tile.
  expect(standingOn(TILE_ACTOR, false, under, LADDER_CELL)).toBe(TILE_ACTOR);
  expect(standingOn(TILE_GUARD, false, under, LADDER_CELL)).toBe(TILE_GUARD);
});
