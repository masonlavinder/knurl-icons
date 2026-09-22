#!/usr/bin/env node
/**
 * M0 gate check, against the real app in a real browser.
 *
 * The gate is: "can select and delete anything by mouse or keyboard, at any
 * zoom". Hit-testing depends on browser layout (pointer-events, stroke widths,
 * the live CTM), so jsdom cannot answer this -- it has to be a real browser.
 *
 *   node scripts/check-m0.mjs [url]
 */
import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:5199/';
const results = [];
const record = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
};

// Use the system Chrome rather than downloading a Playwright build.
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.canvas', { timeout: 10000 });

const rowCount = () => page.locator('.element-list .row').count();
const selCount = () => page.locator('.element-list .row-wrap.is-selected').count();

/** Click a point given in ICON UNITS, mapped through the live viewBox. */
async function clickUnits(x, y) {
  const at = await page.evaluate(
    ([ux, uy]) => {
      const svg = document.querySelector('.canvas');
      const pt = new DOMPoint(ux, uy).matrixTransform(svg.getScreenCTM());
      return { x: pt.x, y: pt.y };
    },
    [x, y],
  );
  await page.mouse.click(at.x, at.y);
  return at;
}

const reseed = async () => {
  await page.evaluate(() => {
    document.querySelector('textarea.code').focus();
  });
};

// ---------------------------------------------------------------- render
record('app mounts without console errors', errors.length === 0, errors[0] ?? '');
record('seed document renders 2 elements', (await rowCount()) === 2, `rows=${await rowCount()}`);
record(
  'every element has a hit target',
  (await page.locator('.l-hit [data-addr]').count()) === 2,
);

// ------------------------------------------------------- click to select
// (2,12) is the circle's leftmost point: on the stroke, not inside it.
await clickUnits(2, 12);
record('clicking geometry selects it', (await selCount()) === 1, `selected=${await selCount()}`);

// -------------------------------------- clicking empty space deselects
await clickUnits(0.5, 0.5);
record('clicking empty canvas clears selection', (await selCount()) === 0);

// --------------------------------------------------------- delete by key
await clickUnits(2, 12);
await page.keyboard.press('Delete');
record('Delete removes the selected element', (await rowCount()) === 1, `rows=${await rowCount()}`);

// ------------------------------------------- second Delete must also work
// The selection-repair check: a stale address would make this a silent no-op.
await page.locator('.element-list .row-main').first().click();
await page.keyboard.press('Delete');
record('a second Delete also works (selection repaired)', (await rowCount()) === 0);

// ------------------------------------------------------------------ undo
await page.keyboard.press('Control+z');
await page.keyboard.press('Control+z');
record('undo restores both deletions', (await rowCount()) === 2, `rows=${await rowCount()}`);

// ------------------------------------------- list row toggles selection off
// Two clicks on the SAME row: the first selects, the second lets go.
await page.locator('.element-list .row-main').first().click();
const afterFirstClick = await selCount();
await page.locator('.element-list .row-main').first().click();
record(
  'clicking the same row twice deselects it',
  afterFirstClick === 1 && (await selCount()) === 0,
  `${afterFirstClick} -> ${await selCount()}`,
);

// ...but selecting on canvas and then clicking that row must NOT deselect,
// or Del and Ctrl+E silently do nothing.
await clickUnits(2, 12);
await page.locator('.element-list .row-main').first().click();
record('clicking the row of a canvas-selected element keeps it selected', (await selCount()) === 1);

// --------------------------------------------------- keyboard traversal
await clickUnits(0.5, 0.5);
await page.keyboard.press('Tab');
record('Tab selects an element without the mouse', (await selCount()) === 1);

// ------------------------------------------------- node-level addressing
// Select the path (row 1); a circle is a primitive and correctly has no nodes.
await page.locator('.element-list .row-main').nth(1).click();
const nodeDots = await page.locator('.node-dot').count();
record('selecting a path exposes its node targets', nodeDots === 3, `nodes=${nodeDots}`);

