// The wordmark is drawn on every page that has one.
//
// It was not. `paintLogo(logoCanvas, ...)` on the play page had been pasted
// into the MIDDLE of a doc comment -- the comment above it opened and the one
// below it closed, and the two lines of code in between were text. So the play
// page's logo had never been drawn on any build, and nothing noticed, because
// a comment type-checks perfectly and every test that reads a page reads its
// HTML rather than what its script actually runs.
//
// Reported as "the hoppa logo seems to have disappeared", which was generous.
//
// This reads the source with the comments TAKEN OUT, which is the only way to
// tell code from something that looks exactly like it.

import { expect, test } from "bun:test";

const PAGES = ["play", "make", "level"] as const;

/** The source with every comment removed, so what is left is what runs. */
function code(page: string): string {
  const raw = require("fs").readFileSync(`src/web/${page}/main.ts`, "utf8") as string;
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")   // block comments, doc comments included
    .replace(/^\s*\/\/.*$/gm, "");      // line comments
}

test("every page paints its wordmark, in code rather than in a comment", () => {
  for (const page of PAGES) {
    const live = code(page);
    expect({ page, calls: live.includes("paintLogo(") }).toEqual({ page, calls: true });
    expect({ page, imports: /import \{[^}]*paintLogo/.test(live) })
      .toEqual({ page, imports: true });
  }
});

test("...and the canvas it paints onto is on the page", () => {
  for (const page of PAGES) {
    const html = require("fs").readFileSync(`src/web/${page}/index.html`, "utf8") as string;
    expect({ page, canvas: html.includes('id="logo"') }).toEqual({ page, canvas: true });
    // Sized in the markup as well, so the header is the right height before a
    // single line of script has run. An unsized canvas is 300x150, and the
    // level gets fitted to whatever the header leaves.
    const at = html.indexOf('id="logo"');
    expect({ page, sized: /width="\d+" height="\d+"/.test(html.slice(at, at + 120)) })
      .toEqual({ page, sized: true });
  }
});

test("a comment cannot satisfy either of those", () => {
  // The control. If stripping comments were broken, the test above would pass
  // on the very source that shipped the bug.
  const pretend = `
    /**
     * A doc comment that swallowed the call.
     *
    const logoCanvas = document.getElementById("logo");
    if (logoCanvas !== null) paintLogo(logoCanvas, 2);
     */
  `;
  const stripped = pretend.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  expect(stripped.includes("paintLogo(")).toBe(false);
});
