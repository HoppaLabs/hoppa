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

test("fifty-four swatches stay folded away until somebody wants one", () => {
  // The palette is wanted for the two seconds spent changing what one of the
  // three colours IS, and it was a wall across the page the rest of the time.
  expect(html.includes('<div id="swatches" hidden>')).toBe(true);
  // `display: grid` beats the hidden attribute unless this is said.
  expect(html.includes("#swatches[hidden] { display: none; }")).toBe(true);
  expect(main.includes("showSwatches(false);")).toBe(true);
  // Tapping the open slot shuts it, so there is a way out that is not "pick a
  // colour you did not want".
  expect(main.includes("const shut = !swatches.hidden && slot === index;")).toBe(true);
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
