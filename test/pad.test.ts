// The handset: one pad, and the round buttons beside it.
//
// A control can fail two ways and both read to a child as "this game is
// broken": it can be drawn and do nothing, or be wired and never appear. The
// sword did the first -- "the sword is not working on the side view levels" --
// because the listener loop read a list that did not mention it, and a
// keyboard went through a different map that always worked, so every test at a
// desk passed.

import { expect, test } from "bun:test";

const play = await Bun.file("src/web/play/main.ts").text();
const html = await Bun.file("src/web/play/index.html").text();
const pad = html.slice(html.indexOf('<nav id="pad">'), html.indexOf("</nav>", html.indexOf('<nav id="pad">')));

test("every button drawn on the handset is wired to something", () => {
  const ids = [...pad.matchAll(/<button id="(\w+)"/g)].map((found) => found[1] as string);
  // Three round buttons. The directions are not buttons any more -- see below.
  expect(ids.sort()).toEqual(["swing", "wait", "water"]);

  const wired = play.slice(play.indexOf("const ACTION_KEYS"), play.indexOf("];", play.indexOf("const ACTION_KEYS")));
  for (const id of ids) {
    expect({ button: id, wired: wired.includes(`"${id}"`) }).toEqual({ button: id, wired: true });
  }
});

test("the directions are ONE control, and it holds the pointer", () => {
  // The whole reason the pad was rebuilt. Six buttons each captured the
  // pointer for themselves, so a thumb could not roll from one direction to
  // the next; each dropped its input on pointerleave, so a few pixels of drift
  // stopped you mid-jump; and a diagonal wanted two fingers.
  expect(pad).toContain('<div id="dpad"');
  expect(pad).not.toContain('<button id="up"');
  expect(play).toContain("dpad.setPointerCapture(ev.pointerId);");
  expect(play).toContain('dpad.addEventListener("pointermove"');
  // ...and never pointerleave, which is what made the drift fatal.
  expect(play).not.toContain('dpad.addEventListener("pointerleave"');
});

test("all four arms are drawn and all four are read", () => {
  for (const arm of ["u", "r", "d", "l"]) {
    expect({ arm, drawn: pad.includes(`class="${arm}"`) }).toEqual({ arm, drawn: true });
  }
  const arrows = play.slice(play.indexOf("const ARROWS"), play.indexOf("];", play.indexOf("const ARROWS")));
  for (const arm of ["u", "r", "d", "l"]) {
    expect({ arm, read: arrows.includes(`"${arm}"`) }).toEqual({ arm, read: true });
  }
});

test("the weapon has a button of its own from the side, and only there", () => {
  // From above the action button IS the weapon; a second one would be the same
  // button twice.
  expect(html).toContain('<button id="swing" aria-label="swing" hidden>');
  expect(play).toContain("swingButton.hidden = !separate;");
});

test("a button that starts hidden has something that unhides it", () => {
  for (const found of pad.matchAll(/<button id="(\w+)"[^>]*\shidden/g)) {
    const id = found[1] as string;
    const named = id === "swing" ? "swingButton" : "bucket";
    expect({ button: id, canAppear: play.includes(`${named}.hidden = `) })
      .toEqual({ button: id, canAppear: true });
  }
});

test("hiding a button actually hides it", () => {
  // Specificity, and it bit immediately. The button rule is `#pad #keys
  // button` -- two ids and a type -- and the rule that hides one was
  // `#water[hidden]`, one id and an attribute. The button rule won, so
  // `hidden` stopped hiding: the bucket sat on top of the sword in every
  // side-on level (which is how it was found -- an empty circle where the
  // sword should be), and the garden showed the action button it is
  // specifically supposed to have none of.
  expect(html).toContain("#pad #keys button[hidden] { display: none; }");
  // The trap is only sprung if the hiding rule is the weaker one, so keep them
  // written at the same strength.
  expect(html).not.toContain("#swing[hidden], #water[hidden], #wait[hidden] { display: none; }");
});

test("the bucket is a top-down thing, and only on a level that has a fire", () => {
  expect(html).toContain('<button id="water" aria-label="pour water" hidden>');
  // Never in the side-on game: the same hazard is drawn there as metal spikes,
  // and pouring water on a spike does nothing to a spike.
  expect(play).toContain('return engine === "roam" && version >= FIRST_WATERED_ROAM;');
  // And never on a level with nothing to pour it on.
  expect(play).toContain("level.fireCells.length > 0");
});
