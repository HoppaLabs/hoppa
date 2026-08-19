// Fixture for the determinism checker. Every line here is a deliberate violation.
// It is NOT in src/core or src/engines, so the real check never scans it.

export function rolls(): number {
  return Math.random();
}

export function stamped(): number {
  return Date.now();
}

export function scaled(v: number): number {
  return v * 1.5;
}

export function widthOf(text: string): number {
  return parseFloat(text);
}

export function ordered(bag: Record<string, number>): string[] {
  return Object.keys(bag);
}
