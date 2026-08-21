import { expect, test } from "bun:test";
import { CodecError, decodeLevel, encodeLevel, ENGINE_IDS } from "../src/core/codec.ts";
import { LevelParseError, parseLevel } from "../src/core/level.ts";
import { ChrError, ALPHABET, decodeCharacter, encodeCharacter } from "../src/core/chr.ts";
import { engineFor, knownBuilds, UnknownBehaviourError } from "../src/engines/registry.ts";
import { creatureFromBuild, uniformCreature, type Build } from "../src/core/creature.ts";
import { SpriteError, spriteFromText, starterSprite } from "../src/core/sprite.ts";
import { beats, replay, Recorder } from "../src/core/proof.ts";
import { adviceFor } from "../src/core/advice.ts";
import { verifyLevelText } from "../src/core/verify.ts";
import { DAY7_LEVEL_TEXT, ROAM3_LEVEL_TEXT, DASH3_LEVEL_TEXT } from "../src/core/fixtures.ts";
import { STATUS_PLAYING, STATUS_WON, type Replayable } from "../src/engines/types.ts";
import { TILE_COUNT } from "../src/core/tiles.ts";
import { GRID_AREA, GRID_H, GRID_W } from "../src/core/grid.ts";

// Deliberately hostile, and reproducible: a seeded PRNG, so a failure here can
// be reproduced exactly rather than "it went wrong once on a Tuesday".
//
// Spec S16 day 13 names the targets: truncated URLs, retyped codes, unsolvable
// levels, zero-cap creatures, cycle abuse, oversized sprites. This attacks all
// of them on purpose, rather than waiting to trip over them.
function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return (s >>> 8) / 0x1000000;
  };
}

const CREATURES = [
  uniformCreature(0, "Nothing"),
  uniformCreature(255, "Everything"),
  creatureFromBuild("m", "Middling", "@", { FORCE: 3, HASTE: 3 } as Build, starterSprite()),
];

/** The shipped level for an engine, retargeted at one of its builds. */
function levelFor(key: string): string {
  const engine = key.slice(0, key.lastIndexOf("/"));
  const version = key.slice(key.lastIndexOf("/") + 1);
  const source =
    engine === "delve" ? DAY7_LEVEL_TEXT : engine === "roam" ? ROAM3_LEVEL_TEXT : DASH3_LEVEL_TEXT;
  return source
    .replace(/^hoppa\/1 \w+/m, `hoppa/1 ${engine}`)
    .replace(/behaviour=\d+/, `behaviour=${version}`);
}

/** Anything thrown that is not the module's own error type is a finding. */
function onlyThrows(
  fn: () => unknown,
  ...allowed: Array<new (...a: never[]) => Error>
): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    if (allowed.some((E) => err instanceof E)) return null;
    return `${(err as Error).name}: ${(err as Error).message}`;
  }
}

// --- attacking the level link ---------------------------------------------------------

test("every truncation of a real level code is refused, never mis-decoded", () => {
  const code = encodeLevel(parseLevel(ROAM3_LEVEL_TEXT));
  const surprises: string[] = [];
  let decoded = 0;
  for (let cut = 0; cut < code.length; cut++) {
    const bad = onlyThrows(() => {
      const level = decodeLevel(code.slice(0, cut));
      decoded++;
      // If a truncated code decodes at all, what comes out must still be a
      // level an engine can be handed without exploding.
      expect(level.walls).toHaveLength(GRID_AREA);
      expect(level.startX).toBeGreaterThanOrEqual(0);
      expect(level.startX).toBeLessThan(GRID_W);
    }, CodecError);
    if (bad !== null) surprises.push(`len ${cut}: ${bad}`);
  }
  console.log(
    `\n  truncated links: ${code.length} tried, ${decoded} still decoded, ${surprises.length} odd throws`,
  );
  expect(surprises).toEqual([]);
});

