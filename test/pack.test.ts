import { expect, test } from "bun:test";
import { PACK } from "../src/core/pack.ts";
import { PRESETS } from "../src/core/creature.ts";
import { decodeLevel, encodeLevel } from "../src/core/codec.ts";
import { parseLevel } from "../src/core/level.ts";
import { verifyLevelText } from "../src/core/verify.ts";
import { botPlays, replayWins } from "../tools/bot.ts";
import { newestBuild } from "../src/core/builds.ts";
import { aPlace, blankDraft, draftFromLevel, paint } from "../src/core/draft.ts";
import { GRID_H, GRID_W, idx } from "../src/core/grid.ts";

/** The pack as level text, which is what the checks and the bot both want. */
const rooms = await Promise.all(
  PACK.map(async (room, at) => ({
    ...room,
    at: at + 1,
    text: await Bun.file(
      `levels/pack/${at + 1}-${room.slug}.lvl`,
    ).text(),
  })),
);

/**
 * The rooms that are CHALLENGES, which is every room but the garden.
 *
 * A place is not a level with the difficulty turned down; it is a different
 * kind of thing, and most of what this file checks -- an exit, a route to it, a
 * bot that can get out -- is meaningless applied to somewhere you go to sit.
 *
 * Asked by aPlace() rather than by engine name, because the garden changed
 * sides: calm/1 was a place and calm/2 is a level wearing one, so "is it a
 * calm level" stopped being the question. The pack ships no place at all now,
 * and the row below says so rather than pretending otherwise. See adr/0045.
 */
const challenges = rooms.filter((room) => {
  const level = parseLevel(room.text);
  return !aPlace(level.engine, level.behaviourVersion);
});
const places = rooms.filter((room) => {
  const level = parseLevel(room.text);
  return aPlace(level.engine, level.behaviourVersion);
});
const gardens = rooms.filter((room) => parseLevel(room.text).engine === "calm");

test("eleven rooms ship, and the file on disk is the code in the bundle", () => {
  // Six taught the game; three more teach the hazard that does not move; the
  // tenth is not a challenge at all.
  expect(PACK.length).toBe(11);
  // The pack ships no PLACE any more: the garden became a level in adr/0045.
  expect(places).toHaveLength(0);
  expect(gardens).toHaveLength(1);
  for (const room of rooms) {
    // The .lvl file is the source; the code is generated from it. If they drift,
    // the level somebody plays is not the level anybody checked.
    expect({ name: room.name, code: encodeLevel(parseLevel(room.text)) }).toEqual({
      name: room.name,
      code: room.code,
    });
  }
});

test("every room passes the checks a child's own level has to pass", () => {
  for (const room of challenges) {
    const failed = verifyLevelText(room.text)
      .checks.filter((check) => !check.ok)
      .map((check) => `${check.id}: ${check.detail}`);
    expect({ name: room.name, failed }).toEqual({ name: room.name, failed: [] });
  }
});

test("every room can be finished, by every ready-made creature", () => {
  // Reachability is not beatability: L3 and L4 flood-fill the open cells and
  // know nothing about guards, hearts, gravity or the two-minute clock. This
  // hands the room to a bot that plays the way a child plays the first time --
  // straight at everything, no dodging -- and requires it to get out.
  //
  // A room the bot cannot finish is not necessarily unfinishable. It is a room
  // too hard to be one of the six the game opens with, which is the same answer
  // for this purpose.
  const table: string[] = [];
  for (const room of challenges) {
    for (const creature of PRESETS) {
      const attempt = botPlays(room.text, creature);
      table.push(
        `  ${String(room.at)}. ${room.name.padEnd(14)} ${creature.name.padEnd(5)} ` +
          `${attempt.won ? `won in ${attempt.seconds}s` : attempt.why.padEnd(9)}` +
          `  treasure ${attempt.treasure}  hearts ${attempt.hearts}`,
      );
      expect({ room: room.name, creature: creature.name, won: attempt.won }).toEqual({
        room: room.name,
        creature: creature.name,
        won: true,
      });
      // ...and the win is replayed cold, the same proof the share gate uses.
      expect({ room: room.name, creature: creature.name, replays: replayWins(room.text, creature, attempt.log) })
        .toEqual({ room: room.name, creature: creature.name, replays: true });
    }
  }
  console.log("\n" + table.join("\n"));
});

