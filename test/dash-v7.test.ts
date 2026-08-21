import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { engineFor, knownBuilds } from "../src/engines/registry.ts";
import { PRESETS } from "../src/core/creature.ts";
import { BODY } from "../src/engines/dash/v7.ts";
import { newestBuild } from "../src/core/builds.ts";
import { PACK } from "../src/core/pack.ts";
import { decodeLevel } from "../src/core/codec.ts";

// dash/7: the enemies move. See docs/adr/0036.
//
// Reported live, watching a nine-year-old: "the lizard enemy doesn't move". It
// was not the lizard -- the letter on an enemy is cosmetic -- it was every
// enemy in every side-on level in every build from dash/1 to dash/6, since day
// 7. Nobody saw it because no side-on level had an enemy in it until day 16.

const who = PRESETS[0] as (typeof PRESETS)[number];

/** How far an enemy wanders, in cells, while the player stands perfectly still. */
function wander(rows: string[], behaviour: number): number {
  const level = parseLevel([`hoppa/1 dash seed=0 tiles=1 behaviour=${behaviour}`, ...rows].join("\n"));
  const engine = engineFor(level, who) as unknown as {
    step(held: number): number;
    enemyPositions(): Array<{ x: number; y: number }>;
  };
  let lo = Infinity;
  let hi = -Infinity;
  for (let tick = 0; tick < 300; tick++) {
    engine.step(0);
    const enemy = engine.enemyPositions()[0];
    if (enemy === undefined) break;
    lo = Math.min(lo, enemy.x);
    hi = Math.max(hi, enemy.x);
  }
  return (hi - lo) / 256;
}

const SKY = Array.from({ length: 12 }, () => "........................");
const flat = (letter: string): string[] =>
  [...SKY, `..@......${letter}..........>...`, "########################"];

test("an enemy walks, whichever letter it is drawn as", () => {
  // A goblin, a bat and a lizard are one behaviour and three pictures. If any
  // of them stood still the others would too, which is what made the report
  // ("the lizard doesn't move") worth checking on all three.
  const walked: Record<string, number> = {};
  for (const letter of ["G", "B", "D"]) walked[letter] = wander(flat(letter), 7);
  console.log(
    `\n  side-on, flat floor, 10 seconds standing still:\n` +
    Object.entries(walked).map(([l, d]) => `    "${l}" wandered ${d.toFixed(1)} cells`).join("\n"),
  );
  for (const letter of ["G", "B", "D"]) {
    expect({ letter, walks: (walked[letter] as number) > 4 }).toEqual({ letter, walks: true });
  }
  // And identically, because the letter is cosmetic and must not reach the
  // engine at all -- hard rule 4.
  expect(walked["B"]).toBe(walked["G"] as number);
  expect(walked["D"]).toBe(walked["G"] as number);
});

test("...and in dash/6 it still does not, because links are permanent", () => {
  // Hard rule 3. Somebody has already sent a link pinned to dash/6, and it has
  // to replay exactly as they played it -- enemies rooted to the spot and all.
  // Fixing this in place would have silently invalidated every proof ever sent.
  for (const letter of ["G", "B", "D"]) {
    expect({ letter, stuck: wander(flat(letter), 6) }).toEqual({ letter, stuck: 0 });
  }
  expect(knownBuilds()).toContain("dash/6");
});

