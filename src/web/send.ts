// Getting a link off this phone and into a conversation.
//
// Lifted out of the play page on day 21, when the level editor needed the same
// four steps for its own "send it" button. Copying sixty lines to get a second
// share button is how the two of them drift apart, and the one that drifts is
// always the one nobody tested -- so the chain lives here, once, and both
// pages hand it a URL and the words to say.
//
// Out of the DOM modules for the usual reason as well: the ORDER of the four
// steps is a decision, and a decision you cannot run a test against is a
// decision nobody is checking.

/**
 * Copy without the Clipboard API, for when the Clipboard API says no.
 *
 * `execCommand("copy")` is deprecated and works everywhere, which is a fair
 * description of the web. It needs a real element with a real selection, so
 * this makes one, uses it and throws it away.
 */
export function copyTheOldWay(url: string): boolean {
  const box = document.createElement("textarea");
  box.value = url;
  // Off-screen but not display:none, or there is nothing to select.
  box.style.position = "fixed";
  box.style.top = "-1000px";
  box.setAttribute("readonly", "");
  document.body.appendChild(box);
  try {
    box.select();
    box.setSelectionRange(0, url.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    box.remove();
  }
}

export interface Sending {
  /** The link itself. */
  readonly url: string;
  /** What the share sheet puts above it. */
  readonly text: string;
  /** What to say once it is on the clipboard rather than in a message. */
  readonly copied: string;
  /** Put words on screen. Every path through here ends in one of these. */
  say(words: string, bad?: boolean): void;
}

/**
 * Sending a link, in the order a phone is actually good at.
 *
 * This used to be one `navigator.clipboard.writeText` and a message. When that
 * silently failed -- which it does on iOS more often than the documentation
 * suggests -- two things happened at once, and both were reported: no
 * confirmation appeared, AND the clipboard still held whatever was in it
 * before. Paste that and you land wherever the old link went, which for
 * somebody who had tapped "edit level" earlier is the level editor.
 *
 * So the clipboard is now the second choice, not the first:
 *
 * 1. **The phone's own share sheet.** This is literally what "send it to a
 *    friend" means, and it puts WhatsApp one tap away instead of asking a child
 *    to find the paste menu. Cancelling it is not a failure.
 * 2. **The clipboard**, if there is no share sheet.
 * 3. **execCommand**, deprecated and widely working, if the clipboard refuses.
 * 4. **The link on screen**, to copy by hand, if all of that fails.
 *
 * Every one of those ends with something on screen. Silence was the bug.
 */
export async function sendLink(sending: Sending): Promise<void> {
  const { url, text, say } = sending;

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "hoppa", text, url });
      say("sent");
      return;
    } catch (err) {
      // Changing your mind is not an error, and must not fall through to
      // copying something you decided not to send.
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }

  let copied = false;
  try {
    await navigator.clipboard.writeText(url);
    copied = true;
  } catch {
    copied = copyTheOldWay(url);
  }

  if (copied) {
    say(sending.copied);
    return;
  }
  // Nothing would copy it. The link itself is still a way to send it, as long
  // as it is clearly the thing to copy rather than a wall of characters.
  say(`press and hold this to copy it: ${url}`, true);
}
