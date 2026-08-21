import { expect, test } from "bun:test";

const guard = await Bun.file("src/web/nozoom.ts").text();
const pages: Record<string, string> = {
  play: await Bun.file("src/web/play/main.ts").text(),
  make: await Bun.file("src/web/make/main.ts").text(),
  level: await Bun.file("src/web/level/main.ts").text(),
};
const html: Record<string, string> = {
  play: await Bun.file("src/web/play/index.html").text(),
  make: await Bun.file("src/web/make/index.html").text(),
  level: await Bun.file("src/web/level/index.html").text(),
};

test("every page holds still under a stray pinch", () => {
  // Reported from watching children: they zoom the whole page by accident,
  // mid-game, and cannot get back. A board that has drifted off to one side
  // and will not come back is a finished game, to a player who does not know
  // the gesture that undoes it.
  for (const [name, source] of Object.entries(pages)) {
    expect({ page: name, guarded: source.includes("holdStill(") }).toEqual({
      page: name, guarded: true,
    });
  }
});

test("...by the only thing that actually works on a phone", () => {
  // maximum-scale=1 is on all three pages and does NOTHING: iOS Safari has
  // ignored it since iOS 10 so that nobody can stop you enlarging text you
  // cannot read. Pinch on iOS is the non-standard gesture events, and that is
  // what has to be refused.
  for (const name of ["gesturestart", "gesturechange", "gestureend"]) {
    expect({ event: name, handled: guard.includes(`"${name}"`) }).toEqual({
      event: name, handled: true,
    });
  }
  // preventDefault on a passive listener is ignored silently, which would make
  // all of this look right and do nothing.
  expect(guard).not.toContain("passive: true");
  expect([...guard.matchAll(/\{ passive: false \}/g)]).toHaveLength(3);
});

test("a single finger is never interfered with", () => {
  // Everything this game does -- walking, drawing, tapping a tool -- is one
  // finger. Blocking any of it to stop a pinch would be a cure worse than the
  // disease, so the touch guard only ever looks at two.
  expect(guard).toContain("if (event.touches.length < 2) return;");
});

test("the level editor keeps the pinch it means", () => {
  // "pinch to zoom, or tap bigger" is how you draw at a size a fingertip can
  // hit -- the one place on the site where a pinch is the point.
  expect(pages.level).toContain("holdStill(viewport);");
  expect(pages.play).toContain("holdStill();");
  expect(pages.make).toContain("holdStill();");
  expect(html.level).toContain("pinch to");
});

test("double-tap is still handled by CSS, where it is cheapest", () => {
  // touch-action does double-tap for free and costs nothing at runtime; the
  // listener is only a backstop for browsers that zoom anyway.
  for (const [name, page] of Object.entries(html)) {
    expect({ page: name, manipulation: page.includes("touch-action: manipulation") })
      .toEqual({ page: name, manipulation: true });
  }
});
