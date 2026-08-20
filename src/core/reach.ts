// Flood fill over open cells. Spec S16 notes that L3 and L4 are reachability,
// not search: a BFS solver is a design tool, not something the share gate needs.
//
// Guards do not block the fill. L3 says "ignoring guards" on purpose -- a patrol
// makes a route hard, not impossible, and a level that is merely hard is fine.

import { GRID_AREA, GRID_H, GRID_W, idx } from "./grid.ts";
import type { Level } from "./level.ts";

/**
 * 1 where the cell is open and walkable from (fromX, fromY). Length GRID_AREA.
 *
 * `avoidingFire` treats a burning cell as if it were a wall. That is NOT what
 * L3 and L4 do -- fire is like a guard there, something that makes a route
 * expensive rather than impossible, and you can walk through it and lose a
 * heart. It is used to answer a narrower question: is the only way through on
 * fire? Which is worth telling somebody, and is not a reason to refuse a level.
 */
export function reachableFrom(
  level: Level,
  fromX: number,
  fromY: number,
  avoidingFire = false,
): Uint8Array {
  const seen = new Uint8Array(GRID_AREA);
  if (level.walls[idx(fromX, fromY)] === 1) return seen;

  // A ring buffer sized to the grid: every cell is queued at most once.
  const queue = new Int16Array(GRID_AREA);
  let head = 0;
  let tail = 0;
  queue[tail] = idx(fromX, fromY) | 0;
  tail = (tail + 1) | 0;
  seen[idx(fromX, fromY)] = 1;

  while (head < tail) {
    const cell = queue[head] as number;
    head = (head + 1) | 0;
    const x = (cell % GRID_W) | 0;
    const y = ((cell / GRID_W) | 0) | 0;

    for (let d = 0; d < 4; d = (d + 1) | 0) {
      const nx = (x + (NEIGHBOUR_DX[d] as number)) | 0;
      const ny = (y + (NEIGHBOUR_DY[d] as number)) | 0;
      if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
      const n = idx(nx, ny);
      if (seen[n] === 1 || level.walls[n] === 1) continue;
      if (avoidingFire && level.fires[n] === 1) continue;
      seen[n] = 1;
      queue[tail] = n | 0;
      tail = (tail + 1) | 0;
    }
  }

  return seen;
}

const NEIGHBOUR_DX: readonly number[] = [0, 1, 0, -1];
const NEIGHBOUR_DY: readonly number[] = [-1, 0, 1, 0];

export function countOpen(level: Level): number {
  let open = 0;
  for (let i = 0; i < GRID_AREA; i = (i + 1) | 0) {
    if (level.walls[i] === 0) open = (open + 1) | 0;
  }
  return open;
}