test("every single-character change to a level code is refused or decodes sanely", () => {
  const code = encodeLevel(parseLevel(ROAM3_LEVEL_TEXT));
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const surprises: string[] = [];
  let survived = 0;
  const pick = rng(11);
  for (let i = 0; i < code.length; i++) {
    for (let n = 0; n < 3; n++) {
      const ch = alphabet[Math.floor(pick() * alphabet.length)] as string;
      if (code[i] === ch) continue;
      const broken = `${code.slice(0, i)}${ch}${code.slice(i + 1)}`;
      const bad = onlyThrows(() => {
        const level = decodeLevel(broken);
        survived++;
        expect(level.walls).toHaveLength(GRID_AREA);
        expect(level.startX).toBeGreaterThanOrEqual(0);
        expect(level.startX).toBeLessThan(GRID_W);
        expect(level.startY).toBeLessThan(GRID_H);
      }, CodecError);
      if (bad !== null) surprises.push(`at ${i}: ${bad}`);
    }
  }
  console.log(`  mangled links: ${survived} still decoded, ${surprises.length} odd throws`);
  expect(surprises).toEqual([]);
});

test("random rubbish as a level code never crashes oddly", () => {
  const pick = rng(23);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=+/%. ";
  const surprises: string[] = [];
  for (let n = 0; n < 400; n++) {
    let junk = "";
    const len = Math.floor(pick() * 120);
    for (let i = 0; i < len; i++) junk += alphabet[Math.floor(pick() * alphabet.length)];
    const bad = onlyThrows(() => decodeLevel(junk), CodecError);
    if (bad !== null) surprises.push(`"${junk.slice(0, 24)}": ${bad}`);
  }
  expect(surprises).toEqual([]);
});

test("a level naming an engine or a version that does not exist refuses politely", () => {
  for (const engine of [...ENGINE_IDS, "nonsense"]) {
    for (const version of [0, 1, 7, 63]) {
      const text = ROAM3_LEVEL_TEXT.replace(
        /^hoppa\/1 \w+ seed=\S+ tiles=\d+ behaviour=\d+/m,
        `hoppa/1 ${engine} seed=0 tiles=1 behaviour=${version}`,
      );
      const bad = onlyThrows(
        () => {
          const level = parseLevel(text);
          if (!knownBuilds().includes(`${level.engine}/${level.behaviourVersion}`)) {
            expect(() => engineFor(level)).toThrow(UnknownBehaviourError);
          } else {
            expect(engineFor(level).behaviourVersion).toBe(level.behaviourVersion);
          }
        },
        LevelParseError,
        UnknownBehaviourError,
      );
      if (bad !== null) throw new Error(`${engine}/${version}: ${bad}`);
    }
  }
});

// --- attacking the level text ------------------------------------------------------------

test("malformed level text is refused, never half-parsed", () => {
  const rows = ROAM3_LEVEL_TEXT.split("\n");
  const attacks: Array<readonly [string, string]> = [
    ["no header", rows.slice(1).join("\n")],
    ["header only", rows[0] as string],
    ["a row too short", [rows[0], (rows[1] as string).slice(0, 10), ...rows.slice(2)].join("\n")],
    ["a row too long", [rows[0], `${rows[1]}##`, ...rows.slice(2)].join("\n")],
    ["too few rows", rows.slice(0, 8).join("\n")],
    ["too many rows", [...rows, rows[2] as string].join("\n")],
    ["unknown glyph", ROAM3_LEVEL_TEXT.replace(".", "Z")],
    ["two starts", ROAM3_LEVEL_TEXT.replace(".", "@")],
    ["no start", ROAM3_LEVEL_TEXT.replace("@", ".")],
    ["empty", ""],
    ["just newlines", "\n\n\n\n"],
    ["a tab in a row", ROAM3_LEVEL_TEXT.replace(".", "\t")],
  ];
  for (const [name, text] of attacks) {
    const bad = onlyThrows(() => parseLevel(text), LevelParseError);
    if (bad !== null) throw new Error(`${name}: ${bad}`);
  }
});

test("a level with no exit still runs, and still ends", () => {
  const noExit = ROAM3_LEVEL_TEXT.replace(">", ".");
  expect(verifyLevelText(noExit).ok).toBe(false);
  expect(adviceFor(noExit).playable).toBe(false);
  // ...and the engine must not care: it runs, and it stops.
  const engine = engineFor(parseLevel(noExit), CREATURES[2]) as unknown as Replayable;
  let status: number = STATUS_PLAYING;
  let ticks = 0;
  while (status === STATUS_PLAYING && ticks < 8000) {
    status = engine.step(2);
    ticks++;
  }
  expect(status).not.toBe(STATUS_PLAYING);
});

// --- attacking the creature ---------------------------------------------------------------

