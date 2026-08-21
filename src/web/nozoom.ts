// Keeping the page still under small hands.
//
// Reported from watching children play: they zoom the whole page by accident,
// mid-game, and cannot get back. A game that has drifted off to one side and
// will not come back is over, and a six-year-old does not know the gesture that
// undoes it -- they hand you the phone.
//
// EVERY PAGE ALREADY SAID `maximum-scale=1`, AND IT DOES NOTHING. iOS Safari
// has ignored maximum-scale and user-scalable since iOS 10, on purpose: a site
// must not be able to stop somebody enlarging text they cannot read. That is
// the right default and this is the exception to it -- a canvas game whose
// whole board is sized to fit the screen already, where "bigger" is a thing the
// page offers deliberately rather than something a browser should be doing
// behind it. `touch-action: manipulation` on the body handles double-tap; it
// does nothing about pinch.
//
// What actually stops pinch on iOS is the non-standard gesture events, which is
// why they are here and why they are the only thing here.
//
// The level editor pinches ON PURPOSE -- that is how you draw at a size a
// fingertip can hit -- so it passes its own grid in and keeps it.

/**
 * Stop the BROWSER zooming the page, while leaving any zoom the page does
 * itself alone.
 *
 * `keeps` is the element that handles its own pinch, if there is one. Anything
 * starting inside it is left to it.
 */
export function holdStill(keeps: Element | null = null): void {
  const ours = (target: EventTarget | null): boolean =>
    keeps !== null && target instanceof Node && keeps.contains(target);

  // Safari's pinch. Not in any standard, and the only thing that works.
  for (const name of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(name, (event: Event) => {
      if (ours(event.target)) return;
      event.preventDefault();
    }, { passive: false });
  }

  // Two fingers dragging is a pinch on its way. Blocked everywhere the page is
  // not expecting one -- a single finger is never touched, so scrolling,
  // drawing and every button still work exactly as they did.
  document.addEventListener("touchmove", (event: TouchEvent) => {
    if (event.touches.length < 2) return;
    if (ours(event.target)) return;
    event.preventDefault();
  }, { passive: false });

  // Double-tap, for the browsers that do it anyway. Two taps inside 300ms in
  // the same place is a zoom; two taps that far apart, or that slow, are two
  // taps and are left alone.
  let lastTap = 0;
  let lastX = 0;
  let lastY = 0;
  document.addEventListener("touchend", (event: TouchEvent) => {
    if (ours(event.target)) return;
    const touch = event.changedTouches[0];
    if (touch === undefined) return;
    const now = event.timeStamp;
    const near = Math.abs(touch.clientX - lastX) < 40 && Math.abs(touch.clientY - lastY) < 40;
    if (now - lastTap < 300 && near) event.preventDefault();
    lastTap = now;
    lastX = touch.clientX;
    lastY = touch.clientY;
  }, { passive: false });
}