test("the rooms get longer, so the order on screen is the order to play them", () => {
  // Not a difficulty score -- how long the same bot takes is the closest thing
  // to one that can be measured. Only within one game, though: a side-on room
  // is walked at a different speed to a top-down one, and "up and over" comes
  // out quicker than "first steps" without being easier.
  const runs = rooms.map((room) => ({
    at: room.at,
    engine: parseLevel(room.text).engine,
    seconds: botPlays(room.text, PRESETS[2] as (typeof PRESETS)[number]).seconds,
  }));
  for (const engine of ["roam", "dash"]) {
    const group = runs.filter((run) => run.engine === engine);
    const quickest = Math.min(...group.map((run) => run.seconds));
    // The first room of each game is its gentlest, and the last one is not.
    expect({ engine, first: (group[0] as (typeof group)[number]).seconds }).toEqual({
      engine,
      first: quickest,
    });
    expect((group[group.length - 1] as (typeof group)[number]).seconds).toBeGreaterThan(quickest);
  }
});

test("every game ships a room, or half of what was built never gets seen", () => {
  // The reason this test exists: an engine nobody can reach from the front
  // page is an engine that was built and then hidden. It grows as the games do.
  const engines = rooms.map((room) => parseLevel(room.text).engine);
  for (const engine of ["roam", "dash", "swim", "calm"]) {
    expect({ engine, shipped: engines.filter((e) => e === engine).length > 0 })
      .toEqual({ engine, shipped: true });
  }
});

test("every room is on the newest rules, so nothing ships already retired", () => {
  for (const room of rooms) {
    const level = parseLevel(room.text);
    expect({ name: room.name, version: level.behaviourVersion }).toEqual({
      name: room.name,
      version: newestBuild(level.engine),
    });
  }
});

test("a code in the pack is a code the play page can open", () => {
  // The level editor builds a draft out of each of these, and a share link is
  // an ordinary #p/ one, so anything wrong with a code is a room nobody can
  // open.
  for (const room of PACK) {
    expect(() => decodeLevel(room.code)).not.toThrow();
    expect(room.slug).toMatch(/^[a-z0-9-]+$/);
    expect(room.code.length).toBeLessThan(160);
  }
});

test("what each room is for is said in a few words, not a paragraph", () => {
  for (const room of PACK) {
    expect({ name: room.name, length: room.teaches.length <= 62 }).toEqual({
      name: room.name,
      length: true,
    });
    expect(room.teaches).not.toMatch(/[A-Z]/);
  }
});

/* --- and the play page's side of the bargain ------------------------------ */

const play = await Bun.file("src/web/play/main.ts").text();
const playHtml = await Bun.file("src/web/play/index.html").text();
const stash = await Bun.file("src/web/stash.ts").text();
const levelHtml = await Bun.file("src/web/level/index.html").text();
const levelMain = await Bun.file("src/web/level/main.ts").text();

test("the game opens on the first of the six, not on a level nobody chose", () => {
  // It used to open on the level the engines were developed against: four
  // gems, three guards, corridors a cell wide. That is room 6, not room 1.
  expect(play.includes("const FRONT_DOOR = PACK[0]")).toBe(true);
  expect(play.includes('BUILT_IN_NAME')).toBe(false);
});

