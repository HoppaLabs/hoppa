// The QR encoder, against numbers from outside this project.
//
// Every QR hoppa ever drew was undecodable. The generator polynomial was built
// with its two coefficient lines the wrong way round, which multiplies by
// (a^i * x + 1) instead of (x + a^i) and produces the polynomial REVERSED. At
// degree 1 both give [1, 1], so it looked right; from degree 2 they diverge.
//
// Nothing caught it because everything that touched the encoder was checked
// against the encoder. It was found by writing the same algorithm a second
// time, in another language, from the specification -- and then checking THAT
// against a published vector before believing either.
//
// So these tests are only worth anything because the numbers come from
// outside. Do not "fix" a failure here by re-running the encoder to get new
// expectations: that is how it passed for eighteen days.

import { expect, test } from "bun:test";
import { encodeQr, errorCorrection, formatBits, versionFor } from "../src/core/qr.ts";

/**
 * The standard worked example: "HELLO WORLD" as version 1, level M.
 *
 * The sixteen data codewords and the ten error-correction codewords they
 * produce are the ones every QR tutorial and the specification's own Annex I
 * carry, which is what makes them usable as an oracle.
 */
const HELLO_DATA = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
const HELLO_ECC = [196, 35, 39, 119, 235, 215, 231, 226, 93, 23];

test("error correction matches the published worked example", () => {
  expect([...errorCorrection(new Uint8Array(HELLO_DATA), 10)]).toEqual(HELLO_ECC);
});

test("the generator polynomial itself, read through a single one byte", () => {
  // Dividing the single codeword 1 by the generator leaves the generator's own
  // trailing coefficients, so this reads the polynomial out directly.
  //
  // Degree 1 is [1, 1] whichever way round the loop builds it, which is
  // precisely why the bug survived: it is the one degree that cannot show it.
  // Degree 2 is the first that can -- [1, 3, 2] against the reversed [2, 3, 1].
  expect([...errorCorrection(new Uint8Array([1]), 1)]).toEqual([1]);
  expect([...errorCorrection(new Uint8Array([1]), 2)]).toEqual([3, 2]);
  expect([...errorCorrection(new Uint8Array([1]), 5)]).toEqual([31, 198, 63, 147, 116]);
});

test("format information matches the specification's table for level M", () => {
  // Table C.1. Fifteen bits, BCH(15,5), masked with 0x5412 -- numbers that
  // exist independently of any implementation.
  const expected = [
    0b101010000010010, 0b101000100100101, 0b101111001111100, 0b101101101001011,
    0b100010111111001, 0b100000011001110, 0b100111110010111, 0b100101010100000,
  ];
  for (let mask = 0; mask < 8; mask++) {
    expect({ mask, bits: formatBits(mask) }).toEqual({ mask, bits: expected[mask] as number });
  }
});

test("a version is chosen big enough to hold the link, and no bigger", () => {
  // Capacities for level M, from the specification's capacity table.
  expect(versionFor(14)).toBe(1);    // 1-M holds 14 bytes
  expect(versionFor(15)).toBe(2);
  expect(versionFor(26)).toBe(2);    // 2-M holds 26
  expect(versionFor(27)).toBe(3);
  expect(versionFor(122)).toBe(7);   // 7-M holds 122
  expect(versionFor(123)).toBe(8);
  expect(versionFor(10_000)).toBe(0); // nothing fits: the caller shows a link instead
});

test("a real share link still encodes, and the grid is well formed", () => {
  const url =
    "https://hoppalabs.github.io/hoppa/#p/first-steps/" +
    "ESIEAAOpJwekOkOkOk4OGiDhog4PpDpDIgQMOkOlBohYjZGiIiKifrLcesBU";
  const code = encodeQr(url);
  expect(code.size).toBe(45);                       // version 7
  expect(code.modules.length).toBe(45 * 45);

  const at = (x: number, y: number) => code.modules[y * code.size + x];
  // Timing patterns: strict alternation between the finders.
  for (let i = 8; i < code.size - 8; i++) {
    expect({ i, row: at(i, 6), col: at(6, i) }).toEqual({ i, row: i % 2 === 0 ? 1 : 0, col: i % 2 === 0 ? 1 : 0 });
  }
  // The dark module, which is always set.
  expect(at(8, code.size - 8)).toBe(1);
});
