import { expect, test } from "bun:test";
import * as fixtures from "../src/core/fixtures.ts";
import { EMBEDDED, renderEmbedModule } from "../tools/embed-levels.ts";

test.each([...EMBEDDED])("the embedded %s matches %s on disk", async (name, path) => {
  const onDisk = await Bun.file(path).text();
  expect((fixtures as Record<string, string>)[name]).toBe(onDisk);
});

test("src/core/fixtures.ts is up to date with the generator", async () => {
  const expected = await renderEmbedModule();
  const actual = await Bun.file("src/core/fixtures.ts").text();
  if (actual !== expected) {
    console.error("run: bun run tools/embed-levels.ts");
  }
  expect(actual).toBe(expected);
});
