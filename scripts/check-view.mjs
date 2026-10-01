#!/usr/bin/env node
/**
 * Chrome gate: the shell around the drawing does what it says.
 *
 * The toolbar, the resizable dock and its sections, the panel controls, and the rule that the
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
// Maximally overlapped: the whole artboard when it fits, nothing but artboard
// when it does not — on each axis, since the view takes the canvas's shape
// and is not square. Anything less means the icon got cut off by a pan.
const visible = ([x, y, w, h]) => {
  const ox = Math.min(x + w, 24) - Math.max(x, 0);
  const oy = Math.min(y + h, 24) - Math.max(y, 0);
  return { ox, oy, needX: Math.min(w, 24), needY: Math.min(h, 24) };
};
const whole = (v) => v.ox >= v.needX - 1e-6 && v.oy >= v.needY - 1e-6;
const box = await p.locator('.canvas').boundingBox();
const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

// -- Open ------------------------------------------------------------------
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16"/></svg>`;
await p.setInputFiles('input[type=file]', { name: 'test-square.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(SVG) });
await p.waitForTimeout(250);
const code = await p.locator('.code-input').inputValue();
ok('Open loads a file into the document', code.includes('<rect'), code.split('\n').find((l) => l.includes('rect'))?.trim());
ok('Open names the document from the file', (await p.locator('.readout').last().textContent()).includes('Open'));

// Open and Save live at the head of the dock, not in the toolbar, and no
// section can fold them away.
const fileBar = await p.evaluate(() => {
  const bar = document.querySelector('.file-bar');
  const dock = document.querySelector('.dock').getBoundingClientRect();
  const r = bar?.getBoundingClientRect();
  return {
    inDock: Boolean(bar?.closest('.dock')),
    atTop: r ? Math.abs(r.top - dock.top) < 1 : false,
    inToolbar: [...document.querySelectorAll('.toolbar button')].some((b) => /Open|Save/.test(b.textContent)),
    notASection: !bar?.closest('.panel') && !bar?.querySelector('[aria-expanded]'),
  };
});
ok('Open and Save sit at the top of the dock, not in the toolbar', fileBar.inDock && fileBar.atTop && !fileBar.inToolbar && fileBar.notASection, JSON.stringify(fileBar));

// -- Save ------------------------------------------------------------------
const dl = p.waitForEvent('download', { timeout: 5000 }).catch(() => null);
await p.getByRole('button', { name: 'Save' }).click();
const got = await dl;
ok('Save downloads an .svg', Boolean(got) && got.suggestedFilename().endsWith('.svg'), got?.suggestedFilename());

// -- zoom buttons ----------------------------------------------------------
// They float over the canvas, not in the toolbar, and nothing covers them —
// zoom in the bottom-left corner, Grid and Keylines in the top-left, Undo
// and Redo in the top-right.
const float = await p.evaluate(() => {
  const c = document.querySelector('.col-canvas').getBoundingClientRect();
  const find = (name) =>
    document.querySelector(`[aria-label="${name}"]`) ??
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === name);
  return ['Zoom in', 'Zoom out', 'Grid', 'Keylines', 'Undo', 'Redo'].map((name) => {
    const b = find(name);
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      name,
      inCanvas: r.left >= c.left && r.right <= c.right && r.top >= c.top && r.bottom <= c.bottom,
      onTop: top === b || b.contains(top),
      inToolbar: Boolean(b.closest('.toolbar')),
    };
  });
});
ok('the zoom and view buttons sit over the canvas, on top', float.every((f) => f.inCanvas && f.onTop && !f.inToolbar), JSON.stringify(float));
const corners = await p.evaluate(() => {
  const c = document.querySelector('.col-canvas').getBoundingClientRect();
  const r = (sel) => document.querySelector(sel).getBoundingClientRect();
  const top = r('.canvas-controls-top-left');
  const right = r('.canvas-controls-top-right');
  const bottom = r('.canvas-controls-bottom-left');
  return {
    topLeft: top.left - c.left < 40 && top.top - c.top < 40,
    topRight: c.right - right.right < 40 && right.top - c.top < 40,
    bottomLeft: bottom.left - c.left < 40 && c.bottom - bottom.bottom < 40,
  };
});
const status = await p.evaluate(() => {
  const read = document.querySelector('.readouts')?.getBoundingClientRect();
  const undoBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Undo');
  const undo = undoBtn.getBoundingClientRect();
  const corner = undoBtn.closest('.canvas-controls').getBoundingClientRect();
  return {
    inCanvas: Boolean(document.querySelector('.readouts')?.closest('.col-canvas')),
    inToolbar: document.querySelectorAll('.toolbar .readout').length > 0,
    above: read ? read.bottom <= undo.top + 1 : false,
    flushRight: read ? Math.abs(read.right - corner.right) < 1 : false,
  };
});
ok('the status sits above Undo and Redo, not in the toolbar', status.inCanvas && !status.inToolbar && status.above && status.flushRight, JSON.stringify(status));
ok('view toggles top-left, history top-right, zoom bottom-left', corners.topLeft && corners.topRight && corners.bottomLeft, JSON.stringify(corners));
const gridBtn = p.getByRole('button', { name: 'Grid', exact: true });
const pressed = await gridBtn.getAttribute('aria-pressed');
await gridBtn.click();
ok('Grid still toggles from the canvas', (await gridBtn.getAttribute('aria-pressed')) !== pressed);
await gridBtn.click();
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
ok('the icon is still on screen at max zoom', whole(tight), JSON.stringify(tight));

// -- drag to pan -----------------------------------------------------------
const drag = async (dx, dy) => {
  await p.mouse.move(mid.x - dx / 2, mid.y - dy / 2);
  await p.mouse.down();
  await p.mouse.move(mid.x + dx / 2, mid.y + dy / 2, { steps: 20 });
  await p.mouse.up();
};

// At fit the whole icon is already on screen, so a drag must do nothing —
// that is the point of the clamp, not a broken gesture.
await p.getByRole('button', { name: 'Fit' }).click();
const atFit = await vb();
await drag(600, 600);
ok('dragging at fit does nothing — there is nowhere to go', (await vb()).join(' ') === atFit.join(' '), atFit.join(' '));

// Zoomed in there is somewhere to go, and the drag has to get there.
await p.getByRole('button', { name: 'Zoom in' }).click();
await p.getByRole('button', { name: 'Zoom in' }).click();
const start = await vb();
await drag(600, 600);
const panned = await vb();
ok('dragging empty canvas pans the view when zoomed in', panned[0] !== start[0] || panned[1] !== start[1], `${start.join(' ')} -> ${panned.join(' ')}`);

// -- cannot lose the object ------------------------------------------------
for (const [dx, dy] of [[3000, 3000], [-3000, -3000], [3000, -3000], [-3000, 3000]]) {
  await p.mouse.move(mid.x, mid.y);
  await p.mouse.down();
  await p.mouse.move(mid.x + dx, mid.y + dy, { steps: 30 });
  await p.mouse.up();
  const v = visible(await vb());
  ok(`a ${dx},${dy} shove cannot cut the icon off`, whole(v), JSON.stringify(v));
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
// The grabbing hand is for a pan in flight, not for a press that may yet
// turn out to be a click.
const grabbing = () => p.evaluate(() => getComputedStyle(document.querySelector('.canvas')).cursor);
await p.mouse.move(box.x + box.width - 12, box.y + box.height - 12);
ok('the empty canvas shows the plain arrow', (await grabbing()) === 'default', await grabbing());
await p.mouse.down();
ok('pressing without moving shows no hand', (await grabbing()) === 'default', await grabbing());
await p.mouse.move(box.x + 160, box.y + 160, { steps: 12 });
ok('a real drag shows the grabbing hand', (await grabbing()) === 'grabbing', await grabbing());
await p.mouse.up();
ok('and it goes once the drag ends', (await grabbing()) === 'default', await grabbing());
ok('dragging the background keeps the selection', (await p.locator('.element-list .row-wrap.is-selected').count()) === 1);
await p.mouse.click(box.x + box.width - 12, box.y + box.height - 12);
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

// -- applying as you type --------------------------------------------------
// Whatever parses goes straight through; whatever does not stays as typed,
// with the canvas on the last good version and a Revert to get back to it.
const input = p.locator('.code-input');
const rows = () => p.locator('.element-list .row').count();
const TWO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="4" y1="4" x2="20" y2="20"/><circle cx="12" cy="12" r="4"/></svg>';
const THREE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="4" y1="4" x2="20" y2="20"/><circle cx="12" cy="12" r="4"/><circle cx="6" cy="18" r="2"/></svg>';
await input.focus();
await input.fill(TWO);
await p.waitForTimeout(250);
ok('a valid edit applies without leaving the box', (await rows()) === 2, `${await rows()} rows`);
ok('and the text is not reformatted under the caret', (await input.inputValue()) === TWO);
await input.fill(THREE);
await p.waitForTimeout(250);
ok('the next edit applies too', (await rows()) === 3);
await input.fill(THREE.replace('<circle cx="6"', '<circle cx="6'));
await p.waitForTimeout(250);
ok('broken text says it is not applied', await p.getByText('not applied').isVisible());
ok('the canvas keeps the last good version', (await rows()) === 3);
ok('the broken text is left as typed', (await input.inputValue()).includes('cx="6 cy'));
await p.getByRole('button', { name: 'Revert' }).click();
ok('Revert puts the text back to match the canvas', !(await p.getByText('not applied').isVisible()) && (await input.inputValue()).includes('cx="6"'));
ok('Revert does not touch the document', (await rows()) === 3);
ok('leaving the box tidies the text', (await input.inputValue()).includes('\n'));
await p.getByRole('button', { name: 'Undo' }).click();
ok('the whole run of typing is one undo', (await rows()) === 1, `${await rows()} rows`);

// -- dock sections ---------------------------------------------------------
// One column, three sections. Open ones split the height; a shut one is its
// head alone and gives its share back.
const sectionH = () =>
  p.evaluate(() =>
    Object.fromEntries(
      ['elements', 'code', 'conformance'].map((k) => [
        k,
        Math.round(document.querySelector(`.dock > .panel-${k}`).getBoundingClientRect().height),
      ]),
    ),
  );
ok('there is no right-hand column', (await p.locator('.col-right').count()) === 0);
ok('the element list no longer carries the shortcut list', (await p.locator('.panel-elements .hint').count()) === 0);
ok('Shortcuts is its own section, shut to start', !(await p.locator('.panel-shortcuts .hint').isVisible()));
await p.getByRole('button', { name: 'Shortcuts', exact: true }).click();
ok('opening it shows the list', await p.locator('.panel-shortcuts .hint').isVisible());
ok('it lists undo', (await p.locator('.panel-shortcuts .hint').textContent()).includes('undo'));
await p.getByRole('button', { name: 'Shortcuts', exact: true }).click();
const h0 = await sectionH();
ok('elements and SVG share the height evenly', Math.abs(h0.elements - h0.code) <= 2, JSON.stringify(h0));
await p.getByRole('button', { name: 'SVG', exact: true }).click();
ok('shutting a section hides its body', !(await p.locator('.code-input').isVisible()));
const h1 = await sectionH();
await p.getByRole('button', { name: 'Elements', exact: true }).click();
ok('Open and Save stay with every section shut', (await p.getByRole('button', { name: 'Open', exact: true }).isVisible()) && (await p.getByRole('button', { name: 'Save', exact: true }).isVisible()));
await p.getByRole('button', { name: 'Elements', exact: true }).click();
ok('the open section takes the space back', h1.elements > h0.elements + 100, JSON.stringify(h1));
await p.getByRole('button', { name: 'Copy' }).click();
const shutClip = await p.evaluate(() => navigator.clipboard.readText());
ok('a shut section keeps its head controls', shutClip.includes('<svg') && (await p.locator('.btn-copy').textContent()) === 'Copied');
await p.getByRole('button', { name: 'Lucide conformance' }).click();
const h2 = await sectionH();
ok('two open sections split the height', Math.abs(h2.elements - h2.conformance) <= 2, JSON.stringify(h2));
await p.getByRole('button', { name: 'SVG', exact: true }).click();
const h3 = await sectionH();
ok('three open sections split it three ways', Math.max(h3.elements, h3.code, h3.conformance) - Math.min(h3.elements, h3.code, h3.conformance) <= 2, JSON.stringify(h3));
await p.getByRole('button', { name: 'Lucide conformance' }).click();

// -- resizing the dock -----------------------------------------------------
// No collapsing: the seam drags the dock wider or narrower instead.
ok('there is no collapse control', (await p.locator('.edge-toggle').count()) === 0);
const seam = p.getByRole('separator', { name: 'Resize the side panel' });
const dockW = () => p.evaluate(() => Math.round(document.querySelector('.col-dock').getBoundingClientRect().width));
const canvasW = () => p.evaluate(() => Math.round(document.querySelector('.col-canvas').getBoundingClientRect().width));
const w0 = await dockW();
const c0 = await canvasW();
// Grabs the seam wherever it is now and drags it by dx.
const dragSeam = async (dx) => {
  const sb = await seam.boundingBox();
  const x = sb.x + sb.width / 2;
  const y = sb.y + sb.height / 2;
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x + dx, y, { steps: 6 });
  await p.mouse.up();
};
await dragSeam(150);
const w1 = await dockW();
ok('dragging the seam right widens the dock', Math.abs(w1 - (w0 + 150)) <= 2, `${w0} -> ${w1}`);
ok('the canvas gives up the same width', Math.abs((c0 - (await canvasW())) - (w1 - w0)) <= 2);

await dragSeam(-400);
ok('dragging it left narrows the dock, but not past its minimum', (await dockW()) === 220, `${await dockW()}`);

await dragSeam(1150);
ok('the canvas keeps its share however far it is dragged', (await canvasW()) >= 360 && (await dockW()) <= 720, `${await dockW()}px dock, ${await canvasW()}px canvas`);

await seam.dblclick();
ok('a double click puts the width back', Math.abs((await dockW()) - w0) <= 1, `${await dockW()} vs ${w0}`);

await seam.focus();
await p.keyboard.press('ArrowRight');
ok('the arrow keys move it too', (await dockW()) === w0 + 16, `${await dockW()}`);
await p.keyboard.press('ArrowLeft');
ok('and back', (await dockW()) === w0);
ok('the seam is labelled with its width', Number(await seam.getAttribute('aria-valuenow')) === w0);

// -- a portrait window is not a wall of chrome -----------------------------
await p.setViewportSize({ width: 760, height: 1080 });
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('.canvas');
const narrow = await p.evaluate(() => ({
  hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  clipped: document.querySelector('.toolbar').scrollWidth > document.querySelector('.toolbar').clientWidth + 1,
  canvas: Math.round(document.querySelector('.col-canvas').getBoundingClientRect().width),
}));
ok('it has no horizontal page scroll', !narrow.hScroll);
ok('the toolbar is not clipped', !narrow.clipped);
ok('the canvas keeps a usable share', narrow.canvas >= 360, `${narrow.canvas}px`);
ok('the toolbar prints no zoom figure', (await p.locator('.toolbar [data-zoom]').count()) === 0);

// -- align buttons ---------------------------------------------------------
// Only there with a selection, and they move only what is selected.
await p.setViewportSize({ width: 1440, height: 900 });
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('.canvas');
const alignGroup = p.getByRole('group', { name: 'Align selection' });
ok('no align buttons without a selection', (await alignGroup.count()) === 0);
// The seed's second element is the check mark, m16 9-5.5 5.5L8 12: y 9..14.5.
// The serializer may write it relative or absolute, so match either.
await p.locator('.element-list .row-main').nth(1).click();
ok('selecting shows them', await alignGroup.isVisible());
const src = () => p.locator('.code-input').inputValue();
await alignGroup.getByRole('button', { name: 'Top' }).click();
ok('Top lifts the selection to the padding', /[mM]16 2[ -]/.test(await src()), (await src()).match(/<path[^>]*>/)?.[0]);
ok('and leaves the rest where it was', (await src()).includes('cx="12" cy="12" r="10"'));
await alignGroup.getByRole('button', { name: 'Bottom' }).click();
ok('Bottom drops it to the padding', /[mM]16 16\.5[ -]/.test(await src()), (await src()).match(/<path[^>]*>/)?.[0]);
await alignGroup.getByRole('button', { name: 'Center' }).click();
ok('Center brings it back to the middle', /[mM]16 9\.5[ -]/.test(await src()), (await src()).match(/<path[^>]*>/)?.[0]);
ok('the selection survives each move', await alignGroup.isVisible());
await p.keyboard.press('Escape');
ok('clearing the selection hides them again', (await alignGroup.count()) === 0);

// -- naming elements -------------------------------------------------------
// A name is typed in the inspector, shows in the list, and travels in the
// file as data-name — so an edit in the SVG panel keeps it.
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('.canvas');
await p.locator('.element-list .row-twist').first().click();
const nameField = p.locator('.insp-name input');
ok('an element has a name field', await nameField.isVisible());
ok('which suggests what it would replace', (await nameField.getAttribute('placeholder')) === 'circle');
await nameField.fill('face ring');
ok('the list shows the name', (await p.locator('.element-list .label').first().textContent()).startsWith('face ring'));
ok('and still says what kind of shape it is', (await p.locator('.element-list .label-kind').first().textContent()) === 'circle');
await nameField.blur();
ok('the name is written to the SVG', (await p.locator('.code-input').inputValue()).includes('<circle data-name="face ring"'));
const named = await p.locator('.code-input').inputValue();
await p.locator('.code-input').fill(named.replace('r="10"', 'r="9"'));
await p.locator('.code-input').blur();
await p.waitForTimeout(300);
ok('an edit in the SVG panel keeps the name', (await p.locator('.element-list .label').first().textContent()).startsWith('face ring'));
// The panel edit re-imports the document, so the row comes back shut.
await p.locator('.element-list .row-twist').first().click();
await p.locator('.insp-name input').fill('');
await p.locator('.insp-name input').blur();
ok('clearing the field removes the name', !(await p.locator('.code-input').inputValue()).includes('data-name'));

ok('no console errors', errs.length === 0, errs.join(' | '));
console.log(fails === 0 ? '\nall checks passed' : `\n${fails} FAILED`);
await b.close();
process.exit(fails === 0 ? 0 : 1);
