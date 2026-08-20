// "Add hoppa to your home screen", asked once, at the only moment it makes
// sense to ask.
//
// This is spec §5b mitigation 2, and it is not a growth tactic. Safari deletes
// localStorage, IndexedDB and service worker registrations after **7 days**
// without a visit -- so a kid who plays on Monday and comes back a fortnight
// later has lost the creature they drew and the game's ability to work offline.
// A web app on the home screen is exempt from that counter and keeps its own.
//
// So the ask is: put this on your home screen and your character survives.

const OFFERED = "hoppa.install.offered.v1";

/** A promise of an install prompt, on the platforms that have one. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

// Chrome fires this early -- often before the page has decided whether to ask
// -- and it is only usable if you called preventDefault on it. So it is caught
// at import time and kept.
let held: InstallPrompt | null = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  held = event as InstallPrompt;
});

/** Already on a home screen: there is nothing to offer. */
export function alreadyInstalled(): boolean {
  const asApp = window.matchMedia("(display-mode: standalone)").matches;
  // iOS predates the standard and still answers only to its own property.
  const onIos = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return asApp || onIos;
}

function offeredBefore(): boolean {
  try {
    return window.localStorage.getItem(OFFERED) !== null;
  } catch {
    // No storage means no memory of asking, and asking twice is a smaller
    // failure than never asking at all.
    return false;
  }
}

function rememberOffered(): void {
  try {
    window.localStorage.setItem(OFFERED, "1");
  } catch {
    // See above.
  }
}

/**
 * Should the offer appear at all?
 *
 * Once, ever, and never when it cannot be acted on.
 *
 * @param earned the moment is right -- a creature has just been made
 */
export function shouldOffer(earned: boolean): boolean {
  if (!earned) return false;
  if (alreadyInstalled()) return false;
  if (offeredBefore()) return false;
  return true;
}

export interface Offer {
  /** What to say. Empty when there is a real install button instead. */
  readonly how: string;
  /** Present only where the browser will actually do it for us. */
  readonly install: (() => Promise<void>) | null;
}

/**
 * How this platform adds a page to a home screen.
 *
 * Two worlds, and no user-agent sniffing to tell them apart -- the browser
 * having handed us a prompt IS the test. Chrome gives one; Safari never has,
 * so on an iPhone the honest answer is to say where the button is.
 */
export function offerFor(): Offer {
  if (held !== null) {
    const prompt = held;
    return {
      how: "",
      install: async () => {
        rememberOffered();
        await prompt.prompt();
        await prompt.userChoice;
        held = null;
      },
    };
  }
  return {
    how: "Tap share, then Add to Home Screen",
    install: null,
  };
}

/** The offer has been made; do not make it again. */
export function noteOffered(): void {
  rememberOffered();
}
