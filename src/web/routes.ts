// Which cached page answers a navigation -- and, just as important, which
// navigations the game does not own.
//
// WHY THIS IS NOT IN sw.ts
//
// It used to be, and it was wrong, and nothing could see that it was wrong.
// The rule ended `return "index.html"` for anything unrecognised, so the
// service worker answered EVERY navigation under its scope with the play page
// out of cache. The privacy policy published fine, served fine, and was
// unreachable in any browser that had ever loaded the game: the URL returned
// 200 and the bytes of the notice to curl, and the game to a person.
//
// A pure function of (scope, path) is a thing a test can ask questions of
// without a browser, a cache or a worker. That is the whole reason it moved.

/** The three pages the game is made of, keyed by the path after the scope. */
const GAME_PAGES: Record<string, string> = {
  "": "index.html",
  "index.html": "index.html",
  "level/": "level/index.html",
  "level/index.html": "level/index.html",
  "make/": "make/index.html",
  "make/index.html": "make/index.html",
};

/**
 * The shell page that answers a navigation to `urlPath`, or `null` when the
 * game does not own that path and the worker should go to the network.
 *
 * A level link is the empty path: the level lives in the FRAGMENT, which never
 * reaches a worker, so every level anybody will ever send arrives here as the
 * play page and is answered offline. That is the property worth keeping, and
 * it never needed a catch-all to work.
 */
export function pageFor(scopePath: string, urlPath: string): string | null {
  const rest = urlPath.startsWith(scopePath) ? urlPath.slice(scopePath.length) : urlPath;
  return GAME_PAGES[rest] ?? null;
}
