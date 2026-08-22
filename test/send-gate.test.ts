// The level editor's send button.
//
// "We need to add share level to the level editor even if the match is unplayed
// by the user, but it needs to have been autoplayed."
//
// Two halves. The first is that the button exists at all -- until now the only
// way to send a room was to go and play it. The second is the condition, which
// is narrower than the play page's (open, adr/0046) and is the point of the
// feature: a bot has been through THIS room and got out.
//
// "THIS room" is the part worth testing. A flag set on a win and cleared by
// hand wherever the draft changes is a flag that will be missed at the next
// place the draft changes; the proof carries the room instead, so the
// comparison does the clearing.

import { expect, test } from "bun:test";
import { canSend, proved } from "../src/web/level/sendable.ts";
import { blankDraft, draftToText, paint, type Glyph } from "../src/core/draft.ts";
import { newestBuild } from "../src/core/builds.ts";

const room = draftToText(blankDraft("roam", newestBuild("roam")));

test("a room that can become a link can be sent, autoplayed or not", () => {
  // The gate used to be "a bot has been through this exact room". Asked for
  // directly: "a user should be able to share a level from the level editor
  // even if it hasn't been autoplayed." So the one remaining question is not
  // about the child at all -- can this room become a link? See adr/0062.
  expect(canSend(room)).toBe(true);
});

test("...and a room that cannot encode still cannot be sent", () => {
  // Not a judgement about the drawing: a level that will not fit in a link has
  // nothing to send, and the click handler says exactly that.
  expect(canSend("")).toBe(false);
  expect(canSend("this is not a level")).toBe(false);
});

test("a bot's run is still a real claim, it just no longer decides", () => {
  expect(proved(null, room)).toBe(false);
  expect(proved({ code: room, won: false, place: false }, room)).toBe(false);
  expect(proved({ code: room, won: true, place: false }, room)).toBe(true);
});

test("a garden counts as proved by being wandered through", () => {
  // There is no exit to reach, so `won` is never true. Demanding it would say
  // no to exactly the levels the youngest children draw.
  expect(proved({ code: room, won: false, place: true }, room)).toBe(true);
});

test("drawing one more cell drops the proof, with nobody clearing a flag", () => {
  // The property worth keeping even though it no longer gates anything: the
  // proof carries the room it is a proof of, so it clears itself.
  let drawn = blankDraft("roam", newestBuild("roam"));
  const proof = { code: draftToText(drawn), won: true, place: false };
  expect(proved(proof, draftToText(drawn))).toBe(true);

  drawn = paint(drawn, 5, 5, "#" as Glyph).draft;
  const after = draftToText(drawn);
  expect(after).not.toBe(proof.code);
  expect(proved(proof, after)).toBe(false);
  // ...and the button stays open, because the room is still a room.
  expect(canSend(after)).toBe(true);
});

test("the editor asks it, and only opens the button when it says yes", async () => {
  const editor = await Bun.file("src/web/level/main.ts").text();
  expect(editor).toContain("const open = canSend(code);");
  expect(editor).toContain("sendButton.hidden = !open;");
});
