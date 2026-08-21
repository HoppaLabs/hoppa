import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { engineFor, knownBuilds } from "../src/engines/registry.ts";
import { PRESETS } from "../src/core/creature.ts";
import { HELD_ACT, HELD_RIGHT, HELD_SWING, STATUS_PLAYING } from "../src/engines/types.ts";
import { newestBuild } from "../src/core/builds.ts";
import { tilesetFor } from "../src/core/tileset.ts";
import { CASTS, ENEMIES } from "../src/core/enemies.ts";
import { ENGINE_IDS } from "../src/core/codec.ts";
import { GAMES as PICKER } from "../src/web/level/palette.ts";

// Four games shipped in one stretch, and the things that differ between them
// are spread across an engine, a tileset, a cast, a pad and a HUD. This is the
// audit that found a SWORD in the garden -- and, worse, that it worked: five
// swings cleared every bunny out of the shipped room. Nothing failed. Every
// test passed. It was found by looking at all four side by side.
//
// So the looking is a test now.

const who = PRESETS[0] as (typeof PRESETS)[number];

/** A room with an enemy two cells away, so "can I hurt it" is asked directly. */
function armsReach(engine: string, build: number, sideOn: boolean): string {
  const rows = sideOn
    ? [...Array.from({ length: 12 }, () => "........................"),
       "..@..G..............>...", "########################"]
    : ["########################", "#.@..G...............>.#",
       ...Array.from({ length: 11 }, () => "#......................#"),
       "########################"];
  return [`hoppa/1 ${engine} seed=0 tiles=1 behaviour=${build}`, ...rows].join("\n");
}

/**
 * Each game at its newest build, and what that build is FOR.
 *
 * The garden changed sides. calm/1 was a place -- nothing to win, nothing to
 * lose, nothing you could hurt -- and calm/2 was asked for with an exit, a
 * bear and a weapon, which makes it a level wearing a garden. Both are still
 * shipped, so both are checked, and the version is part of the row rather than
 * something the reader has to know. See adr/0045.
 */
const GAMES = [
  { engine: "roam", version: newestBuild("roam"), sideOn: false, world: "underground", killable: true, ends: true },
  { engine: "dash", version: newestBuild("dash"), sideOn: true, world: "outside", killable: true, ends: true },
  { engine: "swim", version: newestBuild("swim"), sideOn: true, world: "reef", killable: true, ends: true },
  { engine: "calm", version: 1, sideOn: false, world: "garden", killable: false, ends: false },
  { engine: "calm", version: 2, sideOn: false, world: "garden", killable: true, ends: true },
] as const;

/** How a row names itself when a test prints or asserts on it. */
const nameOf = (game: (typeof GAMES)[number]) => `${game.engine}/${game.version}`;

test("each game gets its own world, and its own cast living in it", () => {
  const rows: string[] = [];
  for (const game of GAMES) {
    const world = tilesetFor(game.sideOn, game.engine);
    const cast = (CASTS[world.name] ?? ENEMIES).map((one) => one.name);
    rows.push(`  ${game.engine.padEnd(5)} -> ${world.name.padEnd(12)} ${cast.join(", ")}`);
    expect({ engine: game.engine, world: world.name })
      .toEqual({ engine: game.engine, world: game.world });
    expect(cast).toHaveLength(3);
  }
  console.log(`\n${rows.join("\n")}`);
  // No two games share a cast: a bat underwater and a goblin on a lawn are the
  // bug this exists to stop coming back.
  const casts = GAMES.map((g) => (CASTS[g.world] ?? ENEMIES).map((o) => o.name).join());
  expect(new Set(casts).size).toBe(3);   // roam and dash share the dungeon three
});

test("only the games that are ABOUT fighting let you hurt anything", () => {
  const rows: string[] = [];
  for (const game of GAMES) {
    const level = parseLevel(armsReach(game.engine, game.version, game.sideOn));
    const engine = engineFor(level, who) as unknown as {
      step(held: number): number; enemyPositions(): unknown[];
    };
    const before = engine.enemyPositions().length;
    for (let tick = 0; tick < 600; tick++) engine.step(HELD_RIGHT | HELD_ACT | HELD_SWING);
    const after = engine.enemyPositions().length;
    rows.push(`  ${nameOf(game).padEnd(7)} ${before} -> ${after}  ${after < before ? "killable" : "unharmed"}`);
    expect({ game: nameOf(game), killable: after < before })
      .toEqual({ game: nameOf(game), killable: game.killable });
  }
  console.log(`\n  twenty seconds of walking into it and swinging:\n${rows.join("\n")}`);
});

test("calm/1 never ends; every other build does", () => {
  for (const game of GAMES) {
    const level = parseLevel(armsReach(game.engine, game.version, game.sideOn));
    const engine = engineFor(level, who) as unknown as {
      step(held: number): number; currentStatus(): number;
    };
    let status: number = STATUS_PLAYING;
    for (let tick = 0; tick < 4000 && status === STATUS_PLAYING; tick++) status = engine.step(0);
    expect({ game: nameOf(game), ends: status !== STATUS_PLAYING })
      .toEqual({ game: nameOf(game), ends: game.ends });
  }
});

test("the pad offers what the game has, and nothing it does not", async () => {
  const play = await Bun.file("src/web/play/main.ts").text();
  // Jump: side-on with gravity only. Swimming is from the side and nothing in
  // it falls, so it has no jump.
  expect(play).toContain('const jumping = level.engine === "dash";');
  // The bucket: top-down, and only where there is a fire to put out.
  expect(play).toContain('return engine === "roam" && version >= FIRST_WATERED_ROAM;');
  // And a garden has no action button at all -- no weapon, nothing jumps, and
  // playing with a bunny is done by walking into it. A SWORD in a cosy place
  // says the game wants something of you that it does not.
  expect(play).toContain("button.hidden = aPlace();");
  // ...nor a clock or hearts, which are scoreboards for a game nobody plays.
  expect(play).toContain("hud.innerHTML = aPlace()");
});

test("every game is reachable, named, and routed", () => {
  // The picker itself, imported -- it used to be grepped out of the editor's
  // source, which stopped finding it the moment the palette moved to its own
  // file, and would have gone on passing if the picker had been deleted from
  // one file and left in the other.
  const named = ["adventure", "platformer", "underwater", "garden"];
  // GAMES lists BUILDS and carries calm twice, so compare against the engines
  // it names rather than its rows.
  const engines = [...new Set(GAMES.map((game) => game.engine))];
  expect(PICKER.map((game) => game.engine)).toEqual(engines);
  expect(PICKER.map((game) => game.label as string)).toEqual(named);
  for (const game of PICKER) {
    expect(ENGINE_IDS).toContain(game.engine);
    expect(knownBuilds()).toContain(`${game.engine}/${newestBuild(game.engine)}`);
  }
  console.log(`\n  the picker, left to right: ${named.join("  |  ")}`);
});
