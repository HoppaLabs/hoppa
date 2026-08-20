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
  expect(rule("#another, #draw, #build")).toContain("border: 1px solid var(--gold)");
  // Three buttons on a phone wrap to two lines, and a wrapped label ranged
  // left inside a centred button reads as a mistake.
  expect(rule("#another, #draw, #build")).toContain("text-align: center");
  // ...and nothing may quietly take it off one of them again.
  expect(html).not.toMatch(/#build\s*\{\s*border-color/);
  expect(html).not.toMatch(/#draw\s*\{\s*border-color/);
});

test("there is a way to reach the other rooms from the game", () => {
  // The rooms moved to the level editor, which is right for editing them and
  // left the play page opening on room one with no way to reach room two. A
  // player who never opened the editor saw one room and reported not being
  // able to find the fire.
  expect(html.includes('<button id="another">another level</button>')).toBe(true);
  // An ordinary #p/ link, so tapping it is the same act as tapping one in a
  // message -- nothing new is reachable this way.
  expect(main.includes("return `#p/${pick.slug}/${pick.code}`;")).toBe(true);
  // Never the room you are already on, so every tap is a change.
  expect(main.includes("PACK.filter((room) => room.code !== levelCode)")).toBe(true);
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
  expect(rule("#reset, #sound")).toContain("position: absolute");
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

test("start again mirrors sound: an icon at the other end of the same row", () => {
  // Both are things you reach for between attempts rather than during one, so
  // neither belongs in the row of things you came here to do.
  const top = html.slice(html.indexOf('<header id="top">'), html.indexOf("</header>"));
  expect(top.includes('id="reset"')).toBe(true);
  expect(html.includes("#reset { left: 0; }")).toBe(true);
  expect(html.includes("#sound { right: 0; }")).toBe(true);
  // They read as a pair only if they are actually identical, so they share
  // one rule rather than two that happen to agree today.
  expect(rule("#reset, #sound")).toContain("padding: 6px");
  expect(html.includes('<button id="reset" aria-label="start again">')).toBe(true);
  // The footer is what it left, and only the read-out stays there.
  const footer = html.slice(html.indexOf("<footer>"), html.indexOf("</footer>"));
  expect(footer.includes('id="reset"')).toBe(false);
  expect(footer.includes('id="hud"')).toBe(true);
});

test("the weapon sits to the right of up, in both games", () => {
  // Seen from above there is one non-directional button and it was top LEFT;
  // from the side that slot is the jump and the weapon is on the right. A
  // thumb should find the weapon in the same place either way.
  expect(html).toContain('grid-template-areas: "wait up swing" "left down right"');
  expect(html.includes("#pad.one #wait { grid-area: swing; }")).toBe(true);
  expect(main.includes('pad.classList.toggle("one", !separate);')).toBe(true);
});

test("every armed side-on build offers the weapon, not just the one named", () => {
  // It was a set naming "dash/3" alone, so dash/4 -- which is dash/3 plus a
  // change to picking gems up, weapon untouched -- shipped with no weapon
  // button, and a child had no answer to a guard but to walk round it.
  expect(main).not.toContain("WEAPON_ENGINES");
  expect(main.includes("const FIRST_ARMED_DASH = 3;")).toBe(true);
  expect(
    main.includes('return engine === "dash" && version >= FIRST_ARMED_DASH;'),
  ).toBe(true);
});