/**
 * delve/1 has no ending, and that is not a bug.
 *
 * Day 1 was "a coloured square you move around a grid": no win, no loss, no
 * turn counter. It is kept in the bundle only so a link from that day still
 * plays, and hard rule 3 forbids giving it one now. Pinned below rather than
 * quietly skipped, so nobody later mistakes it for an oversight.
 */
const NEVER_ENDS: readonly string[] = ["delve/1", "calm/1"];

test.each(NEVER_ENDS)("%s really does run forever, which is why it is excluded below", (key) => {
  // Two builds, for opposite reasons. delve/1 was day one and simply had no
  // ending written yet. calm/1 has no ending ON PURPOSE: it is a place to walk
  // around, and every other engine turns a two-minute visit into a LOSS when
  // the tick cap runs out, which is the exact feeling it exists to avoid.
  const engine = engineFor(parseLevel(levelFor(key)), CREATURES[2]) as unknown as Replayable;
  let status: number = STATUS_PLAYING;
  for (let t = 0; t < 5000; t++) status = engine.step(t % 5);
  expect(status).toBe(STATUS_PLAYING);
});

test("E1, E2 and E4: a nothing creature and an everything creature finish every build", () => {
  const surprises: string[] = [];
  for (const key of knownBuilds()) {
    if (NEVER_ENDS.includes(key)) continue;
    for (const creature of [CREATURES[0], CREATURES[1]]) {
      const bad = onlyThrows(() => {
        const engine = engineFor(parseLevel(levelFor(key)), creature) as unknown as Replayable;
        let status: number = STATUS_PLAYING;
        let ticks = 0;
        while (status === STATUS_PLAYING && ticks < 8000) {
          status = engine.step(ticks % 17);
          ticks++;
        }
        expect(status).not.toBe(STATUS_PLAYING);
      });
      if (bad !== null) surprises.push(`${key} ${creature?.name}: ${bad}`);
    }
  }
  expect(surprises).toEqual([]);
});

test("E5: two hundred seeded random logs per build crash nothing", () => {
  const surprises: string[] = [];
  let runs = 0;
  for (const key of knownBuilds()) {
    const level = parseLevel(levelFor(key));
    for (let seed = 0; seed < 200; seed++) {
      const pick = rng(seed * 7919 + 13);
      const bad = onlyThrows(() => {
        const engine = engineFor(level, CREATURES[seed % 3]) as unknown as Replayable & {
          render(): Uint8Array;
        };
        let status: number = STATUS_PLAYING;
        for (let t = 0; t < 400 && status === STATUS_PLAYING; t++) {
          // Out of range as well as in: garbage input is a wait, not a crash.
          status = engine.step(Math.floor(pick() * 200) - 40);
        }
        expect(engine.render()).toHaveLength(GRID_AREA);
        expect(Number.isInteger(engine.stateHash())).toBe(true);
      });
      runs++;
      if (bad !== null) surprises.push(`${key} seed ${seed}: ${bad}`);
    }
  }
  console.log(`  fuzz: ${runs} runs across ${knownBuilds().length} builds`);
  expect(surprises).toEqual([]);
});

test("E7: render always returns one valid tile per cell", () => {
  for (const key of knownBuilds()) {
    const engine = engineFor(parseLevel(levelFor(key)), CREATURES[2]) as unknown as Replayable & {
      render(): Uint8Array;
    };
    for (let t = 0; t < 60; t++) engine.step(t % 5);
    const tiles = engine.render();
    expect(tiles).toHaveLength(GRID_AREA);
    // Against TILE_COUNT, not a number typed here. This was a hardcoded 10 and
    // had already gone stale twice over -- TILE_FIRE is 10 and TILE_FLOW is 11
    // -- so it only passed for as long as no test level had a hazard in it.
    for (const tile of tiles) {
      expect({ tile, known: tile < TILE_COUNT }).toEqual({ tile, known: true });
    }
  }
});

// --- cycle abuse ------------------------------------------------------------------------------

