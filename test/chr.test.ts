import { expect, test } from "bun:test";
import {
  ALPHABET,
  ChrError,
  CHR_VERSION,
  checkSymbol,
  decodeCharacter,
  encodeCharacter,
  symbolValue,
  tidyName,
} from "../src/core/chr.ts";
import { BRUK, NIM, PELL, capsToBuild, type Build } from "../src/core/creature.ts";
import { pixelsToText, spriteFromRows, starterSprite } from "../src/core/sprite.ts";

const BUILD: Build = { FORCE: 5, HASTE: 1 };
const CODE = encodeCharacter("Bash", BUILD, BRUK.sprite);

// --- C1: it round-trips ----------------------------------------------------------

test("C1: a character survives code and back, drawing and points alike", () => {
  const back = decodeCharacter(CODE);
  expect(back.name).toBe("Bash");
  expect(back.build).toEqual(BUILD);
  expect(pixelsToText(back.creature.sprite)).toBe(pixelsToText(BRUK.sprite));
  expect(back.creature.sprite.sub).toEqual(BRUK.sprite.sub);
});

test.each([["Bash", BRUK], ["Nim", NIM], ["Pell", PELL]] as const)(
  "C1: %s round-trips exactly",
  (name, creature) => {
    const build = capsToBuild(creature.caps);
    const back = decodeCharacter(encodeCharacter(name, build, creature.sprite));
    expect(back.build).toEqual(build);
    expect([...back.creature.sprite.pixels]).toEqual([...creature.sprite.pixels]);
  },
);

test("a blank drawing and a full one both survive", () => {
  const blank = spriteFromRows(new Array(16).fill(".".repeat(16)), [0, 1, 2]);
  const solid = spriteFromRows(new Array(16).fill("3".repeat(16)), [10, 20, 30]);
  for (const sprite of [blank, solid]) {
    const back = decodeCharacter(encodeCharacter("Test", BUILD, sprite));
    expect([...back.creature.sprite.pixels]).toEqual([...sprite.pixels]);
  }
});

test("the code is short enough to actually type", () => {
  const codes = [
    encodeCharacter("Bash", BUILD, BRUK.sprite),
    encodeCharacter("Nim", capsToBuild(NIM.caps), NIM.sprite),
    encodeCharacter("Pell", capsToBuild(PELL.caps), PELL.sprite),
    encodeCharacter("Mine", BUILD, starterSprite()),
  ];
  for (const code of codes) {
    console.log(`\n  ${code.length} chars: ${code}`);
    expect(code.length).toBeLessThan(140); // spec S5b expects ~130
  }
});

// --- C2: the check symbol earns its place ------------------------------------------

/** Rebuild a code from its parts, so a test can change one symbol cleanly. */
function rebuild(name: string, symbols: string): string {
  const chunks: string[] = [];
  for (let i = 0; i < symbols.length; i += 5) chunks.push(symbols.slice(i, i + 5));
  return `HOPPA-${name}-${chunks.join("-")}-${checkSymbol(symbols)}`;
}

const SYMBOLS = CODE.split("-").slice(2, -1).join("");
const CHECK = CODE.split("-").slice(-1)[0] as string;

test("C2: every single-character change to the code is caught", () => {
  let caught = 0;
  let missed = 0;

  for (let i = 0; i < SYMBOLS.length; i++) {
    for (const ch of ALPHABET) {
      if (SYMBOLS[i] === ch) continue;
      const broken = SYMBOLS.slice(0, i) + ch + SYMBOLS.slice(i + 1);
      // Keep the ORIGINAL check symbol: that is what a mistyped code looks like.
      const chunks: string[] = [];
      for (let c = 0; c < broken.length; c += 5) chunks.push(broken.slice(c, c + 5));
      try {
        decodeCharacter(`HOPPA-BASH-${chunks.join("-")}-${CHECK}`);
        missed++;
      } catch (err) {
        expect(err).toBeInstanceOf(ChrError);
        caught++;
      }
    }
  }
  console.log(`\n  single-character changes: ${caught} caught, ${missed} slipped through`);
  expect(caught).toBeGreaterThan(2000);
  expect(missed).toBe(0);
});

test("the name is decoration and is NOT protected, which is deliberate", () => {
  // The check symbol covers the character itself, not the label on the front.
  // Mistyping the name gives you the same creature under a different name --
  // harmless, and it doubles as a way to rename one. Worth stating outright so
  // nobody later assumes the whole string is checksummed.
  const renamed = rebuild("WOBBLE", SYMBOLS);
  const back = decodeCharacter(renamed);
  expect(back.name).toBe("Wobble");
  expect(back.build).toEqual(BUILD);
  expect(pixelsToText(back.creature.sprite)).toBe(pixelsToText(BRUK.sprite));
});

test("C2: swapping two characters is caught", () => {
  const symbols = SYMBOLS;
  const check = CHECK;

  let caught = 0;
  let missed = 0;
  for (let i = 0; i < symbols.length - 1; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      if (symbols[i] === symbols[j]) continue;
      const swapped =
        symbols.slice(0, i) + symbols[j] + symbols.slice(i + 1, j) + symbols[i] + symbols.slice(j + 1);
      if (checkSymbol(swapped) === check) missed++;
      else caught++;
    }
  }
  const total = caught + missed;
  console.log(
    `  swapped pairs: ${caught} of ${total} caught (${((caught * 100) / total) | 0}%)`,
  );
  // Adjacent swaps are the ones a person actually makes, and they are all caught.
  expect(caught).toBeGreaterThan(0);
  expect(missed * 40).toBeLessThan(total); // fewer than 2.5% slip
});

