import { expect, test } from "bun:test";

const html = await Bun.file("src/web/make/index.html").text();
const main = await Bun.file("src/web/make/main.ts").text();

/** Every line of instructions on the page, as a reader sees it. */
function hints(): string[] {
  const out: string[] = [];
  const pattern = /<div class="hint">([\s\S]*?)<\/div>/g;
  for (const found of html.matchAll(pattern)) {
    out.push(
      (found[1] as string)
        .replace(/<[^>]+>/g, "")
        .replace(/&mdash;/g, "—")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  return out;
}

test("no line of instructions runs past a phone's patience", () => {
  // The page had 536 characters of prose across five blocks and read as a
  // manual. Nothing here should need a second breath.
  for (const hint of hints()) {
    expect({ hint, length: hint.length <= 75 }).toEqual({ hint, length: true });
  }
});

test("...and there are not many of them", () => {
  const all = hints();
  expect(all.length).toBeLessThanOrEqual(4);
  const total = all.reduce((n, hint) => n + hint.length, 0);
  expect(total).toBeLessThan(250);
});

test("the weapons explain themselves, so nothing repeats them", () => {
  // Each card already says what its weapon does to an enemy. A line underneath
  // saying they are the same was the third time the page made the point.
  expect(html.includes("both work the same")).toBe(false);
  expect(main.includes("enemies gone for good")).toBe(true);
  expect(main.includes("enemies frozen on the spot")).toBe(true);
});

test("the paint box is open, because it is a paint box and not a settings panel", () => {
  // Folded away on day 15, with the note "fifty-four swatches is a wall, and it
  // is only wanted for the two seconds somebody spends changing what one of the
  // three colours IS". That sentence describes a settings panel. For a child
  // this is the paint box, and choosing colours is most of what they came to
  // do -- reported by a real user, who beats the reasoning.
  expect(html.includes('<div id="swatches"></div>')).toBe(true);
  expect(html.includes('<div id="swatches" hidden>')).toBe(false);
  expect(main).not.toContain("showSwatches");
});

test("one selection over the three colours, not two", () => {
  // There used to be the pen you drew with AND a separate row of buttons
  // numbered 1, 2, 3 saying which colour the palette edited, with nothing tying
  // them together: you could draw in one colour while the palette quietly
  // changed another. Reported as "it's too confusing picking the slots".
  expect(html).not.toMatch(/id="slot[123]"/);
  expect(html.includes("change a colour")).toBe(false);
  expect(main).not.toContain("let slot");
  // The palette reads the pen, so there is nothing left to disagree with.
  expect(main.includes("sprite.sub[ink - 1] === index")).toBe(true);
  expect(main.includes("sub[ink - 1] = index;")).toBe(true);
});

test("the rubber has no colour, and the page says so without moving", () => {
  // A page that changes height under a thumb is a page that gets mis-tapped,
  // so the palette stays put and goes quiet rather than disappearing.
  expect(main.includes("const rubber = ink === 0;")).toBe(true);
  expect(main.includes('swatches.classList.toggle("idle", rubber);')).toBe(true);
  expect(html.includes("#swatches.idle { opacity: .3; pointer-events: none; }")).toBe(true);
  expect(main.includes('inkHint.textContent = rubber')).toBe(true);
});

test("what pasting a code says appears next to the box you pasted into", () => {
  const box = html.indexOf('id="paste"');
  const answer = html.indexOf('id="loaded"');
  expect(box).toBeGreaterThan(0);
  expect(answer).toBeGreaterThan(box);
  // It used to sit at the very bottom of the page, under something else.
  expect(html.indexOf('id="forget"')).toBeGreaterThan(answer);
});

test("a section whose own words say what it is does not also need a heading", () => {
  const headings = [...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map((found) => found[1]);
  // "what it is good at" sat directly above "you have 6 points to spend", which
  // already says what the section is, and says it in words a child can act on.
  expect(headings).not.toContain("what it is good at");
  expect(html.includes('you have <b id="left">6</b> points to spend')).toBe(true);
  expect(headings.length).toBeLessThanOrEqual(4);
});
