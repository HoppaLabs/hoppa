// Asking before something cannot be undone.
//
// Shared between the two editors because it is the same moment in both: you
// tapped an example, and there is work on the page that taking it would throw
// away. It used to be a line of text appended under a strip of thumbnails --
// which is to say, under the thing you had just tapped, below the fold on a
// phone, at the bottom of a page two screens long. Reported as easy to miss,
// and it was: the answer to a question you never saw was "nothing happens".
//
// So it goes over the middle of the screen, where a question that stops the
// world belongs.

/** What the overlay needs to know. Everything else it decides. */
export interface Ask {
  readonly question: string;
  /** The button that goes ahead. Says what it DOES, never "yes". */
  readonly confirm: string;
  /** The button that changes nothing. */
  readonly cancel: string;
  readonly onConfirm: () => void;
}

/**
 * Put the question over the middle of the screen and wait.
 *
 * Three ways out and all of them safe by default: the cancel button, the
 * backdrop, and Escape. Only the confirm button goes ahead, and it is never
 * the one under your thumb by accident -- it is second, because the first
 * position is where a tap lands when somebody is still tapping thumbnails.
 */
export function ask(box: HTMLElement, what: Ask): void {
  box.innerHTML = "";

  const shut = (): void => {
    box.innerHTML = "";
    box.hidden = true;
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") shut();
  };

  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");

  const says = document.createElement("p");
  says.textContent = what.question;

  const row = document.createElement("div");
  row.className = "row";

  const no = document.createElement("button");
  no.className = "keep";
  no.textContent = what.cancel;
  no.addEventListener("click", shut);

  const yes = document.createElement("button");
  yes.className = "yes";
  yes.textContent = what.confirm;
  yes.addEventListener("click", () => {
    shut();
    what.onConfirm();
  });

  row.append(no, yes);
  sheet.append(says, row);

  // The backdrop is a way out, not a way through: a tap that lands anywhere
  // but the sheet cancels.
  box.addEventListener("click", (event) => {
    if (event.target === box) shut();
  });
  document.addEventListener("keydown", onKey);

  box.appendChild(sheet);
  box.hidden = false;
  no.focus();
}

/** Say what just happened, in the place the question was. */
export function shutAsk(box: HTMLElement): void {
  box.innerHTML = "";
  box.hidden = true;
}
