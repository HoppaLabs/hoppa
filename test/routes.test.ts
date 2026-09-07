// What the service worker is allowed to answer out of its cache.
//
// WHY THIS FILE EXISTS
//
// The privacy policy was published, correct, at a URL that returned 200 and
// the right bytes to curl -- and showed the game to anybody with a browser.
// The worker's navigation fallback ended in `return "index.html"`, so every
// path it did not recognise was answered with the play page from cache.
//
// Every check that existed was a fetch. A fetch cannot see a service worker,
// so no fetch could ever have caught this. The rule is a pure function now and
// this asks it directly. See adr/0078.

import { expect, test } from "bun:test";
import { pageFor } from "../src/web/routes.ts";
import { LEGAL } from "../tools/legal.ts";

// Pages serves the game from a subdirectory and the dev server from the root.
// A rule that is right in one and wrong in the other is a rule that ships
// broken to exactly the place people use.
const SCOPES = ["/hoppa/", "/"];

test("the game's own pages are answered from the cache", () => {
  for (const scope of SCOPES) {
    expect(pageFor(scope, scope)).toBe("index.html");
    expect(pageFor(scope, `${scope}index.html`)).toBe("index.html");
    expect(pageFor(scope, `${scope}level/`)).toBe("level/index.html");
    expect(pageFor(scope, `${scope}make/`)).toBe("make/index.html");
  }
});

// The whole point of the offline shell: a level lives in the fragment, the
// fragment never reaches a worker, so an unseen level link is the play page.
test("a level link nobody has ever opened is still the play page", () => {
  for (const scope of SCOPES) {
    expect(pageFor(scope, scope)).toBe("index.html");
  }
});

// The regression, stated as a rule rather than as two examples: a legal page
// joins this by existing, the way liveness.test.ts works.
test("the worker does not claim the legal pages", () => {
  for (const scope of SCOPES) {
    for (const doc of LEGAL) {
      expect({ page: doc.dir, claimed: pageFor(scope, `${scope}${doc.dir}`) }).toEqual({
        page: doc.dir,
        claimed: null,
      });
      expect(pageFor(scope, `${scope}${doc.dir}index.html`)).toBe(null);
    }
  }
});

test("anything else under the scope goes to the network, not to the shell", () => {
  for (const scope of SCOPES) {
    for (const path of ["about/", "pippette/", "robots.txt", "level/extra/deep/"]) {
      expect({ path, claimed: pageFor(scope, `${scope}${path}`) }).toEqual({ path, claimed: null });
    }
  }
});
