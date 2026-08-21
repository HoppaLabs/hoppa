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
  // Four arrows, an action button and the weapon.
  expect(padIds.sort()).toEqual(["down", "left", "right", "swing", "up", "wait"]);

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
