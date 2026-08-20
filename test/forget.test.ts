import { beforeEach, expect, test } from "bun:test";

// stash.ts talks to window.localStorage. There is no window here, so this is
// one -- the same shape test/played.test.ts uses.
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
}

const store = new Fake();
(globalThis as unknown as { window: unknown }).window = { localStorage: store };

const { forgetCharacter, loadCharacter, saveCharacter, startingCharacter } = await import(
  "../src/web/stash.ts"
);
import type { Build } from "../src/core/creature.ts";
const { creatureFromBuild } = await import("../src/core/creature.ts");
const { spriteFromRows } = await import("../src/core/sprite.ts");

const drawn = () => {
  const build = { FORCE: 4, HASTE: 2 } as Build;
  const sprite = spriteFromRows(Array(16).fill("1111111111111111"), [40, 41, 5]);
  return { build, creature: creatureFromBuild("yours", "Sprocket", "@", build, sprite) };
};

beforeEach(() => {
  store.refuse = false;
  forgetCharacter();
});

test("a character you made is there until you say otherwise", () => {
  const mine = drawn();
  saveCharacter("Sprocket", mine.build, mine.creature);
  expect(loadCharacter()?.creature.name).toBe("Sprocket");
});

test("forgetting one really forgets it", () => {
  // Asked for after a character had been fiddled with past the point of wanting
  // it: the page loads whatever is in storage, so without this a creature you
  // had gone off could only be drawn over, never dropped.
  const mine = drawn();
  saveCharacter("Sprocket", mine.build, mine.creature);
  forgetCharacter();
  expect(loadCharacter()).toBeNull();
});

test("what you get back is a blank one, not an empty screen", () => {
  const fresh = startingCharacter();
  expect(fresh.creature.name).toBe("Me");
  // Nothing spent, so every plus button is live and the choice is the obvious
  // thing to do next.
  expect(fresh.build.FORCE).toBe(0);
  expect(fresh.build.HASTE).toBe(0);
  expect(fresh.creature.sprite.pixels.length).toBe(256);
});

test("forgetting nothing is not an error", () => {
  expect(() => forgetCharacter()).not.toThrow();
  expect(loadCharacter()).toBeNull();
});

test("storage refusing to forget is not an exception either", () => {
  const mine = drawn();
  saveCharacter("Sprocket", mine.build, mine.creature);
  store.refuse = true;
  expect(() => forgetCharacter()).not.toThrow();
});

test("it takes two taps, and the first one changes nothing", async () => {
  const make = await Bun.file("src/web/make/main.ts").text();
  // Genuinely destructive -- spec §5b is blunt that the code is the only copy
  // -- so the first tap arms it and says so, and only the second one acts.
  const at = make.indexOf("forget.addEventListener");
  const body = make.slice(at, make.indexOf("\n});", at));
  expect(body.indexOf("if (!armed)")).toBeLessThan(body.indexOf("forgetCharacter()"));
  expect(body.includes("the code above is the only copy")).toBe(true);
  // ...and the code on screen has to follow, or the box would still show the
  // save file for a character that no longer exists.
  expect(body.includes("paintCode();")).toBe(true);
});