test("guards crammed together, and a corridor the length of the room, still terminate", () => {
  const rows: string[] = [];
  for (let y = 0; y < GRID_H; y++) {
    let row = "";
    for (let x = 0; x < GRID_W; x++) {
      const edge = x === 0 || y === 0 || x === GRID_W - 1 || y === GRID_H - 1;
      // A wide open room, a row of guards shoulder to shoulder, one long
      // corridor: everything spec S8's cap on cycle length exists to bound.
      row += edge ? "#" : y === 6 && x > 1 && x < 12 ? "G" : ".";
    }
    rows.push(row);
  }
  rows[1] = `#@${(rows[1] as string).slice(2)}`;
  rows[GRID_H - 2] = `${(rows[GRID_H - 2] as string).slice(0, GRID_W - 2)}>#`;
  const text = `hoppa/1 roam seed=0 tiles=1 behaviour=3\n${rows.join("\n")}\n`;

  // The level checks should object; the engine must run it regardless.
  expect(verifyLevelText(text).ok).toBe(false);
  const engine = engineFor(parseLevel(text), CREATURES[1]) as unknown as Replayable;
  let status: number = STATUS_PLAYING;
  let ticks = 0;
  while (status === STATUS_PLAYING && ticks < 8000) {
    status = engine.step(ticks % 6);
    ticks++;
  }
  expect(status).not.toBe(STATUS_PLAYING);
});

// --- attacking the sprite ---------------------------------------------------------------

test("oversized, undersized and rubbish sprite text does not crash", () => {
  const attacks = [
    "",
    "\n",
    "0".repeat(10_000),
    "3".repeat(255),
    new Array(64).fill("3".repeat(64)).join("\n"),
    new Array(4).fill("3").join("\n"),
    "0123456789abcdef",
    "....\n....\n",
  ];
  for (const text of attacks) {
    const bad = onlyThrows(() => {
      const sprite = spriteFromText(text, [1, 2, 3]);
      for (const px of sprite.pixels) expect(px).toBeLessThan(4);
    }, SpriteError);
    if (bad !== null) throw new Error(`sprite "${text.slice(0, 12)}": ${bad}`);
  }
});

// --- attacking the character code ----------------------------------------------------------

test("C5, harder: nothing typed into the code box crashes oddly", () => {
  const real = encodeCharacter("Bash", { FORCE: 5, HASTE: 1 } as Build, starterSprite());
  const pick = rng(41);
  const attacks: string[] = [
    "",
    " ",
    "-",
    "HOPPA",
    "HOPPA-",
    "HOPPA--",
    "HOPPA-X-",
    real.repeat(3),
    real.slice(0, real.length - 1),
    `${real}A`,
    real.replace(/-/g, ""),
    real.toLowerCase(),
    `  ${real}  `,
    real.split("").reverse().join(""),
    " ".repeat(20),
  ];
  for (let i = 0; i < 200; i++) {
    let junk = "HOPPA-JUNK-";
    const len = Math.floor(pick() * 80);
    for (let n = 0; n < len; n++) junk += ALPHABET[Math.floor(pick() * ALPHABET.length)];
    attacks.push(junk);
  }
  for (const text of attacks) {
    const bad = onlyThrows(() => decodeCharacter(text), ChrError);
    if (bad !== null) throw new Error(`code "${text.slice(0, 20)}": ${bad}`);
  }
});

// --- attacking the share gate --------------------------------------------------------------

test("no invented log opens the gate unless it genuinely wins", () => {
  const level = parseLevel(ROAM3_LEVEL_TEXT);
  const make = () => engineFor(level, CREATURES[2]) as unknown as Replayable;
  const pick = rng(97);
  let opened = 0;
  for (let n = 0; n < 300; n++) {
    const log: number[] = [];
    const runs = 1 + Math.floor(pick() * 12);
    for (let r = 0; r < runs; r++) {
      log.push(Math.floor(pick() * 64), 1 + Math.floor(pick() * 200));
    }
    if (beats(log, make, STATUS_WON)) {
      // Not a failure if it genuinely wins -- but it must genuinely win.
      expect(replay(log, make).status).toBe(STATUS_WON);
      opened++;
    }
  }
  console.log(`  invented logs: 300 tried, ${opened} won (and every one really did)`);
});

test("a log far longer than the tick cap cannot hang the gate", () => {
  const level = parseLevel(ROAM3_LEVEL_TEXT);
  const make = () => engineFor(level, CREATURES[2]) as unknown as Replayable;
  const rec = new Recorder();
  for (let i = 0; i < 500_000; i++) rec.push(2);
  const out = replay(rec.log(), make);
  // The engine's own tick cap stops it long before the log runs out.
  expect(out.status).not.toBe(STATUS_PLAYING);
  expect(out.ticks).toBeLessThan(500_000);
});

