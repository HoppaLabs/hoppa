// Local dev server. Rebuilds on every page load -- the build is fast enough
// that a watcher would only add a way for it to go stale.

import { build } from "../../tools/build.ts";

const PORT = Number(Bun.env.PORT ?? 3000);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json",
};

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname === "/" ? "/index.html" : url.pathname;

    if (path === "/index.html") await build();

    const file = Bun.file(`dist${path}`);
    if (!(await file.exists())) return new Response("not found", { status: 404 });

    const ext = path.slice(path.lastIndexOf("."));
    return new Response(file, {
      headers: {
        "content-type": TYPES[ext] ?? "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  },
});

console.log(`hoppa dev  http://localhost:${PORT}`);
