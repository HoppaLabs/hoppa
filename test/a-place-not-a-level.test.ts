// A place is reported as a place, not as a level somebody failed to finish.
//
// Reported twice over, from a phone: "Everytime it auto plays the garden
// template level it say runs out of ticks even though all the flowers are
// collected?" Both halves of that sentence were true and the message was wrong
// on three counts -- there was nothing to finish, it had not run out of
// anything, and every flower HAD been picked.
//
// The cause is one line of reasoning repeated in two files: `won === false`
// was read as "went badly". In a garden it means "there was nothing to win",
// which adr/0040 decided on purpose. Nothing here tests the engine; it tests
// what the editor SAYS about it, which is the part a child reads.

import { expect, test } from "bun:test";
import { botPlays } from "../src/core/bot.ts";
import { adviceFor } from "../src/core/advice.ts";
import { PACK } from "../src/core/pack.ts";
import { PRESETS } from "../src/core/creature.ts";
import { decodeLevel, levelToText } from "../src/core/codec.ts";
import { parseLevel } from "../src/core/level.ts";
import { aPlace } from "../src/core/draft.ts";

const rooms = PACK.map((room) => {
  const text = levelToText(decodeLevel(room.code));
  return { name: room.name, text, engine: parseLevel(text).engine };
});
const places = rooms.filter((room) => aPlace(room.engine));
const levels = rooms.filter((room) => !aPlace(room.engine));

test("a place ships, or there is nothing here to check", () => {
  expect(places.length).toBeGreaterThan(0);
});

test("the bot marks a place as a place, and never as a run that ran out", () => {
  const table: string[] = [];
  for (const room of places) {
    for (const who of PRESETS) {
      const visit = botPlays(room.text, who);
      table.push(
        `  ${room.name.padEnd(12)} ${who.name.padEnd(5)} picked ${visit.treasure}` +
          `  ${visit.seconds}s  "${visit.why}"`,
      );
      expect({ who: who.name, place: visit.place }).toEqual({ who: who.name, place: true });
      // The three words that were wrong on screen.
      expect(visit.why).not.toContain("ran out");
      expect(visit.why).not.toContain("died");
      expect(visit.why).not.toContain("lost");
    }
  }
  console.log("\n" + table.join("\n"));
});

test("a level is still reported as won or not, which is the other half", () => {
  // The fix must not turn every outcome into "it was fine". A room with a door
  // is still a room you can fail to get out of.
  for (const room of levels) {
    const run = botPlays(room.text, PRESETS[0] as (typeof PRESETS)[number]);
    expect({ room: room.name, place: run.place }).toEqual({ room: room.name, place: false });
  }
});

test("the bot really does pick every flower before it stops", () => {
  // The half of the report that was NOT a complaint. If this ever stops being
  // true the message above starts flattering a visit that went badly.
  for (const room of places) {
    for (const who of PRESETS) {
      const visit = botPlays(room.text, who);
      const [got, all] = visit.treasure.split("/");
      expect({ who: who.name, treasure: visit.treasure, all: got === all }).toEqual({
        who: who.name,
        treasure: visit.treasure,
        all: true,
      });
    }
  }
});

test("the editor does not demand a door the palette will not sell you", () => {
  // Worse than the wording, and found while fixing it: L2 ("there is no way
  // out") fails on every garden by design, the note is FATAL, and review()
  // does `playButton.disabled = !advice.playable`. So the play button was off
  // in every garden ever drawn -- a child could not play their own -- and the
  // fix it suggested is a tool the garden palette does not offer.
  for (const room of places) {
    const advice = adviceFor(room.text);
    expect({ room: room.name, playable: advice.playable }).toEqual({ room: room.name, playable: true });
    for (const note of advice.notes) {
      expect(note.text).not.toContain("door");
      expect(note.fatal).toBe(false);
    }
  }
});

test("a level with no door is still told to add one", () => {
  // The check that stops the fix above from being a hole: only a PLACE gets to
  // skip it. Same room, one word of the header different.
  const walled = levels[0] as (typeof levels)[number];
  const doorless = walled.text
    .split("\n")
    .map((row, i) => (i === 0 ? row : row.replaceAll(">", ".")))
    .join("\n");
  const advice = adviceFor(doorless);
  expect(advice.playable).toBe(false);
  expect(advice.notes.some((note) => note.text.includes("door"))).toBe(true);
});
