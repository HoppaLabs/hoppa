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
    "    https://hoppalabs.github.io/hoppa/",
    "",
    "  Work on a branch does not publish: deployments to the github-pages",
    "  environment are restricted to the default branch. See docs/adr/0001-hosting.md.",
  ].join("\n"),
);
