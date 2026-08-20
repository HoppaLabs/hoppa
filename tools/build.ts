// Static build. Bun's bundler, zero config, zero dependencies.
// Output is dist/ -- exactly what gets published to hosting.

import { rm, mkdir } from "node:fs/promises";
import { hashBytes, hashHex, hashInit } from "../src/core/hash.ts";

const OUT = "dist";

// What the service worker keeps so the game works with the radio off. Not the
// sourcemaps: half a megabyte a child never looks at.
const SHELL = [
  "index.html",
  "app.js",
  "make/index.html",
  "make/make.js",
  "level/index.html",
  "level/level.js",
];

// Three pages, three bundles. /make and /level are real directories rather than
// routes, so they work on static hosting with no rewrites -- the same reason the
// level lives in the URL fragment. See docs/adr/0006.
const PAGES = [
  { entry: "src/web/play/main.ts", html: "src/web/play/index.html", dir: "", js: "app.js" },
  { entry: "src/web/make/main.ts", html: "src/web/make/index.html", dir: "make/", js: "make.js" },
  { entry: "src/web/level/main.ts", html: "src/web/level/index.html", dir: "level/", js: "level.js" },
];

export async function build(): Promise<string[]> {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const written: string[] = [];

  for (const page of PAGES) {
    if (page.dir !== "") await mkdir(`${OUT}/${page.dir}`, { recursive: true });

    const result = await Bun.build({
      entrypoints: [page.entry],
      outdir: `${OUT}/${page.dir}`,
      naming: page.js,
      target: "browser",
      minify: true,
      sourcemap: "linked",
    });

    if (!result.success) {
      for (const log of result.logs) console.error(log);
      throw new Error(`bundle failed: ${page.entry}`);
    }

    await Bun.write(`${OUT}/${page.dir}index.html`, await Bun.file(page.html).text());
    written.push(...result.outputs.map((o) => o.path));
  }

  // The worker is built last, because its version is a hash OF everything
  // above. Same inputs, same worker, byte for byte -- which is what lets the
  // deploy check compare bytes instead of grepping for strings. Change one
  // pixel of one page and the cache name changes with it, so a stale build
  // cannot survive as a cache nobody thought to delete.
  let stamp = hashInit();
  for (const name of SHELL) {
    stamp = hashBytes(stamp, new Uint8Array(await Bun.file(`${OUT}/${name}`).arrayBuffer()));
  }

  const worker = await Bun.build({
    entrypoints: ["src/web/sw.ts"],
    outdir: OUT,
    naming: "sw.js",
    target: "browser",
    minify: true,
    define: {
      __SHELL__: JSON.stringify(SHELL),
      __VERSION__: JSON.stringify(hashHex(stamp)),
    },
  });

  if (!worker.success) {
    for (const log of worker.logs) console.error(log);
    throw new Error("bundle failed: src/web/sw.ts");
  }
  written.push(...worker.outputs.map((o) => o.path));

  // GitHub Pages runs Jekyll over the output unless told not to.
  await Bun.write(`${OUT}/.nojekyll`, "");

  return written;
}

if (import.meta.main) {
  await build();
  console.log("  FILE                 BYTES");
  for (const page of PAGES) {
    for (const name of ["index.html", page.js]) {
      const file = Bun.file(`${OUT}/${page.dir}${name}`);
      console.log(`  dist/${`${page.dir}${name}`.padEnd(15)} ${String(file.size).padStart(6)}`);
    }
  }
  console.log(`  dist/${"sw.js".padEnd(15)} ${String(Bun.file(`${OUT}/sw.js`).size).padStart(6)}`);
}
