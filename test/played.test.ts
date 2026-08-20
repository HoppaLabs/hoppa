import { beforeEach, expect, test } from "bun:test";

// stash.ts talks to window.localStorage. There is no window here, so this is
// one: enough of the API to exercise the guards, including the one that throws.
class Fake {
  private held = new Map<string, string>();
  refuse = false;
  getItem(key: string): string | null {
    if (this.refuse) throw new Error("no");
    return this.held.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.refuse) throw new Error("no");
    this.held.set(key, value);
  }
  removeItem(key: string): void {
    if (this.refuse) throw new Error("no");
    this.held.delete(key);
  }
  /** For planting rubbish, which is the interesting half of the tests. */
  plant(key: string, value: string): void {
    this.held.set(key, value);
  }
}

const store = new Fake();
(globalThis as unknown as { window: unknown }).window = { localStorage: store };

const { forgetPlayed, playedBefore, rememberPlayed } = await import("../src/web/stash.ts");
const KEY = "hoppa.played.v1";

beforeEach(() => {
  store.refuse = false;
  forgetPlayed();
});

test("a level you played is there when you come back", () => {
  rememberPlayed("CODE1", "pit-of-doom");
  expect(playedBefore()).toEqual([{ code: "CODE1", name: "pit-of-doom" }]);
});

test("newest first, because that is the one you want again", () => {
  rememberPlayed("A", "first");
  rememberPlayed("B", "second");
  rememberPlayed("C", "third");
  expect(playedBefore().map((p) => p.name)).toEqual(["third", "second", "first"]);
});

test("playing the same level twice does not fill the list with it", () => {
  rememberPlayed("A", "the one");
  rememberPlayed("B", "another");
  rememberPlayed("A", "the one");
  expect(playedBefore().map((p) => p.code)).toEqual(["A", "B"]);
});

test("it keeps the last six and forgets the rest", () => {
  for (let n = 0; n < 10; n++) rememberPlayed(`CODE${n}`, `level ${n}`);
  const kept = playedBefore();
  expect(kept.length).toBe(6);
  // The six most recent, in order.
  expect(kept.map((p) => p.code)).toEqual(["CODE9", "CODE8", "CODE7", "CODE6", "CODE5", "CODE4"]);
});

test("a fresh phone has an empty list, not a crash", () => {
  expect(playedBefore()).toEqual([]);
});

// --- storage lying, which spec §5b says to assume ---------------------------

test("rubbish in storage is skipped, never handed back", () => {
  store.plant(KEY, "not json at all");
  expect(playedBefore()).toEqual([]);

  store.plant(KEY, '{"not":"an array"}');
  expect(playedBefore()).toEqual([]);

  store.plant(KEY, '[null, 3, "text", {}]');
  expect(playedBefore()).toEqual([]);
});

test("a half-written record is dropped and the good ones survive", () => {
  store.plant(
    KEY,
    JSON.stringify([
      { code: "GOOD", name: "keeps" },
      { code: "", name: "no code" },
      { name: "no code at all" },
      { code: "ALSOGOOD" }, // no name
      { code: "FINE", name: "keeps too" },
    ]),
  );
  expect(playedBefore().map((p) => p.code)).toEqual(["GOOD", "FINE"]);
});

test("a planted duplicate cannot get two entries in the list", () => {
  store.plant(
    KEY,
    JSON.stringify([
      { code: "SAME", name: "one" },
      { code: "SAME", name: "two" },
    ]),
  );
  expect(playedBefore().length).toBe(1);
});

test("a planted list longer than the cap is still cut to the cap", () => {
  const many = Array.from({ length: 50 }, (_, n) => ({ code: `C${n}`, name: `n${n}` }));
  store.plant(KEY, JSON.stringify(many));
  expect(playedBefore().length).toBe(6);
});

test("a silly long name is cut, so one entry cannot take the whole row", () => {
  rememberPlayed("A", "x".repeat(500));
  expect((playedBefore()[0] as { name: string }).name.length).toBe(40);
});

test("storage refusing to answer is an empty list, never an exception", () => {
  rememberPlayed("A", "there");
  store.refuse = true;
  expect(() => playedBefore()).not.toThrow();
  expect(playedBefore()).toEqual([]);
  // ...and refusing to write is not an exception either.
  expect(() => rememberPlayed("B", "nope")).not.toThrow();
  expect(() => forgetPlayed()).not.toThrow();
});

test("a level whose link carried no name still gets one on the chip", async () => {
  // `#p//CODE` is a link somebody can arrive with -- typed, forwarded, mangled
  // -- and it used to leave a blank 20px box in the row.
  const { levelFromHash, UNNAMED } = await import("../src/web/play/link.ts");
  const { parseLevel } = await import("../src/core/level.ts");
  const { encodeLevel } = await import("../src/core/codec.ts");
  const { ROAM4_LEVEL_TEXT } = await import("../src/core/fixtures.ts");

  const code = encodeLevel(parseLevel(ROAM4_LEVEL_TEXT));
  expect(levelFromHash(`#p//${code}`)?.slug).toBe(UNNAMED);
  // A link that does name the level is untouched.
  expect(levelFromHash(`#p/pit-of-doom/${code}`)?.slug).toBe("pit-of-doom");
});

// --- how the row is drawn ---------------------------------------------------

test("the levels you played before are a list, not a row of chips", async () => {
  const main = await Bun.file("src/web/play/main.ts").text();
  const html = await Bun.file("src/web/play/index.html").text();
  // As a wrapping row every name was cut to fifteen characters to make them fit
  // each other, and each was a 24px tap target.
  expect(html.includes("#played .levels {")).toBe(true);
  expect(html.includes("flex-direction: column")).toBe(true);
  expect(html.includes("max-width: 15ch")).toBe(false);
  // Whole names: the storage cap is the only thing that shortens one now.
  expect(main.includes("was.name.replace(/-/g, \" \")")).toBe(true);
});

test("...behind one line, because a list open costs the level a third of itself", async () => {
  const main = await Bun.file("src/web/play/main.ts").text();
  const html = await Bun.file("src/web/play/index.html").text();
  // Measured: three rows is 111px of a 664px phone and took the play area from
  // 360x210 to its 140px floor. Shut it costs a single line.
  expect(main.includes('header.className = "heading";')).toBe(true);
  expect(main.includes("list.hidden = !list.hidden;")).toBe(true);
  // The level is measured for the screen, so opening it has to re-measure.
  const at = main.indexOf("header.addEventListener");
  expect(main.slice(at, main.indexOf("});", at)).includes("resize();")).toBe(true);
  // Six levels down a column is 246px, so the list itself is bounded too.
  expect(html.includes("max-height: 112px")).toBe(true);
});

test("a tampered name cannot put markup on the page or rubbish in the URL", async () => {
  const main = await Bun.file("src/web/play/main.ts").text();
  // Both halves come out of localStorage, which spec §5b says to assume lies.
  expect(main.includes("link.href = `#p/${slugify(was.name)}/${encodeURIComponent(was.code)}`;")).toBe(true);
  expect(main.includes("name.textContent = was.name.replace")).toBe(true);
});