test("a walker turns at a ledge instead of stepping out over it", () => {
  // A three-cell pen: floor at 5, 6, 7, walls at 4 and 8.
  const rows = [
    ...SKY.slice(0, 9),
    "..@.....................",
    "....#####...............",
    "#...#G..#...........>...",
    "#########...............",
    "########################",
  ];
  const level = parseLevel(["hoppa/1 dash seed=0 tiles=1 behaviour=7", ...rows].join("\n"));
  const engine = engineFor(level, who) as unknown as {
    step(held: number): number;
    enemyPositions(): Array<{ x: number; y: number }>;
  };
  let lo = Infinity;
  let hi = -Infinity;
  for (let tick = 0; tick < 400; tick++) {
    engine.step(0);
    const enemy = engine.enemyPositions()[0] as { x: number };
    lo = Math.min(lo, enemy.x);
    hi = Math.max(hi, enemy.x);
  }
  // Its EDGES, not its middle. Measured on the middle -- which is what v6 did
  // everywhere -- a walker buried a third of its body in the bricks.
  const leftEdge = (lo - BODY) / 256;
  const rightEdge = (hi + BODY) / 256;
  console.log(`\n  in a pen from 5.00 to 8.00: body reached ${leftEdge.toFixed(2)} .. ${rightEdge.toFixed(2)}`);
  expect(leftEdge).toBeGreaterThanOrEqual(5);
  expect(rightEdge).toBeLessThanOrEqual(8);
  // ...and it used most of the pen rather than giving up in the middle of it.
  expect(rightEdge - leftEdge).toBeGreaterThan(2);
});

test("a walker on a narrow platform stays on it", () => {
  // Deliberately bounded rather than fixed: a one-cell platform leaves 64
  // subcells of slack round a 192-subcell body and the walker uses it. Every
  // rule that removes the twitch makes the ordinary case worse. Two cells and
  // up -- which is every platform in every shipped room -- patrol properly.
  const rows: string[][] = [];
  for (const width of [1, 2, 3, 5]) {
    rows.push([
      ...SKY.slice(0, 9),
      `${".".repeat(6)}G${".".repeat(17)}`,
      `${".".repeat(6)}${"#".repeat(width)}${".".repeat(18 - width)}`,
      "..@.....................",
      "....................>...",
      "########################",
    ]);
  }
  const travelled = rows.map((r) => wander(r, 7));
  console.log(
    `\n  platform width -> how far the walker gets:\n` +
    [1, 2, 3, 5].map((w, i) => `    ${String(w).padStart(2)} cells: ${(travelled[i] as number).toFixed(2)}`).join("\n"),
  );
  // Nothing wanders off the end of its platform.
  for (let i = 0; i < travelled.length; i++) {
    expect((travelled[i] as number)).toBeLessThanOrEqual([1, 2, 3, 5][i] as number);
  }
  // One cell is a twitch and stays one; the rest actually patrol.
  expect(travelled[0] as number).toBeLessThan(0.3);
  for (let i = 1; i < travelled.length; i++) expect(travelled[i] as number).toBeGreaterThan(1);
});

test("a new level is drawn under dash/7, and the shipped rooms are on it", () => {
  expect(newestBuild("dash")).toBe(7);
  // The reported room. A shipped room on old rules would ship the bug.
  for (const room of PACK) {
    const level = decodeLevel(room.code);
    if (level.engine !== "dash") continue;
    expect({ room: room.name, behaviour: level.behaviourVersion })
      .toEqual({ room: room.name, behaviour: 7 });
  }
});

test("the enemy in every shipped room actually moves", () => {
  // The check that would have caught this on day 16, run over the whole pack.
  const lines: string[] = [];
  for (const room of PACK) {
    const level = decodeLevel(room.code);
    const engine = engineFor(level, who) as unknown as {
      step(held: number): number;
      enemyPositions(): Array<{ x: number; y: number }>;
    };
    const first = engine.enemyPositions();
    if (first.length === 0) continue;
    // Both axes: a patrol from above runs up and down as often as side to side,
    // and measuring only x reports a perfectly busy goblin as motionless.
    const lo = first.map((e) => ({ x: e.x, y: e.y }));
    const hi = first.map((e) => ({ x: e.x, y: e.y }));
    for (let tick = 0; tick < 300; tick++) {
      engine.step(0);
      const now = engine.enemyPositions();
      for (let i = 0; i < now.length; i++) {
        const at = now[i] as { x: number; y: number };
        const a = lo[i] as { x: number; y: number };
        const b = hi[i] as { x: number; y: number };
        a.x = Math.min(a.x, at.x); a.y = Math.min(a.y, at.y);
        b.x = Math.max(b.x, at.x); b.y = Math.max(b.y, at.y);
      }
    }
    for (let i = 0; i < lo.length; i++) {
      const a = lo[i] as { x: number; y: number };
      const b = hi[i] as { x: number; y: number };
      const cells = (Math.max(b.x - a.x, b.y - a.y)) / 256;
      lines.push(`    ${room.name.padEnd(17)} ${level.engine === "dash" ? "side " : "above"} enemy ${i}: ${cells.toFixed(1)} cells`);
      expect({ room: room.name, enemy: i, moves: cells > 0 })
        .toEqual({ room: room.name, enemy: i, moves: true });
    }
  }
  console.log(`\n  every enemy in the pack, over 10 seconds:\n${lines.join("\n")}`);
});

