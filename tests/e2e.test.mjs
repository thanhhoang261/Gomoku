// End-to-end tests in headless Chrome against the real WebAssembly engine.
// Requires: public/engine/ (npm run build:engine) and puppeteer-core. Set CHROME_PATH if Chrome is not in
// a default location.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { createServer } from '../scripts/serve.mjs';

const CHROME = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((p) => p && fs.existsSync(p));

const puzzles = JSON.parse(fs.readFileSync(new URL('../public/data/puzzles.json', import.meta.url), 'utf8'));
let server, browser, page, base;

before(async () => {
  assert.ok(CHROME, 'Chrome not found; set CHROME_PATH');
  assert.ok(fs.existsSync(new URL('../public/engine/rapfi-single-simd128.wasm', import.meta.url)), 'build the engine first: npm run build:engine');
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}/`;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
});
after(async () => {
  await browser?.close();
  server?.close();
});

const status = () => page.$eval('#status', (e) => e.textContent);
async function waitStatus(re, ms = 60000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const s = await status();
    if (re.test(s)) return s;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`timed out waiting for ${re}; status = "${await status()}"`);
}
async function click(x, y) {
  const r = await page.$eval('#board', (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width }; });
  const s = r.w / 720;
  await page.mouse.click(r.l + (40 + (x * 640) / 14) * s, r.t + (40 + (y * 640) / 14) * s);
}
const moveCount = () => page.$$eval('#moves li', (l) => l.length);
const parseLabel = (t) => { const m = /([A-O])(\d+)/.exec(t); return [m[1].charCodeAt(0) - 65, 15 - parseInt(m[2], 10)]; };

async function freshPage() {
  page?.close();
  page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 1000 });
  page.on('pageerror', (e) => { throw e; });
  await page.goto(base);
  await waitStatus(/Your turn/);
}

test('page loads, engine replies to a move', async () => {
  await freshPage();
  await page.select('#level', '0');
  await page.click('#new');
  await waitStatus(/Your turn/);
  await click(7, 7);
  await waitStatus(/Your turn/);
  assert.equal(await moveCount(), 2);
});

test('hint, undo, save and load', async () => {
  await freshPage();
  await page.select('#level', '0');
  await page.click('#new');
  await waitStatus(/Your turn/);
  await click(7, 7);
  await waitStatus(/Your turn/);
  await page.click('#hint');
  assert.match(await waitStatus(/Hint:/), /Hint: [A-O]\d+/);
  await page.click('#save');
  await page.click('#undo');
  await waitStatus(/Your turn/);
  assert.equal(await moveCount(), 0);
  await page.click('#load');
  await waitStatus(/Your turn/);
  assert.equal(await moveCount(), 2);
});

test('renju: engine opens as Black when you play White', async () => {
  await freshPage();
  await page.select('#rule', '4');
  await page.select('#side', 'white');
  await page.select('#level', '0');
  await page.click('#new');
  await waitStatus(/Your turn \(White\)/);
  assert.equal(await moveCount(), 1);
});

for (const level of ['1', '2', '3']) {
  test(`puzzle level ${level}: wrong moves are rejected, the solution is accepted and solves`, async () => {
    await freshPage();
    await page.select('#plevel', level);
    await page.click('#pnew');
    const id = +/#(\d+)/.exec(await status())[1];
    const pz = puzzles.find((p) => p.id === id);
    assert.ok(pz, 'puzzle exists in puzzles.json');

    // A move that does not keep the fastest win must be taken back.
    const occupied = new Set(pz.moves.map((m) => m.join(',')));
    let wx = 0;
    while (occupied.has(`${wx},0`)) wx++;
    await click(wx, 0);
    await waitStatus(/Not quite|slower than optimal|Correct|Solved/);
    assert.match(await status(), /Not quite|slower than optimal/);
    assert.equal(await moveCount(), pz.moves.length, 'board restored after a wrong move');

    // The stored solution move, then follow the engine's hints until solved.
    await click(...pz.solution);
    let s = await waitStatus(/Not quite|slower than optimal|Correct|Solved/);
    assert.match(s, /Correct|Solved/);
    for (let i = 0; i < 6 && !/Solved/.test(s); i++) {
      await page.click('#hint');
      const hint = await waitStatus(/Hint:/);
      await click(...parseLabel(hint));
      s = await waitStatus(/Not quite|slower than optimal|Correct|Solved/);
      assert.match(s, /Correct|Solved/);
    }
    assert.match(s, /Solved/);
  });
}

test('review flags a blunder; saving keeps the review and loading restores it', async () => {
  await freshPage();
  await page.select('#level', '0');
  await page.click('#new');
  await waitStatus(/Your turn/);
  for (const [x, y] of [[7, 7], [0, 0], [14, 0]]) { // second move is a deliberate blunder
    await click(x, y);
    await waitStatus(/Your turn|wins|win!/, 20000);
  }
  await page.click('#review');
  await waitStatus(/Review done|Review stopped/, 120000);
  assert.equal(await page.$eval('#reviewPanel', (e) => e.hidden), false);
  const before = await page.$eval('#reviewSummary', (e) => e.innerText);
  assert.match(before, /blunders/);
  assert.ok((await page.$$('#mistakes li.mine')).length >= 1, 'at least one of your moves is flagged');

  await page.click('#save');
  await page.click('#new');
  await waitStatus(/Your turn/);
  assert.equal(await page.$eval('#reviewPanel', (e) => e.hidden), true, 'a new game clears the review');
  await page.click('#load');
  await waitStatus(/Game opened with its review/);
  assert.equal(await page.$eval('#reviewSummary', (e) => e.innerText), before);
});
