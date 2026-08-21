// The whole game, offline.
//
// This is what makes a link work on a plane, in a car, or on the holiday wifi
// that says it is connected and is not. It matters more here than in most web
// apps because of one property of the format: a level lives in the URL
// FRAGMENT, and a fragment is never sent to a server. So a cached shell is not
// "the app minus the levels" -- it is every level anybody will ever send,
// including ones that do not exist yet.
//
// Cache the six files once and hoppa.example/#p/whatever plays with the radio
// off, forever.
//
// Both values below are stamped in by tools/build.ts:
//   SHELL   -- the files this build is made of
//   VERSION -- a hash OF those files' bytes
// so a build that changes nothing produces a byte-identical worker (which the
// deploy check relies on), and a build that changes anything produces a new
// cache name that cannot collide with the old one.

declare const __SHELL__: readonly string[];
declare const __VERSION__: string;

const SHELL = __SHELL__;
const VERSION = __VERSION__;
const CACHE = `hoppa-${VERSION}`;

// The service worker's own globals. Written out rather than pulled from a
// dependency, because there are no dependencies.
declare const self: {
  addEventListener(type: string, listener: (event: never) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  registration: { scope: string };
  location: { href: string };
};

interface InstallEvent {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEvent extends InstallEvent {
  request: Request;
  respondWith(response: Promise<Response> | Response): void;
}

self.addEventListener("install", (event: never) => {
  (event as unknown as InstallEvent).waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Relative to the worker, so this works at /hoppa/ on Pages and at / on
      // the dev server without either one knowing where it is.
      await cache.addAll(SHELL.map((name) => new URL(name, self.location.href).href));
      // Take over now rather than waiting for every tab to close. A page that
      // is already open keeps the code it has loaded -- swapping a file under a
      // running game would be worse than being one version behind for a minute.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event: never) => {
  (event as unknown as InstallEvent).waitUntil(
    (async () => {
      // Exactly one cache survives: this build's. The name is content-derived,
      // so "the old one" is always identifiable without keeping a list.
      for (const name of await caches.keys()) {
        if (name !== CACHE && name.startsWith("hoppa-")) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

/**
 * Which cached page answers a navigation.
 *
 * `/hoppa/level/` is its own page; everything else -- including every level
 * link, because the fragment never reaches here -- is the play page.
 */
function pageFor(url: URL): string {
  const scope = new URL(self.registration.scope);
  const rest = url.pathname.startsWith(scope.pathname)
    ? url.pathname.slice(scope.pathname.length)
    : url.pathname;
  if (rest.startsWith("level/")) return new URL("level/index.html", scope).href;
  if (rest.startsWith("make/")) return new URL("make/index.html", scope).href;
  return new URL("index.html", scope).href;
}

self.addEventListener("fetch", (event: never) => {
  const fetchEvent = event as unknown as FetchEvent;
  const request = fetchEvent.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== new URL(self.registration.scope).origin) return;

  fetchEvent.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      // Cache first, and not as an optimisation: on a plane there is no second
      // chance. A new build arrives as a new worker with a new cache, which is
      // the only way anything in here changes.
      const hit = await cache.match(request, { ignoreSearch: true });
      if (hit !== undefined) return hit;

      // A navigation is a page, and the page it wants is one of three -- the
      // path after the scope says which. This is what makes a level link work
      // offline the first time that particular link is opened.
      if (request.mode === "navigate") {
        const page = await cache.match(pageFor(url));
        if (page !== undefined) return page;
      }

      try {
        const fresh = await fetch(request);
        // Keep what we go out for, if it is ours and it worked.
        //
        // The shell is precached; a lazily-loaded chunk is not, because the
        // one the bot lives in is bigger than the whole rest of the game and
        // most children never tap the button that wants it. Keeping it the
        // first time it IS fetched gives the same offline answer for one
        // download, paid by whoever asked. Chunk names carry a content hash,
        // so a stale one can never be served for new code.
        if (fresh.ok && request.mode !== "navigate" && url.pathname.endsWith(".js")) {
          await cache.put(request, fresh.clone());
        }
        return fresh;
      } catch (err) {
        void err;
        // Offline and not in the cache. A sourcemap or a favicon, most likely.
        // Failing quietly beats an exception the page cannot do anything about.
        return new Response("", { status: 504, statusText: "offline" });
      }
    })(),
  );
});
