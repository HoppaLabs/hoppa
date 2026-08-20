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
  expect((playedBefore()[0] as { name: string }).name.length).toBe(24);
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
