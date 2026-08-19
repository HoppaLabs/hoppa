// Static build. Bun's bundler, zero config, zero dependencies.
// Output is dist/ -- exactly what gets published to hosting.

import { rm, mkdir } from "node:fs/promises";

const OUT = "dist";

// Two pages, two bundles. /make is a real directory rather than a route, so it
// works on static hosting with no rewrites -- the same reason the level lives
// in the URL fragment. See docs/adr/0006.
const PAGES = [
  { entry: "src/web/play/main.ts", html: "src/web/play/index.html", dir: "", js: "app.js" },
  { entry: "src/web/make/main.ts", html: "src/web/make/index.html", dir: "make/", js: "make.js" },
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
}