// ------------------------------------------------------ node-level delete
const beforeNodes = nodeDots;
await page.locator('.node-dot').nth(1).click({ force: true });
await page.keyboard.press('Delete');
const afterNodes = await page.locator('.node-dot').count();
record(
  'Delete on a node removes just that node',
  afterNodes === beforeNodes - 1 && (await rowCount()) === 2,
  `nodes ${beforeNodes} -> ${afterNodes}, rows=${await rowCount()}`,
);
await page.keyboard.press('Control+z');

// --------------------------------------------------- delete at high zoom
// Zoom in hard, re-centre on geometry, and confirm it is still grabbable: the
// grab radius is max(strokeWidth, 10/zoom), so thin shapes must stay hittable.
// Zoom centred ON the point we will click, so it stays under the cursor --
// otherwise the target simply scrolls out of the viewBox and the test measures
// nothing but its own arithmetic.
const anchor = await page.evaluate(() => {
  const svg = document.querySelector('.canvas');
  const pt = new DOMPoint(2, 12).matrixTransform(svg.getScreenCTM());
  return { x: pt.x, y: pt.y };
});
await page.mouse.move(anchor.x, anchor.y);
for (let i = 0; i < 3; i++) {
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await page.waitForTimeout(40);
  await page.mouse.move(anchor.x, anchor.y);
}
const zoomText = (await page.locator('.toolbar [data-zoom]').textContent())?.trim();
const before = await rowCount();
await clickUnits(2, 12);
const selectedZoomed = await selCount();
await page.keyboard.press('Delete');
const after = await rowCount();
record(
  `select + delete still work zoomed in (${zoomText})`,
  selectedZoomed === 1 && after === before - 1,
  `selected=${selectedZoomed}, rows ${before} -> ${after}`,
);
await page.keyboard.press('Control+z');
await page.keyboard.press('0'); // reset view

// ---------------------------------------------------- code panel applies
const code = page.locator('textarea.code');
const text = await code.inputValue();
record('code panel shows serialized SVG', text.includes('<svg') && text.includes('stroke-width="2"'));

await code.fill(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="12" x2="20" y2="12"/></svg>',
);
await clickUnits(0.5, 0.5);
await page.waitForTimeout(250);
record('editing the code panel re-imports', (await rowCount()) === 2, `rows=${await rowCount()}`);

const roundTripped = await code.inputValue();
record(
  'round-trip normalizes to house spec',
  roundTripped.includes('<rect width="16" height="16" x="4" y="4" rx="2" />') &&
    roundTripped.includes('<line x1="4" x2="20" y1="12" y2="12" />'),
  roundTripped
    .split('\n')
    .filter((l) => l.includes('<rect') || l.includes('<line'))
    .map((l) => l.trim())
    .join(' | '),
);

// --------------------------------------------- unsupported input reports
await code.fill(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<g transform="scale(2)"><path d="M1 1L5 5"/></g></svg>',
);
await clickUnits(0.5, 0.5);
await page.waitForTimeout(250);
const diagText = await page.locator('.diag-error').first().textContent();
record(
  'unsupported input reports a diagnostic instead of silently dropping',
  (diagText ?? '').includes('TRANSFORM'),
  diagText?.trim() ?? 'no diagnostic shown',
);

// ================================================================ UI notes
console.log('\n-- panel behaviour --');

// 1. paste applies without needing a blur
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.canvas');
const pasteSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
  '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="3"/><line x1="2" y1="12" x2="6" y2="12"/></svg>';
await page.locator('textarea.code').focus();
// Simulate a real paste event rather than typing.
await page.evaluate((text) => {
  const ta = document.querySelector('textarea.code');
  ta.select();
  const dt = new DataTransfer();
  dt.setData('text', text);
  ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, pasteSvg);
await page.waitForTimeout(300);
record('paste applies immediately, no blur needed', (await rowCount()) === 3, `rows=${await rowCount()}`);

// 2. inspector edits geometry and the code panel follows
await page.locator('.row-twist').first().click();
const rField = page.locator('.insp-field input').nth(2);
await rField.fill('9');
await page.waitForTimeout(250);
const afterEdit = await page.locator('textarea.code').inputValue();
record(
  'inspector edit updates the document and the SVG on the right',
  afterEdit.includes('r="9"'),
  afterEdit.split('\n').find((l) => l.includes('<circle'))?.trim() ?? '',
);

// 3. add element from the left panel
const beforeAdd = await rowCount();
await page.locator('.add-toggle').click();
await page.locator('.add-menu button', { hasText: 'Rectangle' }).click();
await page.waitForTimeout(200);
const addedOk = (await rowCount()) === beforeAdd + 1;
const codeHasRect = (await page.locator('textarea.code').inputValue()).includes('<rect');
record('adding an element from the list works', addedOk && codeHasRect, `rows=${await rowCount()}`);

// 4. conformance panel: collapsed by default, score visible, opens on click
const collapsedRules = await page.locator('.rules .rule').count();
const collapsedScore = (await page.locator('.score').textContent())?.trim();
record(
  'conformance starts collapsed but still shows the score',
  collapsedRules === 0 && /^\d+\/8$/.test(collapsedScore ?? ''),
  `rules=${collapsedRules}, score=${collapsedScore}`,
);
await page.locator('.conformance-head').click();
const ruleCount = await page.locator('.rules .rule').count();
const scoreText = (await page.locator('.score').textContent())?.trim();
record('opening it lists all 8 rules', ruleCount === 8 && !!scoreText, `rules=${ruleCount}, score=${scoreText}`);

// a failing rule should be clickable and select the offending geometry
await page.locator('textarea.code').focus();
await page.evaluate(() => {
  const ta = document.querySelector('textarea.code');
  ta.select(); // replace, don't insert at the caret
  const dt = new DataTransfer();
  dt.setData('text', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12"/></svg>');
  ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
});
await page.waitForTimeout(300);
const padFail = await page.locator('.rule-fail', { hasText: 'visual bounds' }).count();
record('padding violation is detected', padFail === 1, `r=12 circle overflows [1,23]`);

await page.locator('.rule-fail button').first().click();
record('clicking a failing rule selects the offending geometry', (await selCount()) === 1);

// ============================================================ direct edit
console.log('\n-- direct manipulation --');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.canvas');

const pasteInto = async (svg) => {
  await page.locator('textarea.code').focus();
  await page.evaluate((text) => {
    const ta = document.querySelector('textarea.code');
    ta.select();
    const dt = new DataTransfer();
    dt.setData('text', text);
    ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, svg);
  await page.waitForTimeout(280);
};
const codeNow = () => page.locator('textarea.code').inputValue();

// drag a node
await pasteInto('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="4 16 12 8 20 16"/></svg>');
await page.locator('.element-list .row-main').first().click();
const dot = page.locator('.node-dot').nth(1);
const box = await dot.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 60, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(150);
const draggedCode = await codeNow();
record('dragging a node moves it', !draggedCode.includes('12 8'), draggedCode.match(/points="[^"]*"/)?.[0] ?? '');

// a whole drag is one undo step
await page.keyboard.press('Control+z');
await page.waitForTimeout(120);
record('the whole drag undoes in one step', (await codeNow()).includes('12 8'));

// double-click a segment inserts a node
const dotsBefore = await page.locator('.node-dot').count();
const segBox = await page.locator('.seg-target').first().boundingBox();
await page.mouse.dblclick(segBox.x + segBox.width / 2, segBox.y + segBox.height / 2);
await page.waitForTimeout(200);
record('double-clicking a segment inserts a node', (await page.locator('.node-dot').count()) === dotsBefore + 1,
  `${dotsBefore} -> ${await page.locator('.node-dot').count()}`);

// selecting a node highlights its row in the left panel
await page.locator('.node-dot').nth(1).click({ force: true });
await page.waitForTimeout(150);
record('selecting a node highlights its row on the left', (await page.locator('.node-row.is-selected').count()) === 1);

// curve toggle adds handles and removes them again
const curveBtn = page.locator('.node-row.is-selected .node-kind');
await curveBtn.click();
await page.waitForTimeout(150);
const handlesOn = await page.locator('.handle-dot').count();
await curveBtn.click();
await page.waitForTimeout(150);
const handlesOff = await page.locator('.handle-dot').count();
record('Curved adds handles and toggling back removes them', handlesOn >= 2 && handlesOff === 0,
  `on=${handlesOn}, off=${handlesOff}`);

// fill is dropped when the shape is opened
await pasteInto('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="12 4 20 20 4 20"/></svg>');
await page.locator('.element-list .row-main').first().click();
await page.locator('.row-twist').first().click();
const fillBox = page.locator('.insp-check', { hasText: 'Filled' }).locator('input');
await fillBox.check();
await page.waitForTimeout(200);
const filled = (await codeNow()).includes('fill="currentColor"');
await page.locator('.insp-check', { hasText: 'Closed' }).locator('input').uncheck();
await page.waitForTimeout(200);
const stillFilled = (await codeNow()).includes('fill="currentColor"');
record('opening a shape clears its fill', filled && !stillFilled, `filled=${filled}, after open=${stillFilled}`);

// centre hotkey
await pasteInto('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="6" cy="6" r="3"/></svg>');
await page.locator('.element-list .row-main').first().click();
await page.keyboard.press('Control+e');
await page.waitForTimeout(200);
const centred = await codeNow();
record('Ctrl+E centres the selection', centred.includes('cx="12"') && centred.includes('cy="12"'),
  centred.match(/<circle[^>]*>/)?.[0] ?? '');

// grid discipline: every coordinate a drag produces must sit on the half grid
await pasteInto('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="4 16 12 8 20 16"/></svg>');
await page.locator('.element-list .row-main').first().click();
// zoom in hard first: this is where a tolerance-based snap silently stops working
await page.locator('.canvas').hover();
for (let i = 0; i < 3; i++) {
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await page.waitForTimeout(40);
}
const zoomedDot = await page.locator('.node-dot').nth(1).boundingBox();
if (zoomedDot) {
  await page.mouse.move(zoomedDot.x + zoomedDot.width / 2, zoomedDot.y + zoomedDot.height / 2);
  await page.mouse.down();
  await page.mouse.move(zoomedDot.x + zoomedDot.width / 2 + 37, zoomedDot.y + zoomedDot.height / 2 - 23, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}
const pts = (await codeNow()).match(/points="([^"]*)"/)?.[1] ?? '';
const offGrid = pts.split(/\s+/).filter((v) => v && Math.abs(Number(v) * 2 - Math.round(Number(v) * 2)) > 1e-9);
record('dragging stays on the half grid even zoomed in', offGrid.length === 0, `points="${pts}"`);
await page.keyboard.press('0');

// add-node button appends
await page.locator('.element-list .row-main').first().click();
await page.locator('.row-twist').first().click();
await page.waitForTimeout(200);
const beforeAdd2 = await page.locator('.node-row').count();
await page.locator('.node-add').first().click();
await page.waitForTimeout(200);
record('Add node appends to the run', (await page.locator('.node-row').count()) === beforeAdd2 + 1,
  `${beforeAdd2} -> ${await page.locator('.node-row').count()}`);

// the colour handle selects its node
await page.locator('.node-grab').nth(1).click();
await page.waitForTimeout(150);
record('the colour handle selects its node', (await page.locator('.node-row.is-selected').count()) === 1);
record('canvas draws a matching identity ring per node', (await page.locator('.node-ring').count()) > 0);

// arrow nudge moves by exactly half a unit
await pasteInto('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/></svg>');
await page.locator('.element-list .row-main').first().click();
await page.keyboard.press('Control+ArrowRight');
await page.waitForTimeout(180);
record('Ctrl+Arrow nudges by 0.5', (await codeNow()).includes('cx="12.5"'),
  (await codeNow()).match(/<circle[^>]*>/)?.[0] ?? '');

record('no console errors during the whole run', errors.length === 0, errors.slice(0, 2).join(' | '));

await reseed();
await page.screenshot({ path: 'test-artifacts/m0.png' });
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
