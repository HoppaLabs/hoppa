import { expect, test } from "bun:test";
import { soundsFor, type Cue, type Moment } from "../src/web/play/sound.ts";

// Which noise, decided by comparing two instants. Kept apart from the thing
// that makes the noise so it can be tested without a browser -- and because
// "when should this make a sound" is where the bugs are, not "how loud".

const at = (bits: Partial<Moment>): Moment => ({
  hp: 3,
  treasure: 0,
  playing: true,
  won: false,
  ...bits,
});

const between = (before: Partial<Moment>, after: Partial<Moment>): readonly Cue[] =>
  soundsFor(at(before), at(after));

test("nothing happening is silence", () => {
  expect(between({}, {})).toEqual([]);
});

test("picking up treasure is a noise", () => {
  expect(between({ treasure: 0 }, { treasure: 1 })).toEqual(["treasure"]);
});

test("losing a heart is a noise", () => {
  expect(between({ hp: 3 }, { hp: 2 })).toEqual(["hurt"]);
});

test("winning and losing are different noises", () => {
  expect(between({ playing: true }, { playing: false, won: true })).toEqual(["won"]);
  expect(between({ playing: true }, { playing: false, won: false })).toEqual(["lost"]);
});

test("the last heart is one noise, not two on top of each other", () => {
  // Losing the run and losing the heart that caused it arrive in the same
  // frame. Two sounds at once is a clatter, and the one that matters is the end.
  expect(between({ hp: 1, playing: true }, { hp: 0, playing: false, won: false })).toEqual(["lost"]);
});

test("a win with the last treasure says both, because both are true", () => {
  expect(
    between({ treasure: 3, playing: true }, { treasure: 4, playing: false, won: true }),
  ).toEqual(["treasure", "won"]);
});

test("restarting is not a theft", () => {
  // A new run has no treasure and full hearts. Neither is a noise.
  expect(between({ treasure: 4, hp: 1 }, { treasure: 0, hp: 3 })).toEqual([]);
});

test("the end does not keep sounding once it has happened", () => {
  // paint() runs again after a run is over; "finished" is not an event.
  expect(between({ playing: false, won: true }, { playing: false, won: true })).toEqual([]);
  expect(between({ playing: false, won: false }, { playing: false, won: false })).toEqual([]);
});

test("a level with no hearts and no treasure never makes either noise", () => {
  // The turn-based builds have neither idea, and read out as zero forever.
  const still = at({ hp: 0, treasure: 0 });
  expect(soundsFor(still, still)).toEqual([]);
});

test("mercy is not a hit: hearts only ever go down for a reason", () => {
  // Hearts coming back is not a sound, whatever put them back.
  expect(between({ hp: 1 }, { hp: 3 })).toEqual([]);
});

test("it is a pure function of the two moments, and says so", () => {
  const before = at({ treasure: 1 });
  const after = at({ treasure: 2 });
  expect(soundsFor(before, after)).toEqual(soundsFor(before, after));
  // ...and does not modify what it is given.
  expect(before).toEqual(at({ treasure: 1 }));
  expect(after).toEqual(at({ treasure: 2 }));
});

test("no engine anywhere is told about sound", async () => {
  // Hard rule 4: cosmetics never touch stateHash(). An engine that knows about
  // a noise is an engine whose behaviour could come to depend on one.
  const engines = new Bun.Glob("src/engines/**/*.ts");
  for await (const path of engines.scan(".")) {
    const text = await Bun.file(path).text();
    // Deliberately narrow: words that can only mean sound, so this fails when
    // somebody wires a noise into an engine and not when they write "display".
    for (const word of ["sound", "Audio", "sound.ts"]) {
      expect({ path, word, found: text.includes(word) }).toEqual({ path, word, found: false });
    }
  }
  // ...and the same for core.
  const core = new Bun.Glob("src/core/**/*.ts");
  for await (const path of core.scan(".")) {
    const text = await Bun.file(path).text();
    expect({ path, audio: text.includes("Audio") }).toEqual({ path, audio: false });
  }
});
