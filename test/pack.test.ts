import { expect, test } from "bun:test";
import { PACK } from "../src/core/pack.ts";
import { PRESETS } from "../src/core/creature.ts";
import { decodeLevel, encodeLevel } from "../src/core/codec.ts";
import { parseLevel } from "../src/core/level.ts";
import { verifyLevelText } from "../src/core/verify.ts";
import { botPlays, replayWins } from "../tools/bot.ts";
import { newestBuild } from "../src/core/builds.ts";

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

test("six rooms ship, and the file on disk is the code in the bundle", () => {
  expect(PACK.length).toBe(6);
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
  for (const room of rooms) {
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
  for (const room of rooms) {
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

test("both games are in the six, or half of what was built never gets seen", () => {
  const engines = rooms.map((room) => parseLevel(room.text).engine);
  expect(new Set(engines).size).toBe(2);
  expect(engines.filter((engine) => engine === "roam").length).toBeGreaterThan(0);
  expect(engines.filter((engine) => engine === "dash").length).toBeGreaterThan(0);
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
  // The list builds ordinary #p/ links out of these, so anything wrong with a
  // code is a level that cannot be tapped.
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

test("a room that ships does not also show up as one you played before", () => {
  // Both lists are on the same screen. The same room in both is furniture, and
  // six shipped rooms would push out every level a friend actually sent.
  expect(play.includes("const shipped = new Set(PACK.map((room) => room.code));")).toBe(true);
  expect(play.includes("if (shared !== null && !isShipped) rememberPlayed(")).toBe(true);
});

test("the pack is shown as ordinary level links and nothing more", () => {
  // A pack with its own plumbing would be a second way to play a level. Tapping
  // one of these has to be the same act as tapping one in a message.
  expect(play.includes("link.href = `#p/${room.slug}/${room.code}`")).toBe(true);
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
  expect(play.includes('sendIt.textContent = sendingBack ? "send your score" : "share level";')).toBe(
    true,
  );
});

test("a room that ships is a level to share, but it is not YOUR level", () => {
  // The button is right either way, but the words around it were tied to the
  // same flag: with sendingBack off, the QR line called one of the six "your
  // level", which it is not.
  expect(play.includes('qrHint.innerHTML = mine')).toBe(true);
  expect(play.includes('`Play this level: ${levelName}`')).toBe(true);
  expect(play.includes('`Play my level: ${levelName}`')).toBe(true);
});
