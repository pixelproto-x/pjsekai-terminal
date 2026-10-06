import { chromium } from 'playwright';

const errors = [];
const pageErrors = [];
const failedRequests = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});

page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', err => pageErrors.push(err.stack || err.message));
page.on('response', response => {
  if (response.status() >= 400) {
    failedRequests.push({ status: response.status(), url: response.url() });
  }
});

await page.goto('http://127.0.0.1:4173/', {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});

for (const asset of ['dojo-musics.json', 'dojo-difficulties.json']) {
  const response = await page.request.get('http://127.0.0.1:4173/' + asset);
  if (!response.ok()) {
    throw new Error(
      'Committed Dojo static asset missing: ' + asset + ' HTTP ' + response.status()
    );
  }
}

const vocalResponse = await page.request.get('http://127.0.0.1:4173/dojo-vocals.json');
const hasCommittedVocals = vocalResponse.ok();

await page.locator('nav.bottom-bar button.tab[data-go="songs"]').click();
await page.waitForSelector('.page[data-page="songs"].active', {
  state: 'visible',
  timeout: 10000,
});
await page.waitForSelector('#dojoSongList .dojo-song', {
  state: 'visible',
  timeout: 30000,
});

const dojoPage = await page.evaluate(() => ({
  songsPage: !!document.querySelector('.page[data-page="songs"].active'),
  songList: document.querySelectorAll('#dojoSongList .dojo-song').length,
  iframe: !!document.querySelector('#dojoSonolusIframe'),
  iframeShell: !!document.querySelector('#dojoFrameShell'),
  bridgeStatus: !!document.querySelector('#dojoBridgeStatus'),
  practiceControls: !!document.querySelector('#dojoLoopA') &&
    !!document.querySelector('#dojoLoopB') &&
    !!document.querySelector('#dojoLoopToggle') &&
    !!document.querySelector('#dojoPracticeResetBtn'),
  analyzer: !!document.querySelector('#chartAnalyzerMount'),
}));
if (!dojoPage.songsPage || !dojoPage.iframe || !dojoPage.iframeShell || !dojoPage.practiceControls) {
  throw new Error('Current Dojo page structure is incomplete: ' + JSON.stringify(dojoPage));
}
if (dojoPage.songList <= 0) {
  throw new Error('Current Dojo song database rendered no songs');
}

const localSongs = await page.locator('#dojoSongList .dojo-song').count();
if (localSongs <= 0) throw new Error('Dojo song database is empty');

await page.locator('#dojoDifficultyFilter').selectOption('Expert');
await page.waitForTimeout(150);
const expertCount = await page.locator('#dojoSongList .dojo-song').count();
if (expertCount <= 0) throw new Error('Expert difficulty filter returned no songs');

await page.locator('#dojoSongSearch').fill('Tell Your World');
await page.waitForTimeout(250);
const tellCount = await page.locator('#dojoSongList .dojo-song').count();
if (tellCount <= 0) throw new Error('Tell Your World search returned no songs');

await page.locator('#dojoClearSearch').click();
const cleared = await page.locator('#dojoSongSearch').inputValue();
if (cleared !== '') throw new Error('Clear search did not clear the input');

await page.locator('#dojoSongSearch').fill('Tell Your World');
await page.waitForTimeout(250);
await page.locator('#dojoSongList .dojo-song').first().click();
await page.waitForTimeout(200);

const selected = await page.evaluate(() => ({
  title: document.querySelector('#dojoSelectedTitle')?.textContent?.trim() || '',
  difficulty: document.querySelector('#dojoSelectedDifficulty')?.textContent?.trim() || '',
  difficultyButtons: document.querySelectorAll('#dojoDifficultyButtons [data-dojo-diff]').length,
  notes: document.querySelector('#dojoSelectedNotes')?.textContent?.trim() || '',
}));
if (!selected.title.toLowerCase().includes('tell your world')) {
  throw new Error('Song selection did not update: ' + JSON.stringify(selected));
}
if (selected.difficultyButtons <= 0) {
  throw new Error('Selected song rendered no difficulty buttons');
}

const expertButton = page.locator('#dojoDifficultyButtons [data-dojo-diff="Expert"]');
if (await expertButton.count()) {
  await expertButton.click();
  await page.waitForTimeout(100);
}

const iframe = page.locator('#dojoSonolusIframe');
await page.locator('#dojoOpenPracticeBtn').click();

await page.waitForFunction(
  () => {
    const frame = document.querySelector('#dojoSonolusIframe');
    return !!frame && !!frame.src && frame.src.includes('/sonolus-web/');
  },
  null,
  { timeout: 10000 }
);

const iframeUrl = await iframe.getAttribute('src');
if (!iframeUrl || !iframeUrl.includes('/sonolus-web/')) {
  throw new Error('Dojo did not load the local Sonolus iframe: ' + iframeUrl);
}

await page.waitForFunction(
  () => {
    const frame = document.querySelector('#dojoSonolusIframe');
    try {
      return !!frame?.contentWindow?.__pjPracticeRuntime;
    } catch (_) {
      return false;
    }
  },
  null,
  { timeout: 30000 }
);

const runtimeInfo = await page.evaluate(() => {
  const frame = document.querySelector('#dojoSonolusIframe');
  const r = frame?.contentWindow?.__pjPracticeRuntime;
  return {
    exists: !!r,
    methods: {
      getTime: typeof r?.getTime === 'function',
      getDuration: typeof r?.getDuration === 'function',
      seek: typeof r?.seek === 'function',
      setRate: typeof r?.setRate === 'function',
      reset: typeof r?.reset === 'function',
    },
  };
});
for (const [name, ok] of Object.entries(runtimeInfo.methods)) {
  if (!ok) throw new Error('Current local Sonolus runtime is missing ' + name);
}

