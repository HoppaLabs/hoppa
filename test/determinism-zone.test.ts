import { expect, test } from "bun:test";
import { RULES, ZONE_DIRS, scanZone } from "../tools/check-determinism.ts";

test("the real determinism zone is clean", async () => {
  const violations = await scanZone();
  if (violations.length > 0) {
    for (const v of violations) console.error(`${v.file}:${v.line}  ${v.rule}  ${v.text}`);
  }
  expect(violations.map((v) => `${v.file}:${v.line} ${v.rule}`)).toEqual([]);
});

test("the zone is the two directories the spec names", () => {
  expect([...ZONE_DIRS]).toEqual(["src/core", "src/engines"]);
});

test("the check actually catches violations", async () => {
  const violations = await scanZone(["test/fixtures/dirty-zone"]);
  const fired = new Set(violations.map((v) => v.rule));

  // Print the table -- this is the legible bit when reviewing over SSH.
  console.log("\nplanted violations the checker caught:");
  console.log("  RULE                      LINE  SOURCE");
  for (const v of violations.filter((x) => x.file.endsWith("bad.ts"))) {
    console.log(`  ${v.rule.padEnd(24)}  ${String(v.line).padStart(4)}  ${v.text}`);
  }

  for (const id of ["no-math-random", "no-date", "no-float-literal", "no-parse-float", "no-object-key-iteration"]) {
    expect(fired.has(id)).toBe(true);
  }
});

test("the check does not fire on comments or string literals", async () => {
  const violations = await scanZone(["test/fixtures/dirty-zone"]);
  const inProse = violations.filter((v) => v.file.endsWith("prose.ts"));
  expect(inProse).toEqual([]);
});

test("every rule carries a reason", () => {
  for (const rule of RULES) {
    expect(rule.why.length).toBeGreaterThan(10);
  }
});
