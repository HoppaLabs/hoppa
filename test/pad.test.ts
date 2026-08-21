import { expect, test } from "bun:test";

const play = await Bun.file("src/web/play/main.ts").text();
const html = await Bun.file("src/web/play/index.html").text();

test("every button on the pad is actually wired to something", () => {
  // The swing was not, and a nine-year-old found it: "the sword is not working
  // on the side view levels". paintActionButton() unhid the button and gave it
  // a sword; PAD_BITS mapped it to HELD_SWING; and the loop that attaches the
  // listeners reads BUTTONS, which did not mention it. So the button was a
  // picture of a button. It survived because a keyboard goes through KEY_BITS,
  // which always worked -- every test of it at a desk passed.
  const padStart = html.indexOf('<nav id="pad">');
  const padEnd = html.indexOf("</nav>", padStart);
  const padIds = [...html.slice(padStart, padEnd).matchAll(/<button id="(\w+)"/g)].map((m) => m[1] as string);
  // Four arrows, an action button, the weapon, and the bucket.
  expect(padIds.sort()).toEqual(["down", "left", "right", "swing", "up", "wait", "water"]);

  const wired = play.slice(play.indexOf("const BUTTONS"), play.indexOf("];", play.indexOf("const BUTTONS")));
  const bits = play.slice(play.indexOf("const PAD_BITS"), play.indexOf("];", play.indexOf("const PAD_BITS")));
  for (const id of padIds) {
    expect({ button: id, hasListener: wired.includes(`"${id}"`) }).toEqual({ button: id, hasListener: true });
    expect({ button: id, hasBit: bits.includes(`"${id}"`) }).toEqual({ button: id, hasBit: true });
  }
});

test("the weapon has a button of its own from the side, and only there", () => {
  // From above the action button IS the weapon; a second one would be the same
  // button twice.
  expect(html).toContain('<button id="swing" aria-label="swing" hidden>');
  expect(play).toContain("swingButton.hidden = !separate;");
});

test("a button that starts hidden has something that unhides it", () => {
  // The other half of the sword bug. A button can fail two ways: it can be
  // shown and do nothing, or it can be wired and never appear. Both read to a
  // child as "this game is broken".
  const padStart = html.indexOf('<nav id="pad">');
  const padEnd = html.indexOf("</nav>", padStart);
  const pad = html.slice(padStart, padEnd);
  for (const found of pad.matchAll(/<button id="(\w+)"[^>]*\shidden/g)) {
    const id = found[1] as string;
    // Something, somewhere, sets .hidden on it from a condition.
    const camel = id === "swing" ? "swingButton" : "bucket";
    expect({ button: id, canAppear: play.includes(`${camel}.hidden = `) })
      .toEqual({ button: id, canAppear: true });
  }
});

test("the bucket is a top-down thing, and only on a level that has a fire", () => {
  // Asked for by the child: "need a water bucket to put out the fires". It
  // goes in the pad slot the side-on game uses for JUMP, which is empty from
  // above because nothing from above jumps.
  expect(html).toContain('<button id="water" aria-label="pour water" hidden>');
  expect(html).toContain("#water { grid-area: wait;");
  // Never in the side-on game: the same hazard is drawn there as metal spikes,
  // and pouring water on a spike does nothing to a spike.
  expect(play).toContain('return engine === "roam" && version >= FIRST_WATERED_ROAM;');
  // And never on a level with nothing to pour it on.
  expect(play).toContain("level.fireCells.length > 0");
  // It uses the bit that has been spare from above since the day it was added.
  const bits = play.slice(play.indexOf("const PAD_BITS"), play.indexOf("];", play.indexOf("const PAD_BITS")));
  expect(bits).toContain('["water", HELD_SWING]');
});
