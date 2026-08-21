// Advice advises. It never holds the door shut.
//
// "No matter the guidance you should always be able to play it, sometimes is
// blocking the user from playing it based on faulty guidance."
//
// Three separate times in one day the guidance was itself the bug, and each
// time it disabled the play button on a level that was fine:
//
//   - a garden was told "there is no way out -- put a door somewhere", fatally,
//     about a door its palette does not sell and its engine would never open
//   - an underwater gem in open water was "too high to jump to", fatally, in a
//     game where nothing jumps and nothing falls
//
// The lock was never load-bearing. The SHARE gate is what stops an impossible
// level reaching a friend, and it cannot be fooled by bad advice because it
// wants a real win, replayed cold.

import { expect, test } from "bun:test";
import { adviceFor } from "../src/core/advice.ts";
import { blankDraft, draftToText, paint, type Glyph } from "../src/core/draft.ts";
import { newestBuild } from "../src/core/builds.ts";
import { GRID_H } from "../src/core/grid.ts";

const editor = await Bun.file("src/web/level/main.ts").text();
const GAMES = ["roam", "dash", "swim", "calm"] as const;

test("the play button is never switched off, whatever the advice says", () => {
  expect(editor).toContain("playButton.disabled = false;");
  expect(editor).not.toContain("playButton.disabled = !advice.playable;");
});

test("underwater does not talk about jumping, because nothing jumps", () => {
  // A gem hanging in open water is a gem you swim up to.
  let draft = blankDraft("swim", newestBuild("swim"));
  draft = paint(draft, 10, 3, "$" as Glyph).draft;
  const advice = adviceFor(draftToText(draft));
  for (const note of advice.notes) expect(note.text).not.toContain("jump");
  expect(advice.playable).toBe(true);
});

test("...but the platformer still does, because there it is true", () => {
  // The fix must not silence the note where it is the whole point: falls(),
  // not sideOn(). Underwater is drawn from the side and nothing in it falls.
  let draft = blankDraft("dash", newestBuild("dash"));
  draft = paint(draft, 10, 3, "$" as Glyph).draft;
  const advice = adviceFor(draftToText(draft));
  expect(advice.notes.some((note) => note.text.includes("jump"))).toBe(true);
});

test("a level a child would actually draw is called playable in every game", () => {
  // Treasure on the ground, one creature, nothing clever.
  for (const engine of GAMES) {
    let draft = blankDraft(engine, newestBuild(engine));
    draft = paint(draft, 8, GRID_H - 2, "$" as Glyph).draft;
    draft = paint(draft, 14, GRID_H - 2, "G" as Glyph).draft;
    const advice = adviceFor(draftToText(draft));
    // Notes are fine and often right -- a guard with a long corridor to pace
    // gets one here. What must not happen is a FATAL one on a level like this.
    expect({ engine, playable: advice.playable, fatal: advice.notes.filter((n) => n.fatal).map((n) => n.text) })
      .toEqual({ engine, playable: true, fatal: [] });
  }
});
