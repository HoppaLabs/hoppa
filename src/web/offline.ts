// Turning the service worker on, from whichever page you happen to be.
//
// The worker has to sit at the top of the site or its scope will not cover the
// other two pages, and each page knows how far down it is -- so it says so,
// rather than the code guessing from a pathname that differs between Pages
// (/hoppa/) and the dev server (/).

/**
 * Register the worker, and never let it break the page.
 *
 * Service workers are unavailable in a surprising number of real situations a
 * kid will hit: iOS private browsing, a page opened over plain http from
 * another device, an in-app browser with them switched off. None of those are
 * errors a nine-year-old can act on, and the game works perfectly without one
 * -- offline is the only thing they lose. So every failure here is silent.
 *
 * @param root path from this page to the top of the site: "./" or "../"
 */
export function goOffline(root: string): void {
  if (!("serviceWorker" in navigator)) return;
  watchForANewer();
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(`${root}sw.js`, {
        // Ask the network whether the worker itself has changed, rather than
        // trusting an HTTP cache. This one file is how every other file gets
        // updated, so it is the one that must never go stale.
        updateViaCache: "none",
      })
      .then((registration) => {
        // A page open for an hour should still notice a new build.
        void registration.update();
      })
      .catch(() => {
        // See above: not an error worth a word on screen.
      });
  });
}

/**
 * Show today's build on the visit you tap, not the one after it.
 *
 * A cached shell is one build behind by definition: this visit is served from
 * the cache, the new worker installs behind it, and the NEXT visit is new. For
 * a game that is deployed every day and reviewed on a phone, that is a whole
 * review spent looking at yesterday.
 *
 * So: if a new worker takes over while you have not touched the screen yet,
 * reload. You tapped a link and looked at it; swapping underneath is invisible
 * and correct. The moment you touch anything -- a direction, a paint stroke --
 * this stops, because reloading out from under somebody mid-game or mid-drawing
 * is far worse than being one build behind.
 */
function watchForANewer(): void {
  // The first registration on a first-ever visit also changes the controller.
  // Nothing is stale then, so there is nothing to reload for.
  if (navigator.serviceWorker.controller === null) return;

  let touched = false;
  const stop = () => {
    touched = true;
  };
  for (const event of ["pointerdown", "keydown", "touchstart"]) {
    window.addEventListener(event, stop, { once: true, passive: true });
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (touched) return;
    window.location.reload();
  });
}
