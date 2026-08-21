// The share gate is open.
//
// "More user feedback, the kids want to share a level even if they haven't
// played it."
//
// Spec S12 said the opposite, in bold, and called it "the most valuable
// mechanic here": beat your own level, the input log is verified locally, and
// only then does the site produce a link. What it bought was one sentence --
// "nobody receives an impossible level" -- and it cost a six-year-old the
// ability to send their friend a room they had just drawn.
//
// The gate was already half-open before this. A garden was let through on the
// grounds that it is "the biggest wall in front of the youngest player, who
// can paint long before they can finish a room", and that argument was never
// about gardens.
//
// See adr/0046 for what is kept and what is genuinely given up.

import { expect, test } from "bun:test";
import { adviceFor } from "../src/core/advice.ts";
import { blankDraft, draftToText, paint, type Glyph } from "../src/core/draft.ts";
import { newestBuild } from "../src/core/builds.ts";
import { GRID_H } from "../src/core/grid.ts";

const play = await Bun.file("src/web/play/main.ts").text();

test("the button is offered whether or not anybody has beaten it", () => {
  expect(play).toContain("function hasBeatenThis(): boolean {\n  return true;\n}");
  // The old gate, in both the forms it took.
  expect(play).not.toContain("return aPlace() || proven;");
});

test("an unbeaten level says so, rather than letting the link imply otherwise", () => {
  // The gate used to make "you got a link" mean "somebody has done this". With
  // it open, the words have to carry that instead -- and there are three
  // different things to say, not two.
  expect(play).toContain("I did it in ${wonIn}${scoreUnit()}. Beat that.");
  expect(play).toContain("I have not done it yet!");
  expect(play).toContain("nobody has done it yet!");
});

test("a level that is actually broken is still refused, and always was", () => {
  // This is the half of "nobody receives an impossible level" that survives,
  // and it never depended on the gate: L2 and L4 are flood fills over the
  // level, not a record of anybody playing it.
  let doorless = blankDraft("roam", newestBuild("roam"));
  doorless = paint(doorless, GRID_H - 2, 1, "." as Glyph).draft;
  const text = draftToText(doorless).split("\n").map((row, at) => (at === 0 ? row : row.replaceAll(">", "."))).join("\n");
  const advice = adviceFor(text);
  expect(advice.playable).toBe(false);
  expect(advice.notes.some((note) => note.text.includes("door"))).toBe(true);
});

test("...and the editor can still show a bot playing it, on demand", () => {
  // The other thing that survives. It is no longer a gate, it is an answer to
  // "is this even possible" for a child who wants to know before sending.
  const editor = play.includes("bot.botPlaysLevel");
  const inEditor = Bun.file("src/web/level/main.ts");
  return inEditor.text().then((text) => {
    expect(text).toContain("bot.botPlaysLevel(level, creature)");
    expect(editor).toBe(false);   // the play page never needed it
  });
});
