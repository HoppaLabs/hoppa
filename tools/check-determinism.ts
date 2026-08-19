// The determinism-zone check (spec S2). Crude greps over src/core and src/engines.
//
// It is deliberately dumb: it reads source text and refuses anything that can
// make two devices disagree. If it fires on code you believe is fine, fix the
// code or add a narrowly-scoped allow comment -- do NOT weaken a rule to make a
// test pass. That trade always loses.
//
// Suppress a single line with a trailing:  // determinism-ok: <reason>

import { Glob } from "bun";

export const ZONE_DIRS = ["src/core", "src/engines"] as const;

export interface Rule {
  readonly id: string;
  readonly pattern: RegExp;
  readonly why: string;
}

export const RULES: readonly Rule[] = [
  {
    id: "no-math-random",
    pattern: /\bMath\s*\.\s*random\b/,
    why: "randomness must come from the seeded PRNG, never Math.random",
  },
  {
    id: "no-date",
    pattern: /\bDate\b/,
    why: "wall-clock time is ambient state; use the level's turn counter",
  },
  {
    id: "no-performance-now",
    pattern: /\bperformance\s*\.\s*now\b/,
    why: "wall-clock time is ambient state",
  },
  {
    id: "no-intl",
    pattern: /\bIntl\b/,
    why: "Intl is locale-dependent and differs between devices",
  },
  {
    id: "no-locale-methods",
    pattern: /\.\s*toLocale[A-Za-z]*\s*\(/,
    why: "toLocale* is locale-dependent and differs between devices",
  },
  {
    id: "no-parse-float",
    pattern: /\bparseFloat\b/,
    why: "no floating point in authoritative state",
  },
  {
    id: "no-float-literal",
    // 1.5, .5, 1e-3 -- but not 1.0e? we reject those too, and not `a.b` member access
    pattern: /(?<![\w.])(?:\d+\.\d+|\.\d+|\d+(?:\.\d+)?[eE][+-]?\d+)/,
    why: "no float literals in authoritative state; use | 0 and Math.imul",
  },
  {
    id: "no-web-crypto",
    pattern: /\bcrypto\s*\.\s*(?:getRandomValues|randomUUID)\b/,
    why: "randomness must come from the seeded PRNG",
  },
  {
    id: "no-object-key-iteration",
    pattern: /\bObject\s*\.\s*(?:keys|values|entries)\b/,
    why: "object iteration order leaks into state; use an explicit sorted array",
  },
];

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly why: string;
  readonly text: string;
}

const ALLOW = /\/\/\s*determinism-ok:/;

/** Strip string and comment bodies so a rule can't fire on prose or a message. */
function scrub(line: string): string {
  let out = "";
  let quote = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (quote !== "") {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "/" && line[i + 1] === "/") break;
    out += ch;
  }
  return out;
}

export async function scanZone(dirs: readonly string[] = ZONE_DIRS): Promise<Violation[]> {
  const violations: Violation[] = [];
  const glob = new Glob("**/*.ts");

  for (const dir of dirs) {
    const files: string[] = [];
    for await (const rel of glob.scan({ cwd: dir })) files.push(`${dir}/${rel}`);
    files.sort(); // stable report order

    for (const file of files) {
      const source = await Bun.file(file).text();
      const lines = source.split("\n");
      let inBlockComment = false;

      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i] as string;

        // Block comments are prose; skip them wholesale.
        let body = raw;
        if (inBlockComment) {
          const end = body.indexOf("*/");
          if (end < 0) continue;
          body = body.slice(end + 2);
          inBlockComment = false;
        }
        const open = body.indexOf("/*");
        if (open >= 0 && body.indexOf("*/", open) < 0) {
          body = body.slice(0, open);
          inBlockComment = true;
        }

        if (ALLOW.test(raw)) continue;
        const code = scrub(body);
        if (code.trim() === "") continue;

        for (const rule of RULES) {
          if (rule.pattern.test(code)) {
            violations.push({
              file,
              line: i + 1,
              rule: rule.id,
              why: rule.why,
              text: raw.trim(),
            });
          }
        }
      }
    }
  }
  return violations;
}

if (import.meta.main) {
  const violations = await scanZone();
  if (violations.length === 0) {
    console.log(`determinism zone clean: ${ZONE_DIRS.join(", ")} (${RULES.length} rules)`);
    process.exit(0);
  }
  console.error(`determinism zone: ${violations.length} violation(s)\n`);
  console.error(["FILE:LINE", "RULE", "SOURCE"].join("  |  "));
  for (const v of violations) {
    console.error(`${v.file}:${v.line}  |  ${v.rule}  |  ${v.text}`);
    console.error(`    ${v.why}`);
  }
  process.exit(1);
}
