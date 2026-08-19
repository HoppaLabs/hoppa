// Presentation layer for the terminal. Maps tile indices to glyphs.
// This is a debug view, not the truth -- see spec S1.

import { GRID_H, GRID_W } from "../core/grid.ts";
import {
  TILE_ACTOR,
  TILE_EXIT_LOCKED,
  TILE_EXIT_OPEN,
  TILE_FLOOR,
  TILE_GUARD,
  TILE_TREASURE,
  TILE_VOID,
  TILE_WALL,
} from "../core/tiles.ts";

const GLYPHS: Record<number, string> = {
  [TILE_VOID]: " ",
  [TILE_FLOOR]: ".",
  [TILE_WALL]: "#",
  [TILE_ACTOR]: "@",
  [TILE_TREASURE]: "$",
  // A shut exit is drawn as a door, an open one as the spec's exit glyph, so
  // you can see the state over SSH without reading the HUD.
  [TILE_EXIT_LOCKED]: "+",
  [TILE_EXIT_OPEN]: ">",
  [TILE_GUARD]: "G",
};

export function renderAscii(tiles: Uint8Array): string {
  const rows: string[] = [];
  for (let y = 0; y < GRID_H; y++) {
    let row = "";
    for (let x = 0; x < GRID_W; x++) {
      row += GLYPHS[tiles[y * GRID_W + x] as number] ?? "?";
    }
    rows.push(row);
  }
  return rows.join("\n");
}
