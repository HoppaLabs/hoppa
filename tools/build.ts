// Static build. Bun's bundler, zero config, zero dependencies.
// Output is dist/ -- exactly what gets published to hosting.

import { rm, mkdir } from "node:fs/promises";
import { hashBytes, hashHex, hashInit } from "../src/core/hash.ts";
import { iconPng } from "./icon.ts";

const OUT = "dist";

// What the service worker keeps so the game works with the radio off. Not the
// sourcemaps: half a megabyte a child never looks at.
const SHELL_FIXED = [
  "index.html",
  "app.js",
  "make/index.html",
  "make/make.js",
  "level/index.html",
  "level/level.js",
  "manifest.webmanifest",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
];

// What a phone needs to keep the game on a home screen, which is the one place
// it is safe from the 7-day eviction. See docs/adr/0024.
//
// 180 is what iOS asks for by name; 192 and 512 are what a manifest is expected
// to offer. No "maskable" entry: the creature fills three quarters of the
// square, and Android's maskable safe zone would crop its legs off.
const MANIFEST = {
  name: "hoppa",
  short_name: "hoppa",
  description: "Draw a creature, paint a level, send it to a friend.",
  start_url: "./",
  scope: "./",
  display: "standalone",
  background_color: "#0d1014",
  theme_color: "#0d1014",
  icons: [
    { src: "icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png" },
  ],
};

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
  const chunks: string[] = [];

  for (const page of PAGES) {
    if (page.dir !== "") await mkdir(`${OUT}/${page.dir}`, { recursive: true });

    const result = await Bun.build({
      entrypoints: [page.entry],
      outdir: `${OUT}/${page.dir}`,
      naming: { entry: page.js, chunk: "[name]-[hash].js", asset: "[name]-[hash].[ext]" },
      target: "browser",
      minify: true,
      sourcemap: "linked",
      // Code splitting, for ONE reason: the level editor loads the bot on tap.
      // The bot drives the real engines and there are eleven builds of them --
      // bundled in, that page goes from 54 kilobytes to 171, on a game a child
      // downloads over mobile data. Behind an import() it is a chunk of its
      // own, fetched by the people who ask for it and cached by the worker.
      splitting: true,
    });

    if (!result.success) {
      for (const log of result.logs) console.error(log);
      throw new Error(`bundle failed: ${page.entry}`);
    }

    await Bun.write(`${OUT}/${page.dir}index.html`, await Bun.file(page.html).text());
    written.push(...result.outputs.map((o) => o.path));
    // Chunks that every visit needs go in the shell. The one the bot lives in
    // does NOT: it is bigger than the rest of the game put together, and
    // posting it to every phone to serve the few who tap "watch it played"
    // is the wrong way round. The worker keeps it once it has been fetched --
    // see the runtime cache in src/web/sw.ts -- so it costs one download,
    // paid by the person who asked for it.
    for (const out of result.outputs) {
      const name = `${page.dir}${out.path.slice(out.path.lastIndexOf("/") + 1)}`;
      if (out.kind !== "chunk" || SHELL_FIXED.includes(name)) continue;
      if (name.includes("/bot-")) continue;
      chunks.push(name);
    }
  }

  // Drawn from the real sprite and the real palette, so the icon on a home
  // screen cannot drift away from what the game looks like.
  for (const side of [180, 192, 512]) {
    await Bun.write(`${OUT}/icon-${side}.png`, iconPng(side));
  }
  await Bun.write(`${OUT}/manifest.webmanifest`, `${JSON.stringify(MANIFEST, null, 2)}\n`);

  // The worker is built last, because its version is a hash OF everything
  // above. Same inputs, same worker, byte for byte -- which is what lets the
  // deploy check compare bytes instead of grepping for strings. Change one
  // pixel of one page and the cache name changes with it, so a stale build
  // cannot survive as a cache nobody thought to delete.
  // Sorted, so the same inputs give the same worker byte for byte however the
  // bundler happened to order its outputs.
  const SHELL = [...SHELL_FIXED, ...chunks.sort()];

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
