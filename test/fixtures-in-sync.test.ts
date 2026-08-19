import { expect, test } from "bun:test";
import { DAY1_LEVEL_TEXT } from "../src/core/fixtures.ts";
import { renderEmbedModule } from "../tools/embed-levels.ts";

test("the embedded level matches levels/day1.lvl on disk", async () => {
  const onDisk = await Bun.file("levels/day1.lvl").text();
  expect(DAY1_LEVEL_TEXT).toBe(onDisk);
});

test("src/core/fixtures.ts is up to date with the generator", async () => {
  const expected = await renderEmbedModule();
  const actual = await Bun.file("src/core/fixtures.ts").text();
  if (actual !== expected) {
    console.error("run: bun run tools/embed-levels.ts");
  }
  expect(actual).toBe(expected);
});
