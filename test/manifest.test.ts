import { expect, test } from "bun:test";
import { build } from "../tools/build.ts";

await build();
const manifest = JSON.parse(await Bun.file("dist/manifest.webmanifest").text()) as Record<
  string,
  unknown
>;
const worker = await Bun.file("dist/sw.js").text();

test("the manifest says what a phone needs to keep the game on a home screen", () => {
  expect(manifest.name).toBe("hoppa");
  // Launched as an app, not as a tab -- which is what exempts it from the
  // 7-day eviction that takes a drawn character with it (spec §5b).
  expect(manifest.display).toBe("standalone");
  // Relative to the manifest, so the game works at /hoppa/ on Pages and at /
  // on the dev server without being told where it is.
  expect(manifest.start_url).toBe("./");
  expect(manifest.scope).toBe("./");
  expect(manifest.background_color).toBe("#0d1014");
});

test("the icons it names are icons that exist, at the sizes it claims", async () => {
  const icons = manifest.icons as { src: string; sizes: string }[];
  expect(icons.length).toBeGreaterThan(0);
  for (const icon of icons) {
    const file = Bun.file(`dist/${icon.src}`);
    expect({ src: icon.src, there: await file.exists() }).toEqual({ src: icon.src, there: true });

    // Read the size out of the PNG header rather than trusting the manifest.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const width = (bytes[18] as number) * 256 + (bytes[19] as number);
    const height = (bytes[22] as number) * 256 + (bytes[23] as number);
    expect({ src: icon.src, size: `${width}x${height}` }).toEqual({
      src: icon.src,
      size: icon.sizes,
    });
  }
});

test("iOS is asked in the only way iOS listens", async () => {
  // Safari has never had an install prompt and does not read `icons` for the
  // home screen icon. It reads a link tag, and it wants 180.
  const bytes = new Uint8Array(await Bun.file("dist/icon-180.png").arrayBuffer());
  expect((bytes[18] as number) * 256 + (bytes[19] as number)).toBe(180);

  for (const [page, root] of [
    ["dist/index.html", "./"],
    ["dist/make/index.html", "../"],
    ["dist/level/index.html", "../"],
  ] as const) {
    const html = await Bun.file(page).text();
    expect({ page, icon: html.includes(`rel="apple-touch-icon" href="${root}icon-180.png"`) })
      .toEqual({ page, icon: true });
    expect({ page, manifest: html.includes(`rel="manifest" href="${root}manifest.webmanifest"`) })
      .toEqual({ page, manifest: true });
  }
});

test("the home screen copy is kept offline too, or it works once and never again", () => {
  // A phone that installs the game and then loses signal must still have the
  // icon and the manifest it was installed with.
  for (const name of ["manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"]) {
    expect({ name, cached: worker.includes(`"${name}"`) }).toEqual({ name, cached: true });
  }
});
