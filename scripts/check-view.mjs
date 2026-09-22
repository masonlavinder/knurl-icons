#!/usr/bin/env node
/**
 * Chrome gate: the shell around the drawing does what it says.
 *
 * The toolbar, the collapsing rails, the panel controls, and the rule that the
 * icon cannot be panned or zoomed off screen. The clamp behind that last one is
 * unit-tested in src/store/viewStore.test.ts; what cannot be tested there is
 * whether the gestures actually reach it — a drag is a pointer capture, a wheel
 * is a passive listener, a button is a click on a chamfered face — so this
 * drives the real app in a real browser and reads the viewBox the SVG is
 * actually carrying.
 *
 *   node scripts/check-view.mjs [url]
 */
import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:5199/';
let fails = 0;
const ok = (name, pass, detail = '') => {
  if (!pass) fails += 1;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
};

const b = await chromium.launch({ channel: 'chrome' });
// The copy button reads the clipboard back, which needs the permission granted
// at the context rather than the page.
const ctx = await b.newContext({
  viewport: { width: 1400, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForSelector('.canvas');

const vb = async () => (await p.locator('.canvas').getAttribute('viewBox')).split(' ').map(Number);
const visible = ([x, y, w, h]) => {
  const ox = Math.min(x + w, 24) - Math.max(x, 0);
  const oy = Math.min(y + h, 24) - Math.max(y, 0);
  return { ox, oy, need: Math.min(w, 24) / 2 };
};
const box = await p.locator('.canvas').boundingBox();
const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

// -- Open ------------------------------------------------------------------
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16"/></svg>`;
await p.setInputFiles('input[type=file]', { name: 'test-square.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(SVG) });
await p.waitForTimeout(250);
const code = await p.locator('.code-input').inputValue();
ok('Open loads a file into the document', code.includes('<rect'), code.split('\n').find((l) => l.includes('rect'))?.trim());
ok('Open names the document from the file', (await p.locator('.readout').last().textContent()).includes('Open'));

// -- Save ------------------------------------------------------------------
const dl = p.waitForEvent('download', { timeout: 5000 }).catch(() => null);
await p.getByRole('button', { name: 'Save' }).click();
const got = await dl;
ok('Save downloads an .svg', Boolean(got) && got.suggestedFilename().endsWith('.svg'), got?.suggestedFilename());

// -- zoom buttons ----------------------------------------------------------
const before = await vb();
await p.getByRole('button', { name: 'Zoom in' }).click();
const zin = await vb();
ok('Zoom in narrows the viewBox', zin[2] < before[2], `${before[2]} -> ${zin[2]}`);
await p.getByRole('button', { name: 'Zoom out' }).click();
await p.getByRole('button', { name: 'Zoom out' }).click();
const zout = await vb();
ok('Zoom out widens it', zout[2] > zin[2], `${zin[2]} -> ${zout[2]}`);

const zoomOut = p.getByRole('button', { name: 'Zoom out' });
for (let i = 0; i < 40 && !(await zoomOut.isDisabled()); i += 1) await zoomOut.click();
ok('Zoom out disables itself at the limit', await p.getByRole('button', { name: 'Zoom out' }).isDisabled());
const wide = await vb();
ok('the whole artboard is on screen when zoomed out', wide[0] <= 0 && wide[1] <= 0 && wide[0] + wide[2] >= 24 && wide[1] + wide[3] >= 24, wide.join(' '));

await p.getByRole('button', { name: 'Fit' }).click();
const zoomIn = p.getByRole('button', { name: 'Zoom in' });
for (let i = 0; i < 40 && !(await zoomIn.isDisabled()); i += 1) await zoomIn.click();
ok('Zoom in disables itself at the limit', await p.getByRole('button', { name: 'Zoom in' }).isDisabled());
const tight = visible(await vb());
ok('the icon is still on screen at max zoom', tight.ox >= tight.need - 1e-6 && tight.oy >= tight.need - 1e-6, JSON.stringify(tight));

// -- drag to pan -----------------------------------------------------------
await p.getByRole('button', { name: 'Fit' }).click();
const start = await vb();
await p.mouse.move(mid.x - 300, mid.y - 300);
await p.mouse.down();
await p.mouse.move(mid.x + 300, mid.y + 300, { steps: 20 });
await p.mouse.up();
const panned = await vb();
ok('dragging empty canvas pans the view', panned[0] !== start[0] || panned[1] !== start[1], `${start.join(' ')} -> ${panned.join(' ')}`);

// -- cannot lose the object ------------------------------------------------
for (const [dx, dy] of [[3000, 3000], [-3000, -3000], [3000, -3000], [-3000, 3000]]) {
  await p.mouse.move(mid.x, mid.y);
  await p.mouse.down();
  await p.mouse.move(mid.x + dx, mid.y + dy, { steps: 30 });
  await p.mouse.up();
  const v = visible(await vb());
  ok(`the artboard survives a ${dx},${dy} shove`, v.ox >= v.need - 1e-6 && v.oy >= v.need - 1e-6, JSON.stringify(v));
}

// the geometry is actually painted inside the viewport
const onscreen = await p.evaluate(() => {
  const svg = document.querySelector('.canvas');
  const r = svg.getBoundingClientRect();
  const g = svg.querySelector('.l-render').getBoundingClientRect();
  return g.right > r.left && g.left < r.right && g.bottom > r.top && g.top < r.bottom;
});
ok('the drawn geometry is inside the viewport after all that', onscreen);

// -- drag must not clear the selection -------------------------------------
await p.getByRole('button', { name: 'Fit' }).click();
await p.locator('.element-list .row-main').first().click();
ok('a row click selects', (await p.locator('.element-list .row-wrap.is-selected').count()) === 1);
await p.mouse.move(box.x + 12, box.y + 12);
await p.mouse.down();
await p.mouse.move(box.x + 160, box.y + 160, { steps: 12 });
await p.mouse.up();
ok('dragging the background keeps the selection', (await p.locator('.element-list .row-wrap.is-selected').count()) === 1);
await p.mouse.click(box.x + 12, box.y + 12);
ok('clicking the background still clears it', (await p.locator('.element-list .row-wrap.is-selected').count()) === 0);

// -- copy out of the SVG panel ---------------------------------------------
await p.getByRole('button', { name: 'Copy' }).click();
const clip = await p.evaluate(() => navigator.clipboard.readText());
ok('Copy puts the panel text on the clipboard', clip === (await p.locator('.panel-code .code-input').inputValue()));
ok('Copy says so', (await p.locator('.btn-copy').textContent()) === 'Copied');
await p.waitForTimeout(1400);
ok('Copy goes back to normal', (await p.locator('.btn-copy').textContent()) === 'Copy');

// -- locked markers --------------------------------------------------------
const lock = await p.evaluate(() => {
  const ta = document.querySelector('.code-input');
  const pre = document.querySelector('.code-marks');
  const a = ta.getBoundingClientRect();
  const b = pre.getBoundingClientRect();
  const ca = getComputedStyle(ta);
  const cb = getComputedStyle(pre);
  const same = (k) => ca[k] === cb[k];
  const marks = [...document.querySelectorAll('.locked')].map((m) => m.textContent);
  return {
    marks,
    aligned:
      Math.abs(a.x - b.x) < 0.5 &&
      Math.abs(a.y - b.y) < 0.5 &&
      Math.abs(a.width - b.width) < 0.5 &&
      ta.scrollHeight === pre.scrollHeight &&
      same('fontFamily') && same('fontSize') && same('lineHeight') &&
      same('paddingTop') && same('paddingLeft') &&
      same('whiteSpace') && same('wordBreak'),
    // the overlay must never eat a click meant for the editor
    inert: getComputedStyle(pre).pointerEvents === 'none',
  };
});
ok('the locked overlay lines up with the editor exactly', lock.aligned);
ok('the overlay cannot be clicked', lock.inert);
ok('stroke-width is marked as locked', lock.marks.some((m) => m.startsWith('stroke-width=')), lock.marks.length + ' marks');
ok('the geometry below is not marked', !lock.marks.some((m) => m.startsWith('d=') || m.startsWith('cx=')));

// typing still works with the overlay on top
await p.locator('.code-input').fill('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="4" x2="20" y2="20"/></svg>');
await p.waitForTimeout(600);
ok('the panel still applies what is typed under the overlay', (await p.locator('.element-list .row').count()) === 1);

// -- collapsing rails ------------------------------------------------------
const ws = p.locator('.workspace');
const colOpen = await p.locator('.col-canvas').boundingBox();
ok('both panels start open on a wide window', (await ws.getAttribute('data-left')) === 'open' && (await ws.getAttribute('data-right')) === 'open');

await p.getByRole('button', { name: /Collapse the left/ }).click();
ok('the left rail collapses its panel', (await ws.getAttribute('data-left')) === 'closed');
ok('the collapsed left panel is gone from the tree', (await p.locator('.element-list').count()) === 0);

await p.getByRole('button', { name: /Collapse the right/ }).click();
ok('the right rail collapses its panel', (await ws.getAttribute('data-right')) === 'closed');

// The artboard itself is square and capped at 78vh, so on a short window it is
// height-bound and collapsing cannot widen it. The column is what gains the
// space, and that is what the rails are for.
const colWide = await p.locator('.col-canvas').boundingBox();
ok('the canvas column takes the space back', colWide.width > colOpen.width, `${Math.round(colOpen.width)} -> ${Math.round(colWide.width)}`);

await p.getByRole('button', { name: /Expand the left/ }).click();
await p.getByRole('button', { name: /Expand the right/ }).click();
ok('both reopen', (await ws.getAttribute('data-left')) === 'open' && (await ws.getAttribute('data-right')) === 'open');
ok('the left panel comes back', (await p.locator('.element-list').count()) === 1);

// -- a portrait window is not a wall of chrome -----------------------------
await p.setViewportSize({ width: 820, height: 1080 });
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('.canvas');
const narrow = await p.evaluate(() => ({
  left: document.querySelector('.workspace').dataset.left,
  right: document.querySelector('.workspace').dataset.right,
  hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  clipped: document.querySelector('.toolbar').scrollWidth > document.querySelector('.toolbar').clientWidth + 1,
  canvas: Math.round(document.querySelector('.canvas').getBoundingClientRect().width),
}));
ok('a portrait window starts with both panels collapsed', narrow.left === 'closed' && narrow.right === 'closed');
ok('it has no horizontal page scroll', !narrow.hScroll);
ok('the toolbar is not clipped', !narrow.clipped);
ok('the canvas gets the window', narrow.canvas > 600, `${narrow.canvas}px`);
await p.getByRole('button', { name: /Expand the left/ }).click();
ok('a panel can still be opened when narrow', (await p.locator('.element-list').count()) === 1);

ok('no console errors', errs.length === 0, errs.join(' | '));
console.log(fails === 0 ? '\nall checks passed' : `\n${fails} FAILED`);
await b.close();
process.exit(fails === 0 ? 0 : 1);
