// The legal pages: privacy and terms, for the Pippette app.
//
// These are NOT part of the game. They are here because the App Store asks
// for a privacy policy at a public URL and this repo already owns one, and
// they had sat in `pippette/` unpublished since the day they were written --
// the directory is not `dist/`, and only `dist/` is uploaded. See adr/0077.

import { frontmatterTitle, isDraft, placeholders, renderMarkdown } from "./markdown.ts";

/** Source Markdown -> published directory. `.md` is not a URL a reader can use. */
export const LEGAL = [
  { md: "pippette/privacy.md", dir: "pippette/privacy/" },
  { md: "pippette/terms.md", dir: "pippette/terms/" },
];

// Shown at the top of a `status: draft` page. Deliberately not dismissible and
// deliberately above the first heading: the failure this guards against is
// somebody pasting the URL into App Store Connect without scrolling.
const DRAFT_BANNER = `<p class="draft"><b>DRAFT — not the published notice.</b>
The company name, contact address and region below are <b>test values</b>,
typed so the links and layout can be checked. Nothing on this page is a
statement about how data is handled, and it must not be submitted to the App
Store or relied on until it is filled in.</p>
`;

/**
 * A whole page, self-contained: no stylesheet fetch, no font fetch, no script.
 *
 * Serif and 17px rather than the game's 13px monospace. This is the one thing
 * in the repo an adult reads end to end, on a phone, and the game's face is
 * for six words on a button.
 */
export function legalPage(title: string, body: string, draft = false): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0d1014">
<meta name="robots" content="${draft ? "noindex, nofollow" : "index"}">
<link rel="icon" type="image/png" href="../../icon-32.png">
<title>${title} - Pippette</title>
<style>
  :root {
    --bg: #0d1014;
    --ink: #b3bdcb;
    --ink-bright: #e6ecf3;
    --edge: #1a212b;
    --gold: #ffc23d;
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0 auto; max-width: 40rem;
    padding: 2rem 1.1rem max(3rem, env(safe-area-inset-bottom));
    background: var(--bg); color: var(--ink);
    font: 17px/1.65 ui-serif, Georgia, "Times New Roman", serif;
  }
  h1, h2, h3 { color: var(--ink-bright); line-height: 1.25; font-weight: 600; }
  h1 { font-size: 1.9rem; margin: 0 0 1.5rem; }
  h2 { font-size: 1.3rem; margin: 2.4rem 0 .7rem; padding-top: 1.2rem; border-top: 1px solid var(--edge); }
  h3 { font-size: 1.05rem; margin: 1.6rem 0 .5rem; }
  p, li { margin: 0 0 .9rem; }
  ul { padding-left: 1.3rem; }
  strong { color: var(--ink-bright); font-weight: 600; }
  a { color: var(--gold); }
  /* The retention table is wider than a phone. THIS scrolls, so the page does
     not -- a document that slides sideways under the thumb reads as broken. */
  .scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 0 1.2rem; }
  table { border-collapse: collapse; min-width: 100%; font-size: .95rem; }
  th, td { border: 1px solid var(--edge); padding: .5rem .7rem; text-align: left; vertical-align: top; }
  th { color: var(--ink-bright); }
  /* A draft says so before the first clause, not in a footer nobody reaches. */
  .draft {
    border: 1px solid var(--gold); border-left-width: .35rem;
    padding: .9rem 1rem; margin: 0 0 2rem;
    color: var(--ink-bright); font-size: .95rem; line-height: 1.5;
  }
  .draft b { color: var(--gold); }
</style>
</head>
<body>
${draft ? DRAFT_BANNER : ""}${body}
</body>
</html>
`;
}

/**
 * Render one document, or throw.
 *
 * The placeholder check is the point of this function. A privacy policy that
 * says "[COMPANY NAME] ([ADDRESS]) is the controller" is not a weaker version
 * of a privacy policy -- as a notice it is void, and as an App Store review
 * URL it is a rejection. Publishing one is worse than the 404 it replaces, so
 * the build fails instead.
 */
export function renderLegal(
  md: string,
  source: string,
): { title: string; draft: boolean; html: string } {
  const holes = placeholders(source);
  if (holes.length) {
    const seen = [...new Set(holes)].join(", ");
    throw new Error(
      `${md} still has ${holes.length} unfilled placeholder(s): ${seen}\n` +
        `  A legal page ships filled in or it does not ship. Fill them and rebuild.`,
    );
  }
  const title = frontmatterTitle(source);
  if (!title) throw new Error(`${md} has no 'title:' in its frontmatter`);
  const draft = isDraft(source);
  return { title, draft, html: legalPage(title, renderMarkdown(source), draft) };
}
