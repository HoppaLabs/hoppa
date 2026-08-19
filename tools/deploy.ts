// `bun run deploy` does not upload anything itself -- publishing is
// .github/workflows/deploy.yml, which runs on every push to main. This exists
// so the command in CLAUDE.md is real, and so it tells you what is left to do.

const OUT = "dist";

for (const name of ["index.html", "app.js"]) {
  if (!(await Bun.file(`${OUT}/${name}`).exists())) {
    console.error(`  ${OUT}/${name} missing -- run bun run build`);
    process.exit(1);
  }
}

console.log(
  [
    "",
    "  dist/ is ready. Publishing happens in CI:",
    "    push to main -> .github/workflows/deploy.yml -> GitHub Pages",
    "",
    "  If nothing appears, check docs/adr/0001-hosting.md -- the repo is private,",
    "  so Pages needs a paid plan and Settings > Pages > Source: GitHub Actions.",
  ].join("\n"),
);
