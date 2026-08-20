import { expect, test } from "bun:test";

const html = await Bun.file("src/web/play/index.html").text();
const main = await Bun.file("src/web/play/main.ts").text();

/** The one CSS rule that sets a property on a selector, as written. */
function rule(selector: string): string {
  const at = html.indexOf(`\n  ${selector} {`);
  expect({ selector, found: at > 0 }).toEqual({ selector, found: true });
  return html.slice(at, html.indexOf("}", at));
}

test("the two things you can make are drawn the same, because they are peers", () => {
  // "edit character" wore a gold border and "make a level" an --edge one, so
  // the first read as permanently selected. Measured against the page
  // background gold is 11.8:1 and --edge is 1.18:1 on a fill of 1.32:1 -- so
  // the gold was never decoration, it was the only outline that button had.
  expect(rule("#draw, #build")).toContain("border: 1px solid var(--gold)");
  // ...and nothing may quietly take it off one of them again.
  expect(html).not.toMatch(/#build\s*\{\s*border-color/);
  expect(html).not.toMatch(/#draw\s*\{\s*border-color/);
});

test("...and they sit together on one row that cannot wrap", () => {
  // A pair that wraps reads as two unrelated buttons.
  expect(html.includes('<nav id="edits"')).toBe(true);
  expect(rule("#edits")).toContain("flex-wrap: nowrap");
  const edits = html.indexOf('<nav id="edits"');
  const shut = html.indexOf("</nav>", edits);
  const row = html.slice(edits, shut);
  expect(row.includes('id="draw"')).toBe(true);
  expect(row.includes('id="build"')).toBe(true);
  // The footer is what they left. Nothing else may move back in beside them.
  expect(row.includes('id="sound"')).toBe(false);
  expect(row.includes('id="reset"')).toBe(false);
});

test("sound is an icon by the title, not a word in the row of things to do", () => {
  // It is a setting you touch once and never again, and it was taking a place
  // in the row of things you actually came here to do.
  const top = html.slice(html.indexOf('<header id="top">'), html.indexOf("</header>"));
  expect(top.includes('id="sound"')).toBe(true);
  expect(top.includes("<h1>")).toBe(true);
  expect(rule("#sound")).toContain("position: absolute");
  // The title stays centred: the icon is out of the flow rather than pushing
  // it. Measured -- the header row is as tall as the title alone was, and the
  // level is 360x210 on a 390pt phone with the icon exactly as without it.
  expect(rule("#top")).toContain("justify-content: center");
});

test("which half of the icon is drawn IS whether sound is on", () => {
  // There is no wording to get out of step with aria-pressed, because there is
  // no wording. The stylesheet reads the same flag the button sets.
  expect(html.includes('#sound[aria-pressed="true"] .on { display: inline; }')).toBe(true);
  expect(html.includes('#sound[aria-pressed="true"] .off { display: none; }')).toBe(true);
  expect(main.includes('soundButton.setAttribute("aria-pressed", String(sounds.isOn()));')).toBe(
    true,
  );
  expect(main).not.toContain('soundButton.textContent');
});

test("a button with no words still says what tapping it will do", () => {
  // An icon-only control has to carry its own name, and the name has to be the
  // ACTION -- "turn sound off" when it is on -- not a read-out of the state.
  expect(main.includes('sounds.isOn() ? "turn sound off" : "turn sound on"')).toBe(true);
  expect(html).toMatch(/<button id="sound"[^>]*aria-label="turn sound on"/);
  expect(html).toMatch(/<svg viewBox="0 0 24 24" aria-hidden="true">/);
});
