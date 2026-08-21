import { expect, test } from "bun:test";

const guard = await Bun.file("src/web/nozoom.ts").text();
const pages: Record<string, string> = {
  play: await Bun.file("src/web/play/main.ts").text(),
  make: await Bun.file("src/web/make/main.ts").text(),
  level: await Bun.file("src/web/level/main.ts").text(),
};
const html = {
  play: await Bun.file("src/web/play/index.html").text(),
  make: await Bun.file("src/web/make/index.html").text(),
  level: await Bun.file("src/web/level/index.html").text(),
} as const;

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
  expect([...guard.matchAll(/\{ passive: false \}/g)]).toHaveLength(4);
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

test("the pages a child plays and draws on hand NO gesture to the browser", () => {
  // This asserted `touch-action: manipulation` on every page, and that was the
  // bug rather than the rule.
  //
  //   manipulation   turns off double-tap. LEAVES PINCH ALONE.
  //   none           the page handles its own touches
  //
  // Reported as "the zooming problem has got pretty bad since we introduced
  // the dpad, as the user is dragging their finger more and tapping the action
  // button" -- both of those are gestures the browser recognises, and the pad
  // turned the pinch from something that happened occasionally into something
  // that happens all game.
  //
  // Everything else here -- the gesture events, the two-finger touchmove, the
  // double-tap timer -- was already in place and still it zoomed, because this
  // one value acts BEFORE any script runs.
  for (const name of ["play", "make"] as const) {
    expect({ page: name, none: html[name].includes("touch-action: none;") })
      .toEqual({ page: name, none: true });
    expect({ page: name, weak: /^\s*touch-action: manipulation;/m.test(html[name]) })
      .toEqual({ page: name, weak: false });
  }
  // The level editor has a size control of its own and holdStill() is told to
  // leave its viewport alone, so it is deliberately not locked down the same
  // way. Written here so that making them all match is a decision somebody
  // takes on purpose rather than a tidy-up.
  expect(html.level).toContain("touch-action: manipulation;");
});

test("every surface a thumb lands on says it for itself", () => {
  // touch-action is NOT inherited. Two were left reading `auto` while
  // everything around them was locked down, and they are exactly the two a
  // stray tap finds: #keys is the GAP between the round buttons, and #grid is
  // the whole board.
  expect(html.play).toContain("#keys, #grid, canvas { touch-action: none; }");
  for (const surface of ["#pad {", "#dpad {"]) {
    const at = html.play.indexOf(surface);
    expect({ surface, found: at > -1 }).toEqual({ surface, found: true });
    expect(html.play.slice(at, at + 400)).toContain("touch-action: none");
  }
});

test("what genuinely scrolls gets its drag back, and only its drag", () => {
  // The panel after a win is taller than a short phone. pan-y is the drag and
  // nothing else: no pinch, no double-tap.
  expect(html.play).toContain("#over * { touch-action: pan-y; }");
});

// --- and nothing gets long-pressed either --------------------------------------
//
// Reported live: "sometimes holding the button down brings up the iOS Safari
// text selection control". Holding a direction is how you walk, so this fired
// constantly, over the game, mid-run.
//
// `-webkit-user-select: none` was already on all three pages and does not stop
// it. Neither does preventDefault on pointerdown: on iOS the pointer events are
// synthesised from touch, and cancelling the synthetic one cancels nothing
// underneath. `-webkit-touch-callout` is the property that governs the
// long-press menu, and it was on no page at all.

test("holding a button down does not offer to select it", () => {
  for (const [name, page] of Object.entries(html)) {
    expect({ page: name, callout: page.includes("-webkit-touch-callout: none") })
      .toEqual({ page: name, callout: true });
  }
  // Belt and braces for the browsers that start a selection without a callout.
  expect(guard).toContain('"contextmenu"');
  expect(guard).toContain('"selectstart"');
});

test("...but you can still type your name", () => {
  // A name field you cannot put a caret into is worse than a menu you did not
  // want, so the block is lifted everywhere typing happens.
  for (const [name, page] of Object.entries(html)) {
    expect({ page: name, typable: page.includes("-webkit-touch-callout: default") })
      .toEqual({ page: name, typable: true });
  }
  expect(guard).toContain('target.closest("input, textarea")');
});