test("C2: every ADJACENT swap is caught, which is the slip people make", () => {
  const symbols = SYMBOLS;
  const check = CHECK;
  let missed = 0;
  for (let i = 0; i < symbols.length - 1; i++) {
    if (symbols[i] === symbols[i + 1]) continue;
    const swapped = symbols.slice(0, i) + symbols[i + 1] + symbols[i] + symbols.slice(i + 2);
    if (checkSymbol(swapped) === check) missed++;
  }
  expect(missed).toBe(0);
});

// --- C3: the confusable letters ------------------------------------------------------

test("C3: the alphabet has no I, L, O or U to be confused in the first place", () => {
  for (const ch of "ILOU") expect(ALPHABET).not.toContain(ch);
  expect(ALPHABET.length).toBe(32);
});

test("C3: typing I or L for 1, or O for 0, still works", () => {
  expect(symbolValue("I")).toBe(symbolValue("1"));
  expect(symbolValue("l")).toBe(symbolValue("1"));
  expect(symbolValue("O")).toBe(symbolValue("0"));
  expect(symbolValue("o")).toBe(symbolValue("0"));

  const muddled = CODE.replace(/1/g, "I").replace(/0/g, "O");
  expect(decodeCharacter(muddled).build).toEqual(BUILD);
});

test("C3: case does not matter", () => {
  expect(decodeCharacter(CODE.toLowerCase()).build).toEqual(BUILD);
  expect(decodeCharacter(CODE.toUpperCase()).build).toEqual(BUILD);
});

test("C3: spacing and stray dashes are forgiven", () => {
  const noDashes = CODE.replace(/-/g, "");
  // Without any dashes there is no way to tell name from payload, so that is
  // refused -- but extra dashes and surrounding space must not matter.
  expect(() => decodeCharacter(noDashes)).toThrow(ChrError);
  expect(decodeCharacter(`  ${CODE}  `).build).toEqual(BUILD);
  expect(decodeCharacter(CODE.replace(/-/g, "--")).build).toEqual(BUILD);
});

// --- C4: importing twice ---------------------------------------------------------------

test("C4: importing the same code twice gives the same character, not two", () => {
  const a = decodeCharacter(CODE);
  const b = decodeCharacter(CODE);
  expect(a.creature.id).toBe(b.creature.id);
  expect(a.build).toEqual(b.build);
  expect(pixelsToText(a.creature.sprite)).toBe(pixelsToText(b.creature.sprite));
  expect(encodeCharacter(a.name, a.build, a.creature.sprite)).toBe(CODE);
});

// --- C5: rubbish in -------------------------------------------------------------------

test("C5: oversized, truncated and garbage codes are refused without throwing oddly", () => {
  const rubbish = [
    "",
    "   ",
    "hello",
    "HOPPA",
    "HOPPA-BASH",
    "HOPPA-BASH-",
    "HOPPA-BASH-ZZZZZ-K",
    CODE.slice(0, CODE.length - 1),
    CODE.slice(0, 20),
    `${CODE}ZZZZ`,
    CODE.replace("HOPPA", "HOPPO"),
    "HOPPA-BASH-!!!!!-K",
    "Z".repeat(4000),
  ];
  for (const code of rubbish) {
    let threw = false;
    try {
      decodeCharacter(code);
    } catch (err) {
      threw = true;
      expect(err).toBeInstanceOf(ChrError);
      expect((err as Error).message.length).toBeGreaterThan(0);
    }
    if (!threw) {
      // Anything that does decode must still be a usable character.
      expect(decodeCharacter(code).creature.sprite.pixels.length).toBe(256);
    }
  }
});

test("C5: a code from a newer hoppa says so rather than guessing", () => {
  // Flip the version nibble and re-stamp the check symbol.
  const parts = CODE.split("-");
  const symbols = parts.slice(2, -1).join("");
  const bumped = (ALPHABET.indexOf(symbols[0] as string) + 8) % 32;
  const changed = (ALPHABET[bumped] as string) + symbols.slice(1);
  const rebuilt = `HOPPA-BASH-${changed}-${checkSymbol(changed)}`;
  expect(() => decodeCharacter(rebuilt)).toThrow(/newer hoppa/);
  expect(CHR_VERSION).toBe(1);
});

// --- names ------------------------------------------------------------------------------

test("a name is tidied into something typeable, and never empty", () => {
  expect(tidyName("Bash")).toBe("BASH");
  expect(tidyName("  a very long name indeed ")).toBe("AVERYLONGN");
  expect(tidyName("!!!")).toBe("MINE");
  expect(tidyName("")).toBe("MINE");
});

test("the name travels in the readable part, so a chat log shows whose it is", () => {
  expect(CODE.startsWith("HOPPA-BASH-")).toBe(true);
  expect(decodeCharacter(CODE).name).toBe("Bash");
});

test("chunks of five, so it can be read aloud", () => {
  const parts = CODE.split("-");
  const payload = parts.slice(2, -1);
  for (const chunk of payload.slice(0, -1)) expect(chunk.length).toBe(5);
  expect(parts[parts.length - 1]?.length).toBe(1);
});