// --- and it faces the way it is going -----------------------------------------
//
// Asked as soon as they started walking: "the lizard needs to turn to face the
// direction it's walking?". Until v7 no side-on enemy ever took a step, so all
// of them could be drawn facing one way and nobody could tell. The moment they
// walk, one of the two directions is a moonwalk.

test("an enemy says which way it is walking, and changes its mind at a wall", () => {
  const level = parseLevel([
    "hoppa/1 dash seed=0 tiles=1 behaviour=7",
    ...SKY.slice(0, 9),
    "..@.....................",
    "....#####...............",
    "#...#G..#...........>...",
    "#########...............",
    "########################",
  ].join("\n"));
  const engine = engineFor(level, who) as unknown as {
    step(held: number): number;
    stateHash(): number;
    enemyPositions(): Array<{ x: number; dir: number }>;
  };
  const seen = new Set<number>();
  for (let tick = 0; tick < 400; tick++) {
    engine.step(0);
    seen.add((engine.enemyPositions()[0] as { dir: number }).dir);
  }
  // It walks both ways in a pen, so a picture has both to draw.
  expect([...seen].sort()).toEqual([-1, 1]);
});

test("...and looking at which way it faces changes nothing", async () => {
  // A walker's direction is not a cosmetic bolted on for this: it has been in
  // stateHash() since dash/1, because turning at a ledge is simulation. What
  // changed is only that it is no longer private. Hard rule 4 forbids
  // cosmetics REACHING the hash; it does not forbid the picture reading the
  // state. This pins that it was already there, so nobody later "tidies" it
  // out of the hash on the grounds that it is only used for drawing.
  const source = await Bun.file("src/engines/dash/v7.ts").text();
  const hash = source.slice(source.indexOf("stateHash(): number {"));
  expect(hash.slice(0, hash.indexOf("\n  }\n"))).toContain("hashInt32(h, walker.dir)");

  // Two runs of the same log agree, which is what a shared link depends on.
  const rows = [
    "hoppa/1 dash seed=0 tiles=1 behaviour=7",
    ...SKY.slice(0, 12), "..@......G..........>...", "########################",
  ].join("\n");
  const run = (): number => {
    const e = engineFor(parseLevel(rows), who) as unknown as {
      step(held: number): number; stateHash(): number;
      enemyPositions(): Array<{ dir: number }>;
    };
    for (let t = 0; t < 200; t++) {
      e.step(0);
      e.enemyPositions();  // looked at on every frame, the way the page does
    }
    return e.stateHash();
  };
  expect(run()).toBe(run());
});

test("the picture is mirrored when it walks left", async () => {
  // A flip, not a second set of drawings: the art is a silhouette with a light
  // side, and at 16 pixels a mirror reads as a turn. Checked in a browser on
  // "the tall room" -- snout and eye lead the way it is going, both ways.
  const renderer = await Bun.file("src/web/play/renderer.ts").text();
  expect(renderer).toContain("const mirrored = (enemy.dir ?? 1) < 0;");
  expect(renderer).toContain("ctx.scale(-1, 1);");
  // The field is optional, so every engine before dash/7 -- none of which had
  // a walker that moved -- draws exactly as it did.
  expect(renderer).toContain("dir?: number;");
});
