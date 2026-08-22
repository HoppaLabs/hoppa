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
import { canSend } from "../src/web/level/sendable.ts";
import { blankDraft, draftToText, paint, type Glyph } from "../src/core/draft.ts";
import { newestBuild } from "../src/core/builds.ts";

const room = draftToText(blankDraft("roam", newestBuild("roam")));

test("nothing has been autoplayed, so there is nothing to send", () => {
  expect(canSend(null, room)).toBe(false);
});

test("a bot that could not finish it does not open the button", () => {
  expect(canSend({ code: room, won: false, place: false }, room)).toBe(false);
});

test("a bot that got out opens it", () => {
  expect(canSend({ code: room, won: true, place: false }, room)).toBe(true);
});

test("a garden counts as proved by being wandered through", () => {
  // There is no exit to reach, so `won` is never true. Demanding it would shut
  // the button permanently on exactly the levels the youngest children draw.
  expect(canSend({ code: room, won: false, place: true }, room)).toBe(true);
});

test("drawing one more cell closes it again, with nobody clearing a flag", () => {
  let drawn = blankDraft("roam", newestBuild("roam"));
  const proof = { code: draftToText(drawn), won: true, place: false };
  expect(canSend(proof, draftToText(drawn))).toBe(true);

  drawn = paint(drawn, 5, 5, "#" as Glyph).draft;
  const after = draftToText(drawn);
  expect(after).not.toBe(proof.code);
  expect(canSend(proof, after)).toBe(false);
});

test("the editor asks it, and only opens the button when it says yes", async () => {
  const editor = await Bun.file("src/web/level/main.ts").text();
  expect(editor).toContain("const open = canSend(botRun, draftToText(draft));");
  expect(editor).toContain("sendButton.hidden = !open;");
  // Recorded where the bot finishes, from the draft as it stands at that
  // moment -- not from the draft at send time, which would prove nothing.
  expect(editor).toContain(
    "botRun = { code: draftToText(draft), won: attempt.won, place: attempt.place };",
  );
  // ...and re-asked on every review(), which is what runs after every edit.
  expect(editor).toContain("  paintSendGate();\n}");
});

test("the button ships hidden, so a fresh page cannot send an unproved room", async () => {
  const html = await Bun.file("src/web/level/index.html").text();
  expect(html).toContain('<button id="sendit" hidden>send it</button>');
});
