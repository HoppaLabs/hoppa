import { expect, test } from "bun:test";

const editor = await Bun.file("src/web/level/main.ts").text();
const html = await Bun.file("src/web/level/index.html").text();
const buildTool = await Bun.file("tools/build.ts").text();
const worker = await Bun.file("src/web/sw.ts").text();
const play = await Bun.file("src/web/play/index.html").text();

test("the editor can play the level back to you", () => {
  // The checks say whether a room CAN be finished; watching somebody get out
  // is proof. The difference matters most to the person least able to read a
  // green tick -- a child who has drawn a room and does not know if it works.
  expect(html).toContain('<button id="watch">watch it played</button>');
  expect(editor).toContain('watchButton.addEventListener("click", () => {');
  expect(editor).toContain("stopWatching();");
});

test("...and only the editor: watching is a thing you do while MAKING", () => {
  expect(play).not.toContain('id="watch"');
});

test("the bot is loaded on tap, never with the page", () => {
  // Bundled in, the bot takes the editor from 54 kilobytes to 171: it drives
  // the real engines and there are eleven builds of them. On a game a child
  // downloads over mobile data that is not a rounding error, it is triple.
  expect(editor).toContain('import("../../core/bot.ts")');
  // A static import anywhere in this page would undo it.
  expect(editor).not.toMatch(/^import .*core\/bot\.ts/m);
  expect(editor).not.toMatch(/^import .*engines\/registry\.ts/m);
  // ...and the engine comes from the same lazy module, or the registry lands
  // in the page by the back door.
  expect(editor).toContain("bot.engineFor(");
});

test("splitting is on, or the import() is inlined and buys nothing", () => {
  expect(buildTool).toContain("splitting: true");
});

test("the bot's chunk is fetched by whoever asks, not posted to every phone", () => {
  // The shell is precached on install. The bot's chunk is bigger than the rest
  // of the game put together and most children never tap the button that wants
  // it, so it stays out -- and the worker keeps it the first time it IS
  // fetched, which gives the same offline answer for one download.
  expect(buildTool).toContain('if (name.includes("/bot-")) continue;');
  expect(worker).toContain("await cache.put(request, fresh.clone());");
  expect(worker).toContain('url.pathname.endsWith(".js")');
});
