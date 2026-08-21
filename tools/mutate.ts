// Break things on purpose, and check the suite notices.
//
// WHY
//
// "reach lifts a gem from further away" built a long arm and a short arm,
// walked them the same path, and checked the long one collected no later.
// REACH stopped being a spendable characteristic in adr/0012, so `Build` has
// no such key and the two creatures were IDENTICAL: it compared a number to
// itself. It passed every run for nine days.
//
// A green suite says the tests did not fail. It does not say they COULD. This
// asks the only question that separates those two: if the thing were broken,
// would anybody know?
//
// Each mutation below is a real defect this project has shipped or nearly
// shipped, written as a one-line edit. A mutation that SURVIVES -- suite still
// green with the code broken -- is a hole, and the report names it.
//
// Not in `bun run check`: it runs the whole suite once per mutation, so it is
// minutes rather than seconds. Run it when you add a guard test, to find out
// whether you added one.

const SUITE = ["bun", "test"] as const;

interface Mutation {
  /** What real defect this re-creates. */
  readonly breaks: string;
  readonly file: string;
  readonly find: string;
  readonly replace: string;
}

const MUTATIONS: readonly Mutation[] = [
  {
    breaks: "enemies in the side-on game stop falling (the day-18 bug)",
    file: "src/engines/dash/v8.ts",
    find: "  private dropWalker(walker: Walker): void {",
    replace: "  private dropWalker(walker: Walker): void {\n    if (walker !== undefined) return;",
  },
  {
    breaks: "enemies stop moving at all (the day-17 bug)",
    file: "src/engines/roam/v8.ts",
    find: "export const ENEMY_SPEED = 22;",
    replace: "export const ENEMY_SPEED = 0;",
  },
  {
    breaks: "a current stops pushing, so strength has no job underwater",
    file: "src/engines/swim/v3.ts",
    find: "export const FLOW_PUSH = 54;",
    replace: "export const FLOW_PUSH = 0;",
  },
  {
    breaks: "the underwater palette says goblin over a picture of a shark",
    file: "src/web/level/palette.ts",
    find: 'names: { swim: "shark", calm: "bunny" }',
    replace: 'names: { swim: "goblin", calm: "bunny" }',
  },
  {
    breaks: "the reef's cast is listed out of glyph order, so a shark draws as a crab",
    file: "src/core/enemies.ts",
    find: "export const CASTS: Readonly<Record<string, readonly Enemy[]>> = {\n  garden: GARDEN_CAST,\n  reef: REEF_CAST,\n};",
    replace: "export const CASTS: Readonly<Record<string, readonly Enemy[]>> = {\n  garden: GARDEN_CAST,\n  reef: [REEF_CAST[2], REEF_CAST[1], REEF_CAST[0]] as readonly Enemy[],\n};",
  },
  {
    breaks: "drowning stops saying it is drowning",
    file: "src/web/play/breath.ts",
    find: 'return { text: "no air -- swim up!", said: AIR_OUT };',
    replace: "return { text: null, said: AIR_OUT };",
  },
  {
    breaks: "the garden is reported as a level somebody failed to finish",
    file: "src/core/bot.ts",
    find: "  const place = aPlace(level.engine);",
    replace: "  const place = false;",
  },
  {
    breaks: "the garden demands a door the palette will not sell you",
    file: "src/core/advice.ts",
    find: "  const place = aPlace(result.level.engine);",
    replace: "  const place = false;",
  },
  {
    // The first attempt here was `TILE_TREASURE = 4 as number`, which changes
    // nothing at all -- so it survived, correctly, and told me only that I had
    // written a mutation that does not mutate. A mutation that cannot break
    // anything is the same mistake as a test that cannot fail.
    breaks: "a cosmetic tileset id reaches stateHash (hard rule 4)",
    file: "src/engines/roam/v8.ts",
    find: "    h = hashInt32(h, this.collected);",
    replace: "    h = hashInt32(h, this.collected);\n    h = hashInt32(h, this.level.tilesetId);",
  },
];

async function suiteIsGreen(): Promise<boolean> {
  const run = Bun.spawnSync([...SUITE], { stdout: "pipe", stderr: "pipe" });
  return run.exitCode === 0;
}

async function main(): Promise<void> {
  if (!(await suiteIsGreen())) {
    console.log("the suite is RED before any mutation. Fix that first.");
    process.exit(1);
  }

  const survivors: Mutation[] = [];
  console.log(`${MUTATIONS.length} mutations, each one a defect this project has shipped or nearly shipped.\n`);

  for (const mutation of MUTATIONS) {
    const path = mutation.file;
    const original = await Bun.file(path).text();
    if (!original.includes(mutation.find)) {
      console.log(`  ?? ${mutation.breaks}\n     (no longer applies: the code it edits has moved -- fix or drop it)`);
      survivors.push(mutation);
      continue;
    }
    try {
      await Bun.write(path, original.replace(mutation.find, mutation.replace));
      const green = await suiteIsGreen();
      console.log(`  ${green ? "SURVIVED" : "caught  "}  ${mutation.breaks}`);
      if (green) survivors.push(mutation);
    } finally {
      // Always, on every path. A mutation left behind is a broken checkout.
      await Bun.write(path, original);
    }
  }

  console.log("");
  if (survivors.length === 0) {
    console.log(`all ${MUTATIONS.length} caught: every one of these defects fails at least one test.`);
    return;
  }
  console.log(`${survivors.length} SURVIVED -- these can break with the suite still green:`);
  for (const one of survivors) console.log(`  - ${one.breaks}\n      ${one.file}`);
  process.exit(1);
}

if (import.meta.main) await main();