const initialBridge = await page.evaluate(() => ({
  src: document.querySelector('#dojoSonolusIframe')?.getAttribute('src') || '',
  status: document.querySelector('#dojoBridgeStatus')?.textContent?.trim() || '',
  log: document.querySelector('#dojoApiLog')?.textContent?.trim() || '',
}));
if (!initialBridge.src.includes('/sonolus-web/')) {
  throw new Error('Local Sonolus iframe source is invalid: ' + JSON.stringify(initialBridge));
}

const duration = await page.evaluate(() => {
  const frame = document.querySelector('#dojoSonolusIframe');
  return Number(frame?.contentWindow?.__pjPracticeRuntime?.getDuration?.() || 0);
});
if (!(duration > 0)) {
  throw new Error('Local Sonolus runtime reported no playable duration: ' + duration);
}

const speedRange = page.locator('#dojoSpeedRange');
await speedRange.fill('8.5');
await page.waitForTimeout(100);
const speedState = await page.evaluate(() => ({
  value: document.querySelector('#dojoSpeedRange')?.value || '',
  label: document.querySelector('#dojoSpeedValue')?.textContent?.trim() || '',
}));
if (speedState.value !== '8.5' || speedState.label !== '8.5') {
  throw new Error('Dojo Note Speed control did not update: ' + JSON.stringify(speedState));
}

const mirror = page.locator('#dojoToggle_mirror');
const mirrorBefore = await mirror.getAttribute('aria-pressed');
await mirror.click();
const mirrorAfter = await mirror.getAttribute('aria-pressed');
if (mirrorBefore === mirrorAfter) {
  throw new Error('Mirror toggle did not change state');
}
await mirror.click();
if ((await mirror.getAttribute('aria-pressed')) !== mirrorBefore) {
  throw new Error('Mirror toggle did not restore its original state');
}

const rateCheck = await page.evaluate(() => {
  const frame = document.querySelector('#dojoSonolusIframe');
  const r = frame?.contentWindow?.__pjPracticeRuntime;
  try {
    r?.setRate?.(0.75);
    return {
      value: Number(r?.getTime?.() || 0),
      ok: true,
    };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});
if (!rateCheck.ok) throw new Error('Local runtime setRate() failed: ' + JSON.stringify(rateCheck));

const seekCheck = await page.evaluate(() => {
  const frame = document.querySelector('#dojoSonolusIframe');
  const r = frame?.contentWindow?.__pjPracticeRuntime;
  try {
    r?.seek?.(0.5);
    const time = Number(r?.getTime?.() || 0);
    return { ok: Math.abs(time - 0.5) < 0.35, time };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});
if (!seekCheck.ok) {
  throw new Error('Local runtime seek() failed: ' + JSON.stringify(seekCheck));
}

await page.locator('#dojoPracticeResetBtn').click();
await page.waitForTimeout(150);
const resetCheck = await page.evaluate(() => {
  const frame = document.querySelector('#dojoSonolusIframe');
  const r = frame?.contentWindow?.__pjPracticeRuntime;
  return {
    time: Number(r?.getTime?.() || 0),
    duration: Number(r?.getDuration?.() || 0),
  };
});
if (resetCheck.time > 0.35) {
  throw new Error('Practice reset did not return near the beginning: ' + JSON.stringify(resetCheck));
}

const loopToggle = page.locator('#dojoLoopToggle');
const loopBefore = await loopToggle.getAttribute('aria-pressed');
await loopToggle.click();
const loopAfter = await loopToggle.getAttribute('aria-pressed');
if (loopBefore === loopAfter) {
  throw new Error('A-B loop toggle did not change state');
}
await loopToggle.click();
if ((await loopToggle.getAttribute('aria-pressed')) !== loopBefore) {
  throw new Error('A-B loop toggle did not restore its original state');
}

await page.evaluate(() => document.querySelector('#dojoOpenServerWebBtn')?.blur());
await page.waitForTimeout(100);

const criticalFailures = failedRequests.filter(({ url }) =>
  url.startsWith('http://127.0.0.1:4173/') ||
  url.includes('assets.unipjsk.com/startapp/music/music_score/') ||
  url.includes('assets.unipjsk.com/ondemand/music/long/') ||
  url.includes('cdn.jsdelivr.net/gh/pjsek-ai/pjsekai-web@master/public/images/song/chart/')
);

if (pageErrors.length || criticalFailures.length) {
  throw new Error(
    'Browser errors:\n' +
    errors.join('\n') +
    '\nPage errors:\n' +
    pageErrors.join('\n') +
    '\nCritical resource failures:\n' +
    criticalFailures.map(x => x.status + ' ' + x.url).join('\n') +
    '\nAll failed requests:\n' +
    failedRequests.map(x => x.status + ' ' + x.url).join('\n')
  );
}

console.log(JSON.stringify({
  PASS: true,
  dojoPage,
  localSongs,
  expertCount,
  tellCount,
  selected,
  hasCommittedVocals,
  iframeUrl,
  runtimeInfo,
  initialBridge,
  duration,
  speedState,
  seekCheck,
  resetCheck,
  errors,
  pageErrors,
  failedRequests,
}, null, 2));

await browser.close();
