// Markdown -> HTML for the legal pages, and nothing else.
//
// WHY THIS EXISTS RATHER THAN A DEPENDENCY
//
// Hard rule 2: zero runtime dependencies, and nothing from node_modules
// reaches dist/. A Markdown library would be a build-time dependency whose
// output ships, which is the same thing wearing a hat. This handles the
// subset those two documents actually use -- headings, bold, links, bullet
// lists, one table -- and THROWS on anything else rather than passing it
// through as text. A silently half-rendered privacy policy is the failure
// mode worth spending code to avoid.
//
// Not a general Markdown renderer. Do not point it at README.md.

/** `[COMPANY NAME]`, `[DATE]`, `[13/16]` -- an unfilled template slot. */
const PLACEHOLDER = /\[[A-Z0-9][A-Z0-9 /]*\]/g;

/**
 * Every unfilled placeholder in `md`, in order, with duplicates kept.
 *
 * Lowercase brackets are link syntax and are left alone: `[ico.org.uk](...)`
 * is a link, `[REGION]` is a hole where a fact should be.
 */
export function placeholders(md: string): string[] {
  return [...md.matchAll(PLACEHOLDER)].map((m) => m[0]);
}

/** One key out of the YAML frontmatter. Not a YAML parser; two keys are read. */
function frontmatter(md: string, key: string): string | null {
  const block = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(md);
  if (!block) return null;
  const found = new RegExp(`^${key}:[ \\t]*(.+?)[ \\t]*$`, "m").exec(block[1]!);
  return found ? found[1]! : null;
}

/** The `title:` from the YAML frontmatter, if it has any. */
export function frontmatterTitle(md: string): string | null {
  return frontmatter(md, "title");
}

/**
 * True when the document carries `status: draft`.
 *
 * A draft has its real shape and fake facts -- a name, an address and a
 * contact that are typed to make the links clickable, not to be relied on.
 * It publishes, because that is the only way to test the URL, but it says so
 * on its face and it stays out of search. See adr/0077.
 */
export function isDraft(md: string): boolean {
  return frontmatter(md, "status") === "draft";
}

function stripFrontmatter(md: string): string {
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Escape FIRST, then mark up. The other order lets a `<` in the prose eat the
// tags this function just wrote.
function inline(text: string): string {
  let html = escape(text);
  // Links before bold: a link's text may be bold, but a bold run may not
  // contain a link in these documents, and doing it the other way round
  // leaves `**` inside an href.
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    // Only http(s) and mailto reach a page a child's parent might open. A
    // `javascript:` href in a legal document would mean somebody edited the
    // Markdown to attack the reader, so refuse rather than sanitise.
    if (!/^(https?:\/\/|mailto:)/.test(href)) throw new Error(`unsupported link target: ${href}`);
    return `<a href="${href}">${label}</a>`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  if (html.includes("**")) throw new Error(`unclosed bold run: ${text}`);
  return html;
}

const HEADING = /^(#{1,3}) +(.+)$/;
const BULLET = /^- +(.+)$/;
const TABLE_ROW = /^\|(.+)\|$/;
const TABLE_RULE = /^\|[ :|-]+\|$/;

function cells(row: string): string[] {
  return row
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

/**
 * Render the body of a legal document.
 *
 * Wrapped lines are joined: this Markdown is hard-wrapped at 80 columns, so a
 * paragraph and a bullet both span several lines and neither is a line break.
 */
export function renderMarkdown(source: string): string {
  const lines = stripFrontmatter(source).split(/\r?\n/);
  const out: string[] = [];

  // The open block, if any. Held rather than emitted so wrapped lines can be
  // appended to it.
  let para: string[] = [];
  let items: string[] | null = null;
  let table: string[][] | null = null;

  // Two trailing spaces is Markdown's hard line break, and the contact block
  // at the foot of both documents is the one place that needs it -- a postal
  // address run onto a single line reads as a mistake. BREAK survives escape()
  // and the inline regexes untouched, so it is swapped for the tag last.
  const BREAK = "\u0000";
  const closeParagraph = () => {
    if (para.length) {
      const joined = para.join(" ").split(`${BREAK} `).join(BREAK);
      out.push(`<p>${inline(joined).split(BREAK).join("<br>\n")}</p>`);
    }
    para = [];
  };
  const closeList = () => {
    if (items) out.push(`<ul>\n${items.map((i) => `<li>${inline(i)}</li>`).join("\n")}\n</ul>`);
    items = null;
  };
  const closeTable = () => {
    if (table) {
      const [head, ...body] = table;
      const th = head!.map((c) => `<th>${inline(c)}</th>`).join("");
      const rows = body
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
        .join("\n");
      // The retention table is the widest thing on the page and a phone is
      // 375px. The wrapper is what scrolls, so the page body never does.
      out.push(`<div class="scroll"><table>\n<tr>${th}</tr>\n${rows}\n</table></div>`);
    }
    table = null;
  };
  const closeAll = () => {
    closeParagraph();
    closeList();
    closeTable();
  };

  for (const line of lines) {
    if (line.trim() === "") {
      closeAll();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      closeAll();
      const level = heading[1]!.length;
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
      continue;
    }

    if (TABLE_RULE.test(line)) {
      // The `| --- |` under a header row. It carries no content; alignment
      // markers are not used and would be ignored if they were.
      if (!table) throw new Error(`table rule with no header row: ${line}`);
      continue;
    }

    const row = TABLE_ROW.exec(line);
    if (row) {
      closeParagraph();
      closeList();
      (table ??= []).push(cells(line));
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      closeParagraph();
      closeTable();
      (items ??= []).push(bullet[1]!);
      continue;
    }

    // A continuation: an indented line under a bullet belongs to that bullet,
    // anything else extends the paragraph.
    if (items && /^ +\S/.test(line)) {
      items[items.length - 1] += ` ${line.trim()}`;
      continue;
    }

    closeList();
    closeTable();
    // Trailing whitespace is invisible and editors strip it, so the test suite
    // asserts the rendered address still has its breaks. If someone's editor
    // eats them, that goes red rather than the page quietly running together.
    para.push(/ {2,}$/.test(line) ? `${line.trim()}${BREAK}` : line.trim());
  }

  closeAll();
  return out.join("\n");
}
