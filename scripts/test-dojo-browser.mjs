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
await page.waitForFunction(() => {
  const p = window.__PJSEKAI_DOJO__;
  return !!p?.state?.prepared && Array.isArray(p.state.prepared.notes) && p.state.prepared.notes.length > 0;
}, null, { timeout: 45000 });

const before = await page.evaluate(() => {
  const p = window.__PJSEKAI_DOJO__;
  return {
    prepared: !!p?.state?.prepared,
    title: p?.state?.prepared?.music?.title || '',
    difficulty: p?.state?.prepared?.difficulty || '',
    audioUrl: p?.state?.prepared?.audioUrl || '',
    notes: p?.state?.prepared?.notes?.length || 0,
    canvasWidth: document.querySelector('#dojoGameCanvas')?.clientWidth || 0,
    canvasHeight: document.querySelector('#dojoGameCanvas')?.clientHeight || 0
  };
});
if (!before.prepared || !before.notes) throw new Error('Default Dojo chart did not prepare: ' + JSON.stringify(before));
if (!before.canvasWidth || !before.canvasHeight) throw new Error('Dojo canvas has no rendered size: ' + JSON.stringify(before));

await page.locator('#dojoSongSearch').fill('Tell Your World');
await page.waitForTimeout(250);
await page.locator('#dojoSongList [data-dojo-local-song]').first().click();
await page.waitForTimeout(150);
await page.locator('#dojoDifficultyButtons [data-dojo-diff="expert"]').click();
await page.waitForTimeout(700);

const selected = await page.evaluate(() => ({
  title: document.querySelector('#dojoSelectedTitle')?.textContent?.trim() || '',
  difficulty: document.querySelector('#dojoDifficultyButtons .active')?.dataset?.dojoDiff || ''
}));
if (!selected.title.toLowerCase().includes('tell your world')) throw new Error('Song selection did not update: ' + JSON.stringify(selected));
if (selected.difficulty.toLowerCase() !== 'expert') throw new Error('Difficulty selection did not update: ' + JSON.stringify(selected));

await page.locator('#dojoOpenPracticeBtn').click();
await page.waitForFunction(() => window.__PJSEKAI_DOJO__?.state?.running === true, null, { timeout: 30000 });
await page.waitForTimeout(350);

const started = await page.evaluate(() => ({
  running: !!window.__PJSEKAI_DOJO__?.state?.running,
  audioPaused: !!window.__PJSEKAI_DOJO__?.state?.audio?.paused,
  currentTime: window.__PJSEKAI_DOJO__?.state?.audio?.currentTime || 0
}));
if (!started.running) throw new Error('Dojo did not enter running state: ' + JSON.stringify(started));

await page.locator('#dojoOpenPracticeBtn').click();
const paused = await page.evaluate(() => ({
  running: !!window.__PJSEKAI_DOJO__?.state?.running,
  audioPaused: !!window.__PJSEKAI_DOJO__?.state?.audio?.paused,
  label: document.querySelector('#dojoOpenPracticeBtn')?.textContent || ''
}));
if (paused.running || !paused.audioPaused || !paused.label.includes('繼續打歌')) {
  throw new Error('Pause state invalid: ' + JSON.stringify(paused));
}

await page.locator('#dojoOpenPracticeBtn').click();
await page.waitForFunction(() => window.__PJSEKAI_DOJO__?.state?.running === true, null, { timeout: 5000 });

const firstNotes = await page.evaluate(() => {
  const p = window.__PJSEKAI_DOJO__;
  const now = p.state.audio.currentTime || 0;
  return p.state.notes.filter(n => !n.judged && n.kind === 'tap' && n.hit > now + 0.1).slice(0, 8)
    .map(n => ({ lane: n.lane, hit: n.hit, now, key: ['D','F','J','K'][Math.min(3, Math.floor(n.lane / 3))] }));
});
for (const n of firstNotes) {
  await page.waitForTimeout(Math.max(0, Math.round((n.hit - (await page.evaluate(() => window.__PJSEKAI_DOJO__?.state?.audio?.currentTime || 0))) * 1000 - 12)));
  await page.keyboard.press('Key' + n.key);
}
await page.waitForTimeout(250);

const afterInput = await page.evaluate(() => ({
  score: window.__PJSEKAI_DOJO__?.state?.score || 0,
  combo: window.__PJSEKAI_DOJO__?.state?.combo || 0,
  judged: window.__PJSEKAI_DOJO__?.state?.judged || 0,
  running: !!window.__PJSEKAI_DOJO__?.state?.running
}));
if (afterInput.judged <= 0 && afterInput.score <= 0 && afterInput.combo <= 0) {
  throw new Error('Keyboard input produced no judgement/score change: ' + JSON.stringify(afterInput));
}

await page.locator('details.dojo-extra').first().click();
await page.waitForTimeout(100);
const advanced = await page.locator('details.dojo-extra').first().textContent();
if (!advanced.includes('Note Speed') || !advanced.includes('Audio Offset')) throw new Error('Advanced settings did not expand');
if (errors.length || pageErrors.length) throw new Error('Browser errors:\n' + errors.join('\n') + '\nPage errors:\n' + pageErrors.join('\n'));

console.log(JSON.stringify({ PASS: true, before, selected, started, paused, firstNotes, afterInput, errors, pageErrors }, null, 2));
await browser.close();