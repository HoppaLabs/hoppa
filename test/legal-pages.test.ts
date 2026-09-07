// The privacy policy and the terms must be published, readable, and finished.
//
// WHY THIS FILE EXISTS
//
// Both documents existed, correct and committed, for weeks -- at a URL that
// returned 404 the whole time. Nothing was broken: `pippette/` simply is not
// `dist/`, and only `dist/` is uploaded. No test could fail, because no test
// asked whether the thing that had been written was the thing that shipped.
//
// So this asks. It is the "nobody asserts the obvious" pattern from CLAUDE.md
// applied to the one page in the repo with a legal consequence.

import { expect, test } from "bun:test";
import { frontmatterTitle, isDraft, placeholders, renderMarkdown } from "../tools/markdown.ts";
import { LEGAL, renderLegal } from "../tools/legal.ts";

test("every legal document renders to a finished page", async () => {
  for (const doc of LEGAL) {
    const source = await Bun.file(doc.md).text();
    const { title, html } = renderLegal(doc.md, source);

    expect(title.length).toBeGreaterThan(0);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    // The frontmatter is Jekyll's, and Jekyll never runs: dist/ carries a
    // .nojekyll. If it reaches the page it reaches the reader as text.
    expect(html).not.toContain("layout: default");
    expect(html).not.toContain("---\n");
    // Markdown that survived as Markdown is Markdown the reader has to parse.
    expect(html).not.toMatch(/^#{1,3} /m);
    expect(html).not.toContain("**");
  }
});

// The check with teeth. A published policy naming [COMPANY NAME] is not a
// draft of a notice, it is not a notice -- and it is an App Store rejection.
test("a document with an unfilled placeholder refuses to build", () => {
  const draft = `---\ntitle: Privacy Policy\n---\n\n# Privacy Policy\n\n[COMPANY NAME] is the controller.\n`;
  expect(() => renderLegal("fixture.md", draft)).toThrow(/unfilled placeholder/);
  expect(placeholders(draft)).toEqual(["[COMPANY NAME]"]);
});

test("link syntax is not mistaken for a placeholder", () => {
  expect(placeholders("[ico.org.uk](https://ico.org.uk) and [Apple's policy](https://apple.com)")).toEqual([]);
  expect(placeholders("under [13/16] and [REGION]")).toEqual(["[13/16]", "[REGION]"]);
});

test("the shapes those documents actually use", () => {
  const html = renderMarkdown(
    [
      "---",
      "title: T",
      "---",
      "",
      "# Heading",
      "",
      "A paragraph that is hard-wrapped",
      "across two lines.",
      "",
      "- a bullet, itself wrapped",
      "  onto a second line",
      "- **bold** and a [link](https://example.com)",
      "",
      "| Data | Kept for |",
      "| --- | --- |",
      "| Support messages | 2 years |",
    ].join("\n"),
  );

  expect(html).toContain("<h1>Heading</h1>");
  // Wrapped lines are one sentence, not two lines.
  expect(html).toContain("<p>A paragraph that is hard-wrapped across two lines.</p>");
  expect(html).toContain("<li>a bullet, itself wrapped onto a second line</li>");
  expect(html).toContain("<strong>bold</strong>");
  expect(html).toContain('<a href="https://example.com">link</a>');
  expect(html).toContain("<th>Data</th>");
  expect(html).toContain("<td>2 years</td>");
  // The table, not the page, is what scrolls sideways on a phone.
  expect(html).toContain('<div class="scroll">');
});

test("prose is escaped, and a hostile link is refused", () => {
  expect(renderMarkdown("5 < 6 & rising")).toBe("<p>5 &lt; 6 &amp; rising</p>");
  expect(() => renderMarkdown("[tap](javascript:alert(1))")).toThrow(/unsupported link target/);
});

test("frontmatter titles the page", () => {
  expect(frontmatterTitle("---\nlayout: default\ntitle: Terms of Service\n---\n\n# T\n")).toBe(
    "Terms of Service",
  );
  expect(frontmatterTitle("# No frontmatter\n")).toBe(null);
});

// A draft is allowed to publish -- it is the only way to test the URL -- but it
// is not allowed to look finished, and it is not allowed into a search index.
test("a draft announces itself and stays out of search", async () => {
  for (const doc of LEGAL) {
    const source = await Bun.file(doc.md).text();
    const { draft, html } = renderLegal(doc.md, source);
    if (!draft) continue;
    expect(html).toContain("DRAFT");
    expect(html).toContain("must not be submitted");
    expect(html).toContain('content="noindex, nofollow"');
    // Above the first heading, where it cannot be scrolled past.
    expect(html.indexOf("DRAFT")).toBeLessThan(html.indexOf("<h1>"));
  }
});

test("status: draft is read from the frontmatter, and absent means final", () => {
  expect(isDraft("---\ntitle: T\nstatus: draft\n---\n\n# T\n")).toBe(true);
  expect(isDraft("---\ntitle: T\n---\n\n# T\n")).toBe(false);
  expect(isDraft("# No frontmatter\n")).toBe(false);
});

// The banner is the whole safeguard for a test build, so the finished page must
// lose it completely -- not hide it with CSS.
test("a finished document carries no draft banner", () => {
  const final = "---\ntitle: Privacy Policy\n---\n\n# Privacy Policy\n\nReal Ltd is the controller.\n";
  const { draft, html } = renderLegal("final.md", final);
  expect(draft).toBe(false);
  expect(html).not.toContain("DRAFT");
  expect(html).toContain('content="index"');
});

// The contact block is a postal address. Run onto one line it reads as a typo,
// and the two trailing spaces that keep it apart are invisible -- so assert the
// rendered result, not the source. An editor that strips them fails here.
test("the contact block keeps its line breaks", async () => {
  for (const doc of LEGAL) {
    const { html } = renderLegal(doc.md, await Bun.file(doc.md).text());
    const contact = html.slice(html.lastIndexOf("<p>"));
    expect(contact.match(/<br>/g)?.length).toBe(2);
  }
});

test("two trailing spaces are a line break, one is not", () => {
  expect(renderMarkdown("Line one  \nline two")).toBe("<p>Line one<br>\nline two</p>");
  expect(renderMarkdown("Line one\nline two")).toBe("<p>Line one line two</p>");
});
