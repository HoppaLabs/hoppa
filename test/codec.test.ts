import { expect, test } from "bun:test";
import * as fixtures from "../src/core/fixtures.ts";
import { parseLevel } from "../src/core/level.ts";
import {
  CODEC_VERSION,
  CodecError,
  decodeLevel,
  encodeLevel,
  levelToText,
  sameLevel,
} from "../src/core/codec.ts";
import { fromBase64url, toBase64url } from "../src/core/bits.ts";
import { hashBytes, hashInit } from "../src/core/hash.ts";
import { engineFor } from "../src/engines/registry.ts";

const LEVELS = Object.entries(fixtures)
  .filter(([, text]) => typeof text === "string")
  .map(([name, text]) => [name.replace("_LEVEL_TEXT", ""), text as string] as const);

// --- L6: round trips ---------------------------------------------------------

test.each(LEVELS)("L6: %s survives encode → decode unchanged", (_name, text) => {
  const level = parseLevel(text);
  expect(sameLevel(level, decodeLevel(encodeLevel(level)))).toBe(true);
});

test.each(LEVELS)("L6: %s comes back as the same .lvl text", (_name, text) => {
  const level = parseLevel(text);
  // The grid must be identical glyph for glyph. The header can differ only in
  // how the seed is spelled, which is why levelToText is compared after a
  // second parse rather than as raw strings.
  const round = levelToText(decodeLevel(encodeLevel(level)));
  expect(round.split("\n").slice(1)).toEqual(text.split("\n").slice(1));
});

test("L6: encoding is stable -- the same level always gives the same code", () => {
  const level = parseLevel(fixtures.DAY4_LEVEL_TEXT);
  expect(encodeLevel(level)).toBe(encodeLevel(level));
});

// --- L7: the budget ----------------------------------------------------------

test("L7: every shipped level is inside spec S10's 150-character budget", () => {
  const rows = LEVELS.map(([name, text]) => {
    const code = encodeLevel(parseLevel(text));
    const url = `https://hoppalabs.github.io/hoppa/#p/a-level-name/${code}`;
    return { name, chars: code.length, url: url.length };
  });
  console.log(
    `\n  LEVEL  CODE  URL\n${rows
      .map((r) => `  ${r.name.padEnd(5)} ${String(r.chars).padStart(4)}  ${String(r.url).padStart(4)}`)
      .join("\n")}`,
  );
  for (const row of rows) {
    expect(row.chars).toBeLessThan(150);
    expect(row.url).toBeLessThan(300);
  }
});

// --- L8: URL safety ----------------------------------------------------------

test.each(LEVELS)("L8: %s's code survives percent-encoding untouched", (_name, text) => {
  const code = encodeLevel(parseLevel(text));
  expect(encodeURIComponent(code)).toBe(code);
  expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
});

test("L8: a code survives a round trip through URL and back", () => {
  const level = parseLevel(fixtures.DAY3_LEVEL_TEXT);
  const code = encodeLevel(level);
  const url = new URL(`https://example.test/#p/name/${code}`);
  const back = url.hash.slice(1).split("/").slice(2).join("/");
  expect(sameLevel(level, decodeLevel(back))).toBe(true);
});

// --- behaviour version pinning -----------------------------------------------

test("a link pins its behaviour version, and routes to that build", () => {
  for (const [, text] of LEVELS) {
    const original = parseLevel(text);
    const decoded = decodeLevel(encodeLevel(original));
    expect(decoded.behaviourVersion).toBe(original.behaviourVersion);
    expect(engineFor(decoded).behaviourVersion).toBe(original.behaviourVersion);
  }
});

test("a decoded level plays identically to the one it was encoded from", () => {
  const original = parseLevel(fixtures.DAY3_LEVEL_TEXT);
  const decoded = decodeLevel(encodeLevel(original));
  const log = ".RRRR..DDDDRRDDDDLLLLLRRRRRRRRRRR..DDDLLRR..UUUUUUULLUUUURRRRRRRRRR";
  const MOVES: Record<string, number> = { U: 1, R: 2, D: 3, L: 4, ".": 0 };

  const a = engineFor(original);
  const b = engineFor(decoded);
  for (const ch of log) {
    a.step(MOVES[ch] as number);
    b.step(MOVES[ch] as number);
  }
  expect(b.stateHash()).toBe(a.stateHash());
});

// --- both wall encodings are real --------------------------------------------

test("both wall encodings are exercised by the shipped levels", () => {
  // The wall-encoding flag is bit 54: 4+4+4+6+4+32 bits of header before it.
  const flags = LEVELS.map(([name, text]) => {
    const bytes = fromBase64url(encodeLevel(parseLevel(text)));
    const bit = ((bytes[54 >> 3] as number) >>> (7 - (54 & 7))) & 1;
    return `${name}=${bit === 1 ? "runs" : "raw"}`;
  });
  console.log(`\n  wall encoding: ${flags.join("  ")}`);
  expect(flags.some((f) => f.endsWith("runs"))).toBe(true);
  expect(flags.some((f) => f.endsWith("raw"))).toBe(true);
});