// --- attacking the editor's checks -----------------------------------------------------------

test("the plain-word advice never crashes, whatever the level", () => {
  const pick = rng(59);
  const glyphs = "#.@>$GH";
  const surprises: string[] = [];
  let refused = 0;
  for (let n = 0; n < 250; n++) {
    let body = "";
    for (let y = 0; y < GRID_H; y++) {
      let row = "";
      for (let x = 0; x < GRID_W; x++) row += glyphs[Math.floor(pick() * glyphs.length)];
      body += `${row}\n`;
    }
    const engine = ["roam", "dash"][Math.floor(pick() * 2)] as string;
    const text = `hoppa/1 ${engine} seed=0 tiles=1 behaviour=3\n${body}`;
    const bad = onlyThrows(() => {
      const advice = adviceFor(text);
      expect(typeof advice.playable).toBe("boolean");
      for (const note of advice.notes) expect(note.text.length).toBeGreaterThan(0);
      if (!advice.playable) refused++;
    });
    if (bad !== null) surprises.push(bad);
  }
  console.log(`  random levels through the checks: 250 tried, ${refused} refused, ${surprises.length} surprises`);
  expect(surprises).toEqual([]);
});


// --- links that decode but cannot be played ------------------------------------------------

/**
 * The gap the red team actually found.
 *
 * The wire format holds 31 entities; an engine holds eight treasures. So a
 * level can survive the codec intact and then be refused by the engine -- and
 * that refusal used to happen while the page was still starting up, which left
 * a white screen and no explanation at all.
 *
 * The engines still refuse, which is right. What changed is that the page now
 * catches it and falls back to the built-in level. These tests pin the fact
 * that such a link EXISTS and is well formed, so the page's guard cannot be
 * removed as unnecessary.
 */
function tooMuchTreasure(): string {
  const rows = [
    "########################",
    "#@.....................#",
    "#$$$$$$$$$.............#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#.....................>#",
    "########################",
  ];
  return `hoppa/1 roam seed=0 tiles=1 behaviour=3\n${rows.join("\n")}\n`;
}

test("a level with more treasure than an engine holds still makes a valid link", () => {
  const text = tooMuchTreasure();
  const level = parseLevel(text);
  expect(level.treasureCells.length).toBe(9);
  // It encodes, and it comes back identical. Nothing in the codec objects.
  const code = encodeLevel(level);
  expect(decodeLevel(code).treasureCells.length).toBe(9);
  // The level checks DO object, which is the layer that is supposed to.
  expect(verifyLevelText(text).ok).toBe(false);
});

test("...and every engine refuses it rather than running it wrong", () => {
  const level = decodeLevel(encodeLevel(parseLevel(tooMuchTreasure())));
  for (const key of knownBuilds()) {
    if (!key.startsWith("roam/") && !key.startsWith("dash/")) continue;
    const pinned = { ...level, behaviourVersion: Number(key.slice(key.indexOf("/") + 1)) };
    const engine = key.startsWith("roam/") ? "roam" : "dash";
    if (level.engine !== engine) continue;
    let refused = false;
    try {
      engineFor(pinned as typeof level);
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  }
});

test("every entity kind can be piled up without the codec losing its footing", () => {
  // Right at the wire format's limit of 31 entities.
  const rows: string[] = [];
  for (let y = 0; y < GRID_H; y++) {
    let row = "";
    for (let x = 0; x < GRID_W; x++) {
      const edge = x === 0 || y === 0 || x === GRID_W - 1 || y === GRID_H - 1;
      row += edge ? "#" : y === 5 && x < 22 ? "G" : ".";
    }
    rows.push(row);
  }
  rows[1] = `#@${(rows[1] as string).slice(2)}`;
  rows[GRID_H - 2] = `${(rows[GRID_H - 2] as string).slice(0, GRID_W - 2)}>#`;
  const text = `hoppa/1 roam seed=0 tiles=1 behaviour=3\n${rows.join("\n")}\n`;

  const level = parseLevel(text);
  const bad = onlyThrows(() => {
    const round = decodeLevel(encodeLevel(level));
    expect(round.guardCells.length).toBe(level.guardCells.length);
  }, CodecError);
  expect(bad).toBeNull();
});
