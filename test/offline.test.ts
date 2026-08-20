import { expect, test } from "bun:test";
import { build } from "../tools/build.ts";

// Building three bundles takes a moment; do it once and ask several questions.
const first = await build();
const worker = await Bun.file("dist/sw.js").text();

/** The cache name the worker will use, which is a hash of what it is caching. */
function versionOf(text: string): string {
  const found = text.match(/hoppa-[0-9a-f]{8}/);
  return found === null ? "" : found[0];
}

test("the build ships a service worker", async () => {
  expect(first.some((path) => path.endsWith("sw.js"))).toBe(true);
  // At the top of the site, or its scope will not reach /level/ and /make/.
  expect(await Bun.file("dist/sw.js").exists()).toBe(true);
});

test("everything the game is made of is in the worker's shell", async () => {
  // A file missing from this list is a file that is not there on a plane, and
  // nothing else in the system would notice.
  for (const name of [
    "index.html",
    "app.js",
    "make/index.html",
    "make/make.js",
    "level/index.html",
    "level/level.js",
  ]) {
    expect({ name, listed: worker.includes(`"${name}"`) }).toEqual({ name, listed: true });
    expect({ name, built: await Bun.file(`dist/${name}`).exists() }).toEqual({ name, built: true });
  }
});

test("the sourcemaps are not in it", () => {
  // Half a megabyte of something a child never opens. Caching it would be the
  // difference between an instant install and a visible one on a phone.
  expect(worker.includes(".js.map")).toBe(false);
});

test("the same build makes the same worker, byte for byte", async () => {
  await build();
  expect(await Bun.file("dist/sw.js").text()).toBe(worker);
});

test("a changed page makes a new cache, so nothing stale can survive", async () => {
  const page = "src/web/play/index.html";
  const original = await Bun.file(page).text();
  try {
    await Bun.write(page, original.replace("</body>", "<!-- one more byte --></body>"));
    await build();
    const after = await Bun.file("dist/sw.js").text();
    expect(versionOf(after)).not.toBe(versionOf(worker));
  } finally {
    await Bun.write(page, original);
    await build();
  }
  // ...and putting it back puts the old cache name back, because the name is
  // the content and nothing else.
  expect(versionOf(await Bun.file("dist/sw.js").text())).toBe(versionOf(worker));
});

test("the worker registers relative to the page, not to a hostname", async () => {
  // Pages serves the game from /hoppa/ and the dev server serves it from /.
  // An absolute path would work in exactly one of those.
  const registration = await Bun.file("src/web/offline.ts").text();
  expect(registration.includes("${root}sw.js")).toBe(true);
  expect(worker.includes("self.location.href")).toBe(true);
  expect(worker.includes("self.registration.scope")).toBe(true);
});

test("a failure to register is never a failure to play", async () => {
  const registration = await Bun.file("src/web/offline.ts").text();
  // iOS private browsing, plain http, an in-app browser with workers off: all
  // real, none of them something a nine-year-old can act on, and the game works
  // without one.
  expect(registration.includes('if (!("serviceWorker" in navigator)) return;')).toBe(true);
  expect(registration.includes(".catch(")).toBe(true);
});

test("a new build is not yanked out from under somebody playing", async () => {
  const registration = await Bun.file("src/web/offline.ts").text();
  // Reload only while the screen is untouched. Verified in a browser both ways:
  // tap the link and wait, and today's build appears by itself; start moving
  // first, and the clock keeps running through the update.
  expect(registration.includes("if (touched) return;")).toBe(true);
  for (const event of ["pointerdown", "keydown", "touchstart"]) {
    expect({ event, watched: registration.includes(`"${event}"`) }).toEqual({ event, watched: true });
  }
  // ...and never on a first-ever visit, where taking control is not an update.
  expect(registration.includes("navigator.serviceWorker.controller === null")).toBe(true);
});
