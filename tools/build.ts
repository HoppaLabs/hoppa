// Static build. Bun's bundler, zero config, zero dependencies.
// Output is dist/ -- exactly what gets published to hosting.

import { rm, mkdir } from "node:fs/promises";

const OUT = "dist";

export async function build(): Promise<string[]> {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const result = await Bun.build({
    entrypoints: ["src/web/play/main.ts"],
    outdir: OUT,
    naming: "app.js",
    target: "browser",
    minify: true,
    sourcemap: "linked",
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("bundle failed");
  }

  await Bun.write(`${OUT}/index.html`, await Bun.file("src/web/play/index.html").text());
  // GitHub Pages runs Jekyll over the output unless told not to.
  await Bun.write(`${OUT}/.nojekyll`, "");

  return result.outputs.map((o) => o.path);
}

if (import.meta.main) {
  await build();
  const js = Bun.file(`${OUT}/app.js`);
  const html = Bun.file(`${OUT}/index.html`);
  console.log("  FILE            BYTES");
  console.log(`  dist/index.html ${String(html.size).padStart(6)}`);
  console.log(`  dist/app.js     ${String(js.size).padStart(6)}`);
}