test("every room is a starting point, so edit level always carries one", () => {
  // Not only the rooms that arrived in a link: the six that ship are meant to
  // be opened up and changed, which is the whole reason they are levels and
  // not a hard-coded tutorial.
  const at = play.indexOf("buildLink.href = `./level/#from/${encodeLevel(level)}`");
  expect(at).toBeGreaterThan(0);
  // ...and it is not sitting inside `if (shared !== null)`, which would leave
  // the front door as the one room you could not edit.
  const guard = play.lastIndexOf("shared !== null", at);
  const opens = play.lastIndexOf("if (buildLink !== null)", at);
  expect(opens).toBeGreaterThan(guard);
});

test("the play page is for playing: neither list is on it any more", () => {
  // It carried two: the six rooms, and the levels you had played before. Both
  // were things to PICK, on the page where you are already doing something. The
  // six are now something to start FROM in the level editor, beside the sixteen
  // characters on the drawing page -- two pages that pick things, one that
  // plays.
  const html = playHtml;
  expect(html).not.toContain('<nav id="pack"');
  expect(html).not.toContain('<nav id="played"');
  expect(play).not.toContain("paintPack");
  expect(play).not.toContain("paintPlayed");
  // ...and the storage behind the second one went with it, rather than being
  // left to accumulate for a list nobody can see.
  expect(play).not.toContain("rememberPlayed");
  expect(stash).not.toContain("playedBefore");
});

test("but the shipped rooms are still known to be shipped", () => {
  // Which matters for one thing that is NOT a list: a room the game ships with
  // has nobody to send a score back to, so it shares as a level.
  expect(PACK.length).toBe(11);
  expect(play.includes("const shipped = new Set(PACK.map((room) => room.code));")).toBe(true);
  expect(play.includes("const isShipped = shipped.has(levelCode);")).toBe(true);
});

test("the level editor offers them instead, the way the drawing page does", () => {
  expect(levelHtml.includes('<div id="examples"></div>')).toBe(true);
  expect(levelHtml).toContain("or start from one of these");
  expect(levelMain.includes("for (let at = 0; at < PACK.length; at++)")).toBe(true);
  // Drawn through the renderer the GAME uses, from the level's own cells, so a
  // thumbnail cannot disagree with what tapping it gives you.
  expect(levelMain.includes("const small = new GridRenderer(thumb);")).toBe(true);
  // Same bargain as the characters: ask only when there is something to lose.
  expect(levelMain.includes("if (!drawnOn()) {")).toBe(true);
  // ...and it asks over the middle of the screen, the same way and in the same
  // words as the drawing page. Inline it sat under the strip of thumbnails you
  // had just tapped, below the fold on a phone.
  expect(levelMain.includes("Replace the level you have drawn with")).toBe(true);
  expect(levelMain.includes("ask(askBox, {")).toBe(true);
});

test("beating one of the six offers the level, not a score to send back", () => {
  // The six arrive as #p/ links like any other level, so the page could not
  // tell "somebody sent me this" from "I tapped it in the list" -- and every
  // one of them offered "send your score" on the win panel. There is nobody to
  // send a score back to on a room the game ships with, and what you want to
  // pass on is the room.
  expect(play.includes("const isShipped = shipped.has(levelCode);")).toBe(true);
  expect(
    play.includes(
      "const sendingBack = reply !== null || (shared !== null && !isShipped && !mine);",
    ),
  ).toBe(true);
  // Three answers now, because a garden is neither: you are not sending a score
  // and you are not sending a challenge, you are sending somewhere to be.
  expect(play).toContain('sendIt.textContent = aPlace() ? "share this place"');
  expect(play).toContain(': sendingBack ? "send your score" : "share level";');
});

test("a room that ships is a level to share, but it is not YOUR level", () => {
  // The button is right either way, but the words around it were tied to the
  // same flag: with sendingBack off, the QR line called one of the six "your
  // level", which it is not.
  expect(play.includes('qrHint.innerHTML = mine')).toBe(true);
  expect(play.includes('`Play this level: ${levelName}`')).toBe(true);
  expect(play.includes('`Play my level: ${levelName}`')).toBe(true);
});

