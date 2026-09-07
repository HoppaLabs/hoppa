// The BUILT service worker, asked what it answers a navigation with.
//
// WHY THIS FILE EXISTS
//
// test/routes.test.ts asks the rule; this asks the artefact. The bug it exists
// for -- a catch-all that served the play page for /pippette/privacy/ -- lived
// in dist/sw.js, and every check the project had was a fetch. curl does not run
// a service worker, so curl saw the privacy policy and a person saw the game,
// and both were the truth about different things.
//
// So this loads the real bundled worker, gives it a fake cache and a fake
// network, dispatches a real navigation at it, and reports which one answered.
// No browser involved. See adr/0078.

import { expect, test } from "bun:test";
import { build } from "../tools/build.ts";
import { LEGAL } from "../tools/legal.ts";

await build();
const code = await Bun.file("dist/sw.js").text();

const SCOPE = "https://hoppalabs.github.io/hoppa/";

/**
 * Run the built worker with everything it touches faked, and return what it
 * gives back for a navigation to `path`.
 *
 * The cache holds the shell, exactly as it would after an install. The network
 * returns a marker, so "came from the cache" and "went to the network" are
 * distinguishable in the answer rather than inferred.
 */
async function navigateTo(path: string): Promise<string> {
  const listeners: Record<string, (event: unknown) => void> = {};

  const cached = new Map<string, string>([
    [`${SCOPE}index.html`, "PLAY PAGE"],
    [`${SCOPE}make/index.html`, "MAKE PAGE"],
    [`${SCOPE}level/index.html`, "LEVEL PAGE"],
  ]);

  const cache = {
    match: async (req: { url: string } | string) => {
      const href = typeof req === "string" ? req : req.url;
      const body = cached.get(href);
      return body === undefined ? undefined : new Response(body);
    },
    addAll: async () => {},
    put: async () => {},
  };

  const fakeSelf = {
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners[type] = listener;
    },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    registration: { scope: SCOPE },
    location: { href: `${SCOPE}sw.js` },
  };

  const fakeCaches = { open: async () => cache, keys: async () => [], delete: async () => {} };
  const fakeFetch = async () => new Response("FROM THE NETWORK");

  new Function("self", "caches", "fetch", code)(fakeSelf, fakeCaches, fakeFetch);

  let answer: Promise<Response> | Response | undefined;
  listeners.fetch!({
    // A plain object, not a Request: `mode` is readonly on the real thing,
    // and these three properties are all the worker reads.
    request: { url: `${SCOPE}${path}`, method: "GET", mode: "navigate" },
    respondWith: (r: Promise<Response> | Response) => {
      answer = r;
    },
    waitUntil: () => {},
  });

  return await (await answer!).text();
}

test("the game's own pages still come out of the cache", async () => {
  expect(await navigateTo("")).toBe("PLAY PAGE");
  expect(await navigateTo("make/")).toBe("MAKE PAGE");
  expect(await navigateTo("level/")).toBe("LEVEL PAGE");
});

// The regression, against the shipped bytes. Before the fix every one of these
// returned "PLAY PAGE" -- which is precisely what a person saw at a URL that
// served the right document to curl.
test("a legal page is not answered with the game", async () => {
  for (const doc of LEGAL) {
    expect({ page: doc.dir, got: await navigateTo(doc.dir) }).toEqual({
      page: doc.dir,
      got: "FROM THE NETWORK",
    });
  }
});
