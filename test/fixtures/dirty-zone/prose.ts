// The checker must NOT fire on prose or strings. This file is clean.
//
// It mentions Math.random and Date.now and 1.5 in a comment, on purpose.

/*
 * A block comment naming Math.random, Date, parseFloat and 3.14.
 */

export const NOTE = "Math.random and Date.now and 2.5 inside a string literal";

export function fine(v: number): number {
  return Math.imul(v | 0, 3) | 0; // Math.random in a trailing comment
}
