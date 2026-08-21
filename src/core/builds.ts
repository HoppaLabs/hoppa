// Which rules a NEW level is drawn under.
//
// Authoring needs one number per engine; PLAYING needs the engine itself. They
// used to come from the same place, and the level editor -- a page a child
// loads on mobile data -- pulled all eleven engine builds into its bundle to
// read one integer. It tripled the size of the page.
//
// So the number lives here, where it costs nothing, and `test/registry.test.ts`
// asserts it still matches what the registry actually has. Adding a build
// without updating this fails the suite loudly, which is the property that
// mattered: a stale hardcoded version is exactly the bug that shipped levels
// under the old rules and left a child's sword doing nothing.

export const NEWEST_BUILD: Readonly<Record<string, number>> = {
  delve: 5,
  roam: 8,
  dash: 7,
  swim: 2,
};

/** The build a new level of this kind should pin, or 0 if there is no such engine. */
export function newestBuild(engine: string): number {
  return NEWEST_BUILD[engine] ?? 0;
}