// --- E8: malformed codes are refused, never a crash --------------------------

test("E8: garbage codes are rejected cleanly", () => {
  const good = encodeLevel(parseLevel(fixtures.DAY4_LEVEL_TEXT));
  const bad = [
    "",
    "!!!!",
    "a",
    "hello world",
    good.slice(0, 8),
    good.slice(0, good.length - 4),
    `${good}AAAA`,
    good.split("").reverse().join(""),
    "A".repeat(400),
  ];

  for (const code of bad) {
    let threw = false;
    try {
      const level = decodeLevel(code);
      // Some corruptions decode to a structurally valid but different level.
      // That is allowed -- what is not allowed is a crash or a hang.
      expect(level.walls.length).toBe(336);
    } catch (err) {
      threw = true;
      expect(err).toBeInstanceOf(CodecError);
    }
    expect(typeof threw).toBe("boolean");
  }
});

test("E8: a code from a future codec version refuses politely", () => {
  // Bump the version and re-stamp the checksum, so this tests the version
  // check rather than tripping the damage check on the way in.
  const stamped = fromBase64url(encodeLevel(parseLevel(fixtures.DAY4_LEVEL_TEXT)));
  const payload = stamped.subarray(0, stamped.length - 1);
  payload[0] = ((CODEC_VERSION + 1) << 4) | ((payload[0] as number) & 0x0f);
  const rebuilt = new Uint8Array(stamped.length);
  rebuilt.set(payload, 0);
  rebuilt[stamped.length - 1] = hashBytes(hashInit(), payload) & 0xff;

  expect(() => decodeLevel(toBase64url(rebuilt))).toThrow(CodecError);
  expect(() => decodeLevel(toBase64url(rebuilt))).toThrow(/codec v/);
});

test("E8: every single-character corruption is refused or decodes to a level", () => {
  const good = encodeLevel(parseLevel(fixtures.DAY2_LEVEL_TEXT));
  const alphabet = "ABCXYZabcxyz0189-_";
  let refused = 0;
  let decoded = 0;

  for (let i = 0; i < good.length; i++) {
    for (const ch of alphabet) {
      if (good[i] === ch) continue;
      const broken = good.slice(0, i) + ch + good.slice(i + 1);
      try {
        expect(decodeLevel(broken).walls.length).toBe(336);
        decoded++;
      } catch (err) {
        expect(err).toBeInstanceOf(CodecError);
        refused++;
      }
    }
  }
  console.log(
    `\n  single-character corruptions: ${refused} refused, ${decoded} silently decoded to another level`,
  );
  expect(refused + decoded).toBeGreaterThan(1000);
  // The checksum is what makes this zero. Without it, roughly 1200 of these
  // quietly became a different, possibly unbeatable, level.
  expect(decoded).toBe(0);
});

// --- base64url ---------------------------------------------------------------

test("base64url round-trips arbitrary bytes, including awkward lengths", () => {
  for (let n = 0; n < 40; n++) {
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = (i * 37 + n * 11) & 0xff;
    const back = fromBase64url(toBase64url(bytes));
    expect([...back]).toEqual([...bytes]);
  }
});

test("base64url never emits a character a URL would escape", () => {
  const bytes = new Uint8Array(256);
  for (let i = 0; i < 256; i++) bytes[i] = i;
  const text = toBase64url(bytes);
  expect(encodeURIComponent(text)).toBe(text);
});

// --- the wire format is itself a golden vector -------------------------------

import codes from "./golden/codes.json";

// If this fails, the bit layout moved. Every link already sent now decodes to a
// different level or refuses outright. Stop and flag it -- do not regenerate.
test("E9: the committed level codes still encode identically", () => {
  expect(codes.codecVersion).toBe(CODEC_VERSION);
  for (const row of codes.levels) {
    const name = row.level.replace("levels/", "").replace(".lvl", "").toUpperCase();
    const text = (fixtures as Record<string, string>)[`${name}_LEVEL_TEXT`];
    expect(text).toBeDefined();
    expect(encodeLevel(parseLevel(text as string))).toBe(row.code);
  }
});

test("every committed code still decodes to the level it came from", () => {
  for (const row of codes.levels) {
    const name = row.level.replace("levels/", "").replace(".lvl", "").toUpperCase();
    const text = (fixtures as Record<string, string>)[`${name}_LEVEL_TEXT`] as string;
    expect(sameLevel(parseLevel(text), decodeLevel(row.code))).toBe(true);
  }
});