test("the editor would let a child draw the rooms we ship", () => {
  // A rule the shipped levels break is a rule nobody really believes in, and a
  // level the editor refuses to draw is a level a child is being shown and
  // then stopped from copying. Rebuild each side-on room on a blank draft,
  // through paint(), and see what comes back refused.
  for (const room of rooms) {
    const level = parseLevel(room.text);
    if (level.engine !== "dash") continue;
    const wanted = draftFromLevel(level);
    let building = blankDraft("dash", level.behaviourVersion);
    const refused: string[] = [];
    for (let y = 0; y < GRID_H; y = (y + 1) | 0) {
      for (let x = 0; x < GRID_W; x = (x + 1) | 0) {
        const glyph = wanted.cells[idx(x, y)] as string;
        if (glyph === ".") continue;
        const out = paint(building, x, y, glyph as never);
        building = out.draft;
        if (!out.changed && out.reason !== "") refused.push(`(${x},${y}) ${glyph}: ${out.reason}`);
      }
    }
    expect({ room: room.name, refused }).toEqual({ room: room.name, refused: [] });
  }
});


test("the garden is a level now, and it still reads as a garden", () => {
  // It was a place, and adr/0040 argued for that. Then it was asked for with a
  // way out, a bear and a weapon, which is a level -- adr/0045. What must NOT
  // have happened is the garden quietly turning into an ordinary room with
  // green walls, so this checks both halves.
  const garden = gardens[0];
  expect(garden).toBeDefined();
  const level = parseLevel((garden as { text: string }).text);
  expect(level.engine).toBe("calm");
  expect(level.behaviourVersion).toBe(2);
  expect(level.exitX).toBeGreaterThanOrEqual(0);           // somewhere to get to
  expect(level.treasureCells.length).toBeGreaterThan(4);   // flowers to pick
  expect(level.fireCells.length).toBeGreaterThan(0);       // ponds to walk round

  // ONE bear among the harmless. If the bunnies ever outnumber-flip and the
  // room fills with bears it stops being a garden and becomes a dungeon that
  // happens to be green.
  const bears = [...level.guardArt].filter((art) => art === 0).length;
  expect(bears).toBe(1);
  expect(level.guardCells.length).toBeGreaterThan(3);
  console.log(
    `\n  ${(garden as { name: string }).name}: ` +
    `${level.treasureCells.length} flowers, ${bears} bear, ` +
    `${level.guardCells.length - bears} harmless, ` +
    `${level.fireCells.length} cells of pond, and a gate`,
  );
});

test("a tree is a wall with nothing beside it, and costs the link nothing", async () => {
  // The spec's own rule for moving parts -- behaviour derived from geometry,
  // zero bytes in the encoding -- applied to a drawing. A lone wall cell is a
  // tree and a run of them is a hedge, so the level never has to say which, and
  // it matches how a child paints anyway: tap for a tree, drag for a hedge.
  const garden = gardens[0] as { text: string; code: string };
  const level = parseLevel(garden.text);
  let lone = 0;
  let hedged = 0;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (level.walls[y * GRID_W + x] !== 1) continue;
      if (x === 0 || y === 0 || x === GRID_W - 1 || y === GRID_H - 1) continue;
      let around = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
        if (level.walls[ny * GRID_W + nx] === 1) around++;
      }
      if (around === 0) lone++; else hedged++;
    }
  }
  console.log(`\n  inside the garden's own hedge: ${lone} trees, ${hedged} cells of thicket`);
  // A garden with no trees in it is a lawn, and one with no thicket has nothing
  // you cannot see over.
  expect(lone).toBeGreaterThan(4);
  expect(hedged).toBeGreaterThan(4);

  // And the renderer really does branch on it, in the one world that has trees.
  const renderer = await Bun.file("src/web/play/renderer.ts").text();
  expect(renderer).toContain("this.wallsAround(tiles, x, y) === 0");
  expect(renderer).toContain("this.tiles().tree !== undefined");
});
