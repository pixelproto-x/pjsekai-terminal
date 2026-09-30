import { chromium } from 'playwright';

const errors = [];
const pageErrors = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => pageErrors.push(err.message));

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.locator('nav.bottom-bar button.tab[data-go="songs"]').click();
await page.waitForSelector('#dojoGameCard', { state: 'visible', timeout: 30000 });
await page.waitForSelector('#dojoGameCanvas', { state: 'visible', timeout: 30000 });
await page.waitForFunction(() => {
  const p = window.__PJSEKAI_DOJO__;
  return !!p?.state?.prepared && Array.isArray(p.state.prepared.notes) && p.state.prepared.notes.length > 0;
}, null, { timeout: 45000 });
await page.waitForTimeout(250);

const before = await page.evaluate(() => {
  const p = window.__PJSEKAI_DOJO__;
  return {
    pixi: !!window.PIXI,
    prepared: !!p?.state?.prepared,
    title: p?.state?.prepared?.music?.title || '',
    difficulty: p?.state?.prepared?.difficulty || '',
    audioUrl: p?.state?.prepared?.audioUrl || '',
    notes: p?.state?.prepared?.notes?.length || 0,
    canvasWidth: document.querySelector('#dojoGameCanvas')?.clientWidth || 0,
    canvasHeight: document.querySelector('#dojoGameCanvas')?.clientHeight || 0
  };
});
if (!before.pixi) throw new Error('PixiJS did not load');
if (!before.prepared) throw new Error('Default chart was not prepared');
if (!before.notes) throw new Error('Prepared chart contains no playable notes');
if (!before.canvasWidth || !before.canvasHeight) throw new Error('Gameplay canvas has no rendered size');

await page.locator('#caSearch').fill('Tell Your World');
await page.waitForTimeout(300);
await page.locator('#caSongList [data-ca-song]').first().click();
await page.waitForTimeout(250);
await page.locator('#caDetail [data-ca-diff="expert"]').click();
await page.waitForTimeout(250);

const selected = await page.evaluate(() => ({
  title: document.querySelector('#caDetail .ca-detail-title h3')?.textContent?.trim() || '',
  difficulty: document.querySelector('#caDetail .ca-chip')?.textContent?.trim() || ''
}));
if (!selected.title.toLowerCase().includes('tell your world')) throw new Error('Song selection did not update');
if (selected.difficulty.toLowerCase() !== 'expert') throw new Error('Difficulty selection did not update');

await page.locator('#dojoOpenPracticeBtn').click();
await page.waitForFunction(() => window.__PJSEKAI_DOJO__?.state?.running === true, null, { timeout: 30000 });
await page.waitForTimeout(1800);

const runtimeBeforeInput = await page.evaluate(() => ({
  running: !!window.__PJSEKAI_DOJO__?.state?.running,
  currentTime: window.__PJSEKAI_DOJO__?.state?.audio?.currentTime || 0,
  score: window.__PJSEKAI_DOJO__?.state?.score || 0,
  combo: window.__PJSEKAI_DOJO__?.state?.combo || 0,
  audioReadyState: window.__PJSEKAI_DOJO__?.state?.audio?.readyState || 0
}));
if (!runtimeBeforeInput.running) throw new Error('Game did not enter running state');

for (let i = 0; i < 90; i++) {
  await page.keyboard.press(['KeyD','KeyF','KeyJ','KeyK'][i % 4]);
  await page.waitForTimeout(55);
}
const afterInput = await page.evaluate(() => ({
  score: window.__PJSEKAI_DOJO__?.state?.score || 0,
  combo: window.__PJSEKAI_DOJO__?.state?.combo || 0,
  judged: window.__PJSEKAI_DOJO__?.state?.judged || 0
}));
if (afterInput.judged <= 0 && afterInput.score <= 0 && afterInput.combo <= 0) {
  throw new Error('Keyboard input produced no judgement/score change');
}

await page.locator('#dojoOpenPracticeBtn').click();
await page.waitForTimeout(250);
if ((await page.locator('#dojoOpenPracticeBtn').textContent()).includes('暫停')) {
  throw new Error('Pause button did not change state');
}
await page.locator('#dojoOpenPracticeBtn').click();
await page.waitForFunction(() => window.__PJSEKAI_DOJO__?.state?.running === true, null, { timeout: 5000 });

await page.locator('details.dojo-extra').first().click();
await page.waitForTimeout(100);
const advanced = await page.locator('details.dojo-extra').first().textContent();
if (!advanced.includes('Note Speed') || !advanced.includes('Audio Offset')) throw new Error('Advanced settings did not expand');

if (errors.length || pageErrors.length) {
  throw new Error('Browser errors:\n' + errors.join('\n') + '\n' + pageErrors.join('\n'));
}

console.log(JSON.stringify({
  PASS: true,
  before,
  selected,
  runtimeBeforeInput,
  afterInput,
  errors,
  pageErrors
}, null, 2));

await browser.close();
