// The junk bolted to the station's walls, and the lamps on it.
//
//     "I was thinking more 'GREEBLIES' like in Star Wars and blinking lights"
//
// All of it is decoration and none of it reaches stateHash(), so what is worth
// asserting is not "does it look right" -- nothing here can answer that -- but
// the four things that would be invisible until somebody looked at a phone:
//
//   1. an egg does not get a vent bolted to it
//   2. the same cell gets the same junk every time, for everybody
//   3. it is scattered, not stripes and not wallpaper
//   4. the lamps do not blink in step
//
// Three and four are the ones a screenshot would eventually catch and a green
// suite never would, which is the whole argument for this file existing.

import { expect, test } from "bun:test";
import { boltedAt, lampLit, type Bolted } from "../src/web/play/greeble.ts";
import { GRID_H, GRID_W } from "../src/core/grid.ts";
import { POND_E, POND_N, POND_S, POND_W, SPACE } from "../src/core/tileset.ts";

const KINDS = (SPACE.greebles ?? []).length;
const COLOURS = (SPACE.greebleLights ?? []).length;
const ALL_OPEN = POND_N | POND_E | POND_S | POND_W;
/** A wall in a run east to west: the commonest cell in a corridor. */
const IN_A_RUN = POND_N | POND_S;

test("the station has junk to bolt on, and colours to light it with", () => {
  // The list being empty is not an error anywhere -- boltedAt() just returns
  // null and every wall comes out bare, which is exactly how it looked before
  // any of this and would read as "nothing happened" rather than as a bug.
  expect({ kinds: KINDS > 0, colours: COLOURS > 0 }).toEqual({ kinds: true, colours: true });
});

test("an egg never has a vent bolted to it", () => {
  // A wall cell with nothing beside it is that world's lone thing. In the
  // station it is an alien egg, and a junction box screwed to the side of one
  // is the sort of thing that ships because nobody thought to look.
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      expect({ x, y, bolted: boltedAt(x, y, ALL_OPEN, KINDS, COLOURS) })
        .toEqual({ x, y, bolted: null });
    }
  }
});

test("a wall cell gets the same junk every time anybody opens the link", () => {
  // The whole reason this is a hash of the coordinates rather than a random
  // draw: two children looking at one shared level have to see one wall.
  for (const [x, y] of [[3, 4], [11, 7], [22, 12], [0, 0]] as const) {
    const first = boltedAt(x, y, IN_A_RUN, KINDS, COLOURS);
    for (let again = 0; again < 5; again++) {
      expect(boltedAt(x, y, IN_A_RUN, KINDS, COLOURS)).toEqual(first);
    }
  }
});

test("about half the wall is bare, and every kind gets used", () => {
  // Wallpaper at one end, litter at the other. Measured over a whole grid
  // rather than asserted about the constant, so changing the constant has to
  // survive this rather than just move it.
  let bolted = 0;
  const seen = new Set<number>();
  const colours = new Set<number>();
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const one = boltedAt(x, y, IN_A_RUN, KINDS, COLOURS);
      if (one === null) continue;
      bolted++;
      seen.add(one.which);
      colours.add(one.colour);
    }
  }
  const cells = GRID_W * GRID_H;
  const share = Math.round((bolted * 100) / cells);
  console.log(`\n  ${bolted} of ${cells} cells carry something -- ${share}%`);
  console.log(`  ${seen.size} of ${KINDS} kinds used, ${colours.size} of ${COLOURS} colours`);
  expect({ tooMuch: share > 70, tooLittle: share < 25 }).toEqual({ tooMuch: false, tooLittle: false });
  expect({ kinds: seen.size, colours: colours.size }).toEqual({ kinds: KINDS, colours: COLOURS });
});

test("...and it is scattered rather than striped", () => {
  // THE FIRST VERSION OF THIS TEST COULD NOT SEE A STRIPE.
  //
  // It counted bare rows and bare columns, which sounds like a scatter check
  // and is not: replace the hash with `x + y` and every anti-diagonal becomes
  // one value, so whole diagonals match -- and since a row crosses many
  // diagonals, no row comes out bare and the test passes. `check:mutants` said
  // so, by striping the wall and staying green.
  //
  // What a stripe actually IS, is neighbours agreeing. So measure that: how
  // often does a cell carry the same thing as the cell one step away? Chance
  // is about 29% -- both bare a quarter of the time, plus both carrying the
  // same one of six -- and a stripe in any direction sends its own direction
  // to 100%.
  const key = (x: number, y: number): number => {
    const one = boltedAt(x, y, IN_A_RUN, KINDS, COLOURS);
    return one === null ? -1 : one.which;
  };
  const rows: string[] = [];
  for (const [dx, dy, name] of [[1, 0, "right"], [0, 1, "down"], [1, -1, "up-right"], [1, 1, "down-right"]] as const) {
    let same = 0;
    let pairs = 0;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
        pairs++;
        if (key(x, y) === key(nx, ny)) same++;
      }
    }
    const share = Math.round((same * 100) / pairs);
    rows.push(`  ${name.padEnd(11)} ${share}% of neighbour pairs match`);
    expect({ name, striped: share > 60 }).toEqual({ name, striped: false });
  }
  console.log(`\n${rows.join("\n")}`);

  // ...and the cheap one it started as, kept because it catches the opposite
  // failure: junk that clusters into one corner and leaves the rest bare.
  const perRow = Array.from({ length: GRID_H }, () => 0);
  const perCol = Array.from({ length: GRID_W }, () => 0);
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (boltedAt(x, y, IN_A_RUN, KINDS, COLOURS) === null) continue;
      perRow[y] = (perRow[y] as number) + 1;
      perCol[x] = (perCol[x] as number) + 1;
    }
  }
  expect({ bareRows: perRow.filter((n) => n === 0).length }).toEqual({ bareRows: 0 });
  expect({ bareCols: perCol.filter((n) => n === 0).length }).toEqual({ bareCols: 0 });
  expect({ fullRows: perRow.filter((n) => n === GRID_W).length }).toEqual({ fullRows: 0 });
});

test("the lamps do not blink in step", () => {
  // A wall of lamps sharing one period is one thing flashing. Two things are
  // asserted: the periods differ across the wall, and at any given moment the
  // lamps are not all in the same state.
  const periods = new Set<number>();
  const lamps: Bolted[] = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const one = boltedAt(x, y, IN_A_RUN, KINDS, COLOURS);
      if (one === null) continue;
      periods.add(one.period);
      lamps.push(one);
    }
  }
  expect({ periods: periods.size > 3 }).toEqual({ periods: true });

  // Sampled across a few seconds. At no instant are they all on or all off.
  const rows: string[] = [];
  for (const now of [0, 370, 900, 1500, 2600, 4100]) {
    const lit = lamps.filter((one) => lampLit(one, now)).length;
    rows.push(`  ${String(now).padStart(5)}ms  ${lit} of ${lamps.length} lit`);
    expect({ now, allOn: lit === lamps.length, allOff: lit === 0 })
      .toEqual({ now, allOn: false, allOff: false });
  }
  console.log(`\n${rows.join("\n")}`);
});

test("a lamp is lit more often than it is dark", () => {
  // Half and half reads as broken rather than as busy. Two beats in three.
  const one = boltedAt(3, 4, IN_A_RUN, KINDS, COLOURS);
  expect(one).not.toBeNull();
  const lamp = one as Bolted;
  let lit = 0;
  for (let beat = 0; beat < 300; beat++) {
    if (lampLit(lamp, beat * lamp.period)) lit++;
  }
  expect({ lit }).toEqual({ lit: 200 });
});

test("a huge clock does not wrap the blink negative", () => {
  // flameFrame() shipped this exact bug: Date.now() / 160 is about eleven
  // billion, `| 0` wraps it negative, the lookup misses and the tile falls
  // through to a flat orange square. Same arithmetic here, so same guard.
  const lamp = boltedAt(3, 4, IN_A_RUN, KINDS, COLOURS) as Bolted;
  for (const now of [Date.now(), 2 ** 31 * 320, 2 ** 40]) {
    expect({ now, lit: typeof lampLit(lamp, now) }).toEqual({ now, lit: "boolean" });
  }
});
