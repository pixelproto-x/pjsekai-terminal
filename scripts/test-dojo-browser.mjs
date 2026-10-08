import { chromium } from 'playwright';

const errors = [];
const pageErrors = [];
const failedLocalRequests = [];
const failedRequests = [];

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
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
    const item = { status: response.status(), url: response.url() };
    failedRequests.push(item);
    if (response.url().startsWith('http://127.0.0.1:4173/')) failedLocalRequests.push(item);
  }
});
page.on('requestfailed', request => {
  failedRequests.push({ status: 'FAILED', url: request.url(), error: request.failure()?.errorText || '' });
});

const fail = async message => {
  await browser.close();
  throw new Error(message);
};

await page.goto('http://127.0.0.1:4173/', {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});

for (const asset of ['dojo-musics.json', 'dojo-difficulties.json', 'dojo-vocals.json']) {
  const response = await page.request.get('http://127.0.0.1:4173/' + asset);
  if (!response.ok()) await fail('Committed Dojo static asset missing: ' + asset + ' HTTP ' + response.status());
}

const home = page.locator('.page[data-page="home"]');
if (!await home.isVisible()) await fail('Home page is not visible on initial load');

// Deep homepage layout audit: each independent column must expand without stretching its paired card.
const homePairs = [
  ['home-songs', 'home-sekai'],
  ['home-characters', 'home-cards'],
  ['home-events', 'home-tools'],
];
for (const [leftKey, rightKey] of homePairs) {
  const left = page.locator('.home-grid .app-card[data-home-sheet="' + leftKey + '"]');
  const right = page.locator('.home-grid .app-card[data-home-sheet="' + rightKey + '"]');
  if (!(await left.count()) || !(await right.count())) await fail('Missing homepage pair: ' + leftKey + ' / ' + rightKey);
  const before = await right.boundingBox();
  await left.evaluate(el => el.click());
  await page.locator('.home-grid .home-accordion-panel').waitFor({ state: 'visible', timeout: 5000 });
  const after = await right.boundingBox();
  if (!before || !after || Math.abs(after.height - before.height) > 2) {
    await fail('Paired homepage card stretched after opening ' + leftKey + ': ' + JSON.stringify({ before, after }));
  }
  await left.evaluate(el => el.click());
}
const cardsForDock = page.locator('.home-grid .app-card[data-home-sheet="home-cards"]');
const toolsForDock = page.locator('.home-grid .app-card[data-home-sheet="home-tools"]');
await page.evaluate(() => window.scrollTo(0, 0));
await cardsForDock.evaluate(el => el.click());
await page.locator('.home-grid .home-accordion-panel').waitFor({ state: 'visible', timeout: 5000 });
await page.waitForTimeout(650);
const dockAudit = await page.evaluate(() => {
  const dock = document.querySelector('nav.bottom-bar')?.getBoundingClientRect();
  const tools = document.querySelector('.home-grid .app-card[data-home-sheet="home-tools"]')?.getBoundingClientRect();
  const sc = document.scrollingElement || document.documentElement;
  const main = document.querySelector('main');
  return dock && tools ? {
    dockTop: dock.top,
    toolsBottom: tools.bottom,
    scrollY: window.scrollY,
    scroller: { tag: sc.tagName, scrollTop: sc.scrollTop, scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight },
    html: { scrollTop: document.documentElement.scrollTop, scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight },
    body: { scrollTop: document.body.scrollTop, scrollHeight: document.body.scrollHeight, clientHeight: document.body.clientHeight },
    main: main ? { paddingBottom: getComputedStyle(main).paddingBottom, scrollHeight: main.scrollHeight, clientHeight: main.clientHeight, rectBottom: main.getBoundingClientRect().bottom } : null
  } : null;
});
if (!dockAudit || dockAudit.toolsBottom > dockAudit.dockTop - 8) {
  await fail('Homepage Tools card still overlaps fixed Dock after Cards expansion: ' + JSON.stringify(dockAudit));
}
await cardsForDock.evaluate(el => el.click());

// Strategy Calculator deep checks.
await page.locator('nav.bottom-bar button.tab[data-go="tools"]').evaluate(el => el.click());
await page.waitForSelector('.page[data-page="tools"].active', { state: 'visible', timeout: 10000 });
const setInput = async (id, value) => page.locator('#' + id).evaluate((el, v) => {
  el.value = String(v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, value);
for (const [id, value] of [
  ['scTargetPoints', 100000], ['scCurrentPoints', 25000], ['scBasePoints', 1500],
  ['scBonusPct', 250], ['scBoostPerRun', 5], ['scRunSeconds', 180], ['scCurrentBoost', 10], ['scDrinkRestore', 10]
]) await setInput(id, value);
const strategyResult = await page.evaluate(() => Object.fromEntries(
  ['scGapPoints','scRuns','scBoostNeeded','scDrinks','scPointsPerRun','scEventTime','scBoostRemain','scOver']
    .map(id => [id, document.getElementById(id)?.textContent?.trim() || ''])
));
if (!strategyResult.scGapPoints || Number(strategyResult.scGapPoints.replace(/,/g,'')) !== 75000 ||
    Number(strategyResult.scRuns.replace(/,/g,'')) <= 0 ||
    Number(strategyResult.scPointsPerRun.replace(/,/g,'')) <= 0) {
  await fail('Strategy event calculator returned invalid results: ' + JSON.stringify(strategyResult));
}
if (document.querySelector('#scStaminaCurrent')) {
  await setInput('scStaminaCurrent', 2);
  await setInput('scStaminaMinutes', 1);
  await setInput('scStaminaTarget', 5);
  await page.locator('#scStaminaStartBtn').evaluate(el => el.click());
  await page.waitForTimeout(120);
  await page.locator('#scStaminaStopBtn').evaluate(el => el.click());
}


// Chart Analyzer deep checks.
await page.locator('nav.bottom-bar button.tab[data-go="songs"]').evaluate(el => el.click());
await page.waitForSelector('.page[data-page="songs"].active', { state: 'visible', timeout: 10000 });
await page.waitForFunction(() => {
  const el = document.querySelector('#caCount');
  return el && Number((el.textContent || '').replace(/[^0-9]/g, '')) > 0;
}, null, { timeout: 25000 });
const chartInitialCount = await page.locator('#caCount').textContent();
if (!/\d/.test(chartInitialCount || '')) await fail('Chart Analyzer has no default songs');
await setInput('caMaxLevel', '');
await page.waitForTimeout(100);
const blankMaxCount = await page.locator('#caCount').textContent();
if (Number((blankMaxCount || '').replace(/[^0-9]/g,'')) <= 0) await fail('Chart Analyzer blank Lv upper bound filtered all songs');
const chartSong = page.locator('#caSongList [data-ca-song]').first();
await chartSong.evaluate(el => el.click());
await page.waitForSelector('#caDetail .ca-detail-metrics', { state: 'visible', timeout: 10000 });
const chartDetail = await page.evaluate(() => ({
  text: document.querySelector('#caDetail')?.innerText || '',
  metrics: document.querySelector('.ca-detail-metrics')?.innerText || ''
}));
if (/Invalid Date|undefined/.test(chartDetail.text) || !/Notes\s*\d/.test(chartDetail.metrics)) {
  await fail('Chart Analyzer detail contains invalid/missing metadata: ' + JSON.stringify(chartDetail));
}

// Cover proxy / ORB audit: verify the rendered jackets point at the proxy and the
// proxy really returns image data from the browser test environment.
await page.waitForTimeout(600);
const coverUrls = await page.evaluate(() => [...document.querySelectorAll('#caSongList .ca-jacket')]
  .slice(0, 12)
  .map(el => {
    const bg = getComputedStyle(el).backgroundImage || '';
    const m = bg.match(/url\(["']?(.*?)["']?\)/);
    return m ? m[1] : '';
  })
  .filter(Boolean));
if (!coverUrls.length) {
  await fail('Chart Analyzer rendered no jacket background images for proxy audit');
}
if (!coverUrls.every(url => /wsrv\.nl/i.test(url))) {
  await fail('Chart Analyzer cover images are not consistently using the proxy: ' + JSON.stringify(coverUrls));
}
const coverProbe = [];
for (const url of [...new Set(coverUrls)]) {
  const response = await page.request.get(url);
  const contentType = response.headers()['content-type'] || '';
  coverProbe.push({status: response.status(), contentType, url});
  if (!response.ok() || !/^image\//i.test(contentType) || /^image\/svg\+xml$/i.test(contentType)) {
    await fail('Chart Analyzer cover proxy returned fallback/non-cover image: ' + JSON.stringify(coverProbe.at(-1)));
  }
}
if (errors.some(e => /ERR_BLOCKED_BY_ORB|blocked by ORB|ORB/i.test(e))) {
  await fail('Chart Analyzer cover audit detected ORB errors: ' + JSON.stringify(errors.filter(e => /ORB/i.test(e))));
}

// Return home before the secondary homepage regression checks.
await page.locator('#homeBrand').evaluate(el => el.click());
await page.waitForSelector('.page[data-page="home"].active', { state: 'visible', timeout: 10000 });
await page.evaluate(() => window.scrollTo(0, 0));

// Homepage accordion regression test: expanding Characters must not stretch the Cards card.
const characterCard = page.locator('.home-grid .app-card[data-home-sheet="home-characters"]');
const cardsCard = page.locator('.home-grid .app-card[data-home-sheet="home-cards"]');
if (!(await characterCard.count()) || !(await cardsCard.count())) {
  await fail('Homepage Character/Cards accordion cards are missing');
}
const cardsBefore = await cardsCard.evaluate(el => {
  const r = el.getBoundingClientRect();
  return { height: r.height, top: r.top, bottom: r.bottom };
});
await characterCard.click();
await page.locator('.home-grid .home-accordion-panel').waitFor({ state: 'visible', timeout: 5000 });
const accordionAfterCharacters = await page.evaluate(() => {
  const character = document.querySelector('.home-grid .app-card[data-home-sheet="home-characters"]');
  const cards = document.querySelector('.home-grid .app-card[data-home-sheet="home-cards"]');
  const characterFeature = character?.closest('.home-feature');
  const cardsFeature = cards?.closest('.home-feature');
  const rect = el => {
    const r = el?.getBoundingClientRect();
    return r ? { height: r.height, top: r.top, bottom: r.bottom } : null;
  };
  return {
    characterClass: character?.className || '',
    cardsClass: cards?.className || '',
    characterRect: rect(character),
    cardsRect: rect(cards),
    characterFeatureRect: rect(characterFeature),
    cardsFeatureRect: rect(cardsFeature),
  };
});
if (!accordionAfterCharacters.characterClass.includes('home-card-expanded')) {
  await fail('Characters card did not enter home-card-expanded state');
}
if (accordionAfterCharacters.cardsClass.includes('home-card-expanded')) {
  await fail('Cards card was also marked home-card-expanded when Characters opened');
}
if (!accordionAfterCharacters.cardsRect || Math.abs(accordionAfterCharacters.cardsRect.height - cardsBefore.height) > 2) {
  await fail('Cards card height changed after opening Characters: ' + JSON.stringify({ cardsBefore, accordionAfterCharacters }));
}

// Clicking a generated child action must navigate only; it must not toggle the parent card again.
await page.locator('.home-grid .home-accordion-item').first().click();
await page.waitForSelector('.page[data-page="characters"].active', { state: 'visible', timeout: 10000 });
await page.locator('#homeBrand').click();
await page.waitForSelector('.page[data-page="home"].active', { state: 'visible', timeout: 10000 });

// Switching to Cards leaves Characters collapsed and only the clicked Cards card expanded.
const cardsAccordionCard = page.locator('.home-grid .app-card[data-home-sheet="home-cards"]');
await page.waitForTimeout(500);
await cardsAccordionCard.evaluate(el => el.click());
const accordionAfterCards = await page.evaluate(() => ({
  characterClass: document.querySelector('.home-grid .app-card[data-home-sheet="home-characters"]')?.className || '',
  cardsClass: document.querySelector('.home-grid .app-card[data-home-sheet="home-cards"]')?.className || '',
  openPanels: document.querySelectorAll('.home-grid .home-accordion-panel').length,
}));
if (accordionAfterCards.characterClass.includes('home-card-expanded')) {
  await fail('Characters remained expanded after Cards was opened: ' + JSON.stringify(accordionAfterCards));
}
if (!accordionAfterCards.cardsClass.includes('home-card-expanded') || accordionAfterCards.openPanels !== 1) {
  await fail('Cards accordion did not become the single expanded homepage card: ' + JSON.stringify(accordionAfterCards));
}

// Close Cards by clicking the same card; no adjacent card may be toggled.
await page.waitForTimeout(500);
await cardsAccordionCard.evaluate(el => el.click());
const accordionClosed = await page.evaluate(() => ({
  characterClass: document.querySelector('.home-grid .app-card[data-home-sheet="home-characters"]')?.className || '',
  cardsClass: document.querySelector('.home-grid .app-card[data-home-sheet="home-cards"]')?.className || '',
  openPanels: document.querySelectorAll('.home-grid > .home-feature > .home-accordion-panel').length,
}));
if (accordionClosed.characterClass.includes('home-card-expanded') || accordionClosed.cardsClass.includes('home-card-expanded') || accordionClosed.openPanels !== 0) {
  await fail('Closing Cards did not leave all homepage accordion cards collapsed: ' + JSON.stringify(accordionClosed));
}

// Full-site smoke audit: exercise every page plus the P3 Characters/Cards
// subcategory accordions, not just the homepage and Dojo route.
const smokeRoutes = ['home', 'sekai', 'songs', 'characters', 'cards', 'events', 'tools', 'profile', 'settings'];
for (const route of smokeRoutes) {
  const pageNode = page.locator('.page[data-page="' + route + '"]');
  if (!await pageNode.count()) await fail('Full-site smoke missing page: ' + route);
  await page.evaluate(route => go(route), route);
  await page.waitForSelector('.page[data-page="' + route + '"].active', { state: 'visible', timeout: 10000 });
  const contentText = (await pageNode.innerText()).trim();
  if (!contentText || contentText.length < 20) {
    await fail('Full-site smoke found nearly empty page: ' + route);
  }
}
await page.evaluate(() => go('characters'));
await page.waitForSelector('.page[data-page="characters"].active', { state: 'visible', timeout: 10000 });
const characterCategory = page.locator('.page[data-page="characters"] .catalog-card[data-sheet^="unit-"]').first();
if (!await characterCategory.count()) await fail('Characters subcategory buttons are missing');
await characterCategory.evaluate(el => el.click());
await page.locator('.page[data-page="characters"] .accordion-panel').waitFor({state:'visible', timeout:5000});
if (await page.locator('.page[data-page="characters"] .accordion-panel .accordion-item').count() < 1) {
  await fail('Characters subcategory click opened no child actions');
}
await page.locator('.page[data-page="characters"] .accordion-panel .accordion-item').first().evaluate(el => el.click());
await page.waitForSelector('.page[data-page="characters"].active', { state: 'visible', timeout: 10000 });

await page.evaluate(() => go('cards'));
await page.waitForSelector('.page[data-page="cards"].active', { state: 'visible', timeout: 10000 });
const cardCategory = page.locator('.page[data-page="cards"] .catalog-card[data-sheet="card-unit"]').first();
if (!await cardCategory.count()) await fail('Cards subcategory button is missing');
await cardCategory.evaluate(el => el.click());
await page.locator('.page[data-page="cards"] .accordion-panel').waitFor({state:'visible', timeout:5000});
if (await page.locator('.page[data-page="cards"] .accordion-panel .accordion-item').count() < 1) {
  await fail('Cards subcategory click opened no child actions');
}
await page.locator('.page[data-page="cards"] .accordion-panel .accordion-item').first().evaluate(el => el.click());
await page.waitForSelector('.page[data-page="cards"].active', { state: 'visible', timeout: 10000 });

// Do not let known Sonolus engine-version noise hide real browser errors.
const unexpectedConsoleErrors = errors.filter(e => !/A function named "StreamSet" does not exist\./.test(e));
if (unexpectedConsoleErrors.length || pageErrors.length || failedLocalRequests.length) {
  await fail(
    'Browser errors detected:\n' +
    pageErrors.join('\n') +
    '\nLocal failed requests:\n' +
    failedLocalRequests.map(x => x.status + ' ' + x.url).join('\n') +
    '\nUnexpected console errors:\n' + unexpectedConsoleErrors.join('\n')
  );
}

await page.evaluate(() => go('home'));
await page.waitForSelector('.page[data-page="home"].active', { state: 'visible', timeout: 10000 });

// Route coverage: test actual Dock entries, then direct-hash refresh for hidden pages.
const dockRoutes = ['home', 'sekai', 'songs', 'tools', 'profile'];
for (const route of dockRoutes) {
  const tab = page.locator('nav.bottom-bar button.tab[data-go="' + route + '"]');
  if (!await tab.count()) await fail('Missing bottom navigation tab: ' + route);
  await tab.evaluate(el => el.click());
  await page.waitForSelector('.page[data-page="' + route + '"].active', { state: 'visible', timeout: 10000 });
}
for (const route of ['characters', 'cards', 'events', 'settings']) {
  await page.evaluate(route => { location.hash = '#' + route; }, route);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.page[data-page="' + route + '"].active', { state: 'visible', timeout: 10000 });
  const activeCount = await page.locator('.page.active').count();
  if (activeCount !== 1) await fail('Direct route reload left multiple active pages: ' + route + ' count=' + activeCount);
}
await page.evaluate(() => { location.hash = '#home'; });
await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('.page[data-page="home"].active', { state: 'visible', timeout: 10000 });
await page.locator('nav.bottom-bar button.tab[data-go="songs"]').click();
await page.waitForSelector('.page[data-page="songs"].active', { state: 'visible', timeout: 10000 });

// Rapid navigation race audit.
for (const route of ['sekai', 'songs', 'tools', 'profile']) {
  await page.locator('nav.bottom-bar button.tab[data-go="' + route + '"]').evaluate(el => el.click());
}
await page.locator('#homeBrand').evaluate(el => el.click());
await page.waitForTimeout(600);
const rapidRouteAudit = await page.evaluate(() => ({
  activeCount: document.querySelectorAll('.page.active').length,
  activePages: [...document.querySelectorAll('.page.active')].map(x => x.dataset.page),
  hash: location.hash
}));
if (rapidRouteAudit.activeCount !== 1 || rapidRouteAudit.activePages[0] !== 'home' || rapidRouteAudit.hash !== '#home') {
  await fail('Rapid navigation left multiple/incorrect active pages: ' + JSON.stringify(rapidRouteAudit));
}

// Mobile 390×844 home layout + Dock audit.
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.scrollTo(0, 0));
const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
if (mobileOverflow > 1) await fail('Mobile homepage has horizontal overflow: ' + mobileOverflow);
const mobileCards = page.locator('.home-grid .app-card[data-home-sheet="home-cards"]');
await mobileCards.evaluate(el => el.click());
await page.locator('.home-grid .home-accordion-panel').waitFor({ state: 'visible', timeout: 5000 });
await page.waitForTimeout(650);
const mobileDockAudit = await page.evaluate(() => {
  const dock = document.querySelector('nav.bottom-bar')?.getBoundingClientRect();
  const tools = document.querySelector('.home-grid .app-card[data-home-sheet="home-tools"]')?.getBoundingClientRect();
  return dock && tools ? { dockTop:dock.top, toolsBottom:tools.bottom } : null;
});
if (!mobileDockAudit || mobileDockAudit.toolsBottom > mobileDockAudit.dockTop - 8) {
  await fail('Mobile Tools card still overlaps Dock after Cards expansion: ' + JSON.stringify(mobileDockAudit));
}
await mobileCards.evaluate(el => el.click());
await page.setViewportSize({ width: 1280, height: 720 });
await page.evaluate(() => window.scrollTo(0, 0));

// Continue Dojo checks.
const dojo = await page.evaluate(() => ({
  songList: !!document.querySelector('#dojoSongList'),
  analyzerMount: !!document.querySelector('#chartAnalyzerMount'),
  iframe: !!document.querySelector('#dojoSonolusIframe'),
  loopA: !!document.querySelector('#dojoLoopA'),
  loopB: !!document.querySelector('#dojoLoopB'),
  loopToggle: !!document.querySelector('#dojoLoopToggle'),
  practiceReset: !!document.querySelector('#dojoPracticeResetBtn'),
  fullscreen: !!document.querySelector('#dojoFullscreenBtn'),
}));
for (const [key, ok] of Object.entries(dojo)) {
  if (!ok) await fail('Missing current Dojo UI feature: ' + key);
}

await page.waitForFunction(
  () => document.querySelectorAll('#dojoSongList [data-dojo-song]').length > 50,
  null,
  { timeout: 25000 }
);
const dojoCatalogCount = await page.locator('#dojoSongList [data-dojo-song]').count();
if (dojoCatalogCount <= 50) await fail('Dojo catalog did not hydrate from full static data: ' + dojoCatalogCount);
const firstDojoCatalogTitle = (await page.locator('#dojoSongList [data-dojo-song]').first().locator('.dojo-song-title').textContent() || '').trim();
if (firstDojoCatalogTitle !== 'Tell Your World') await fail('Dojo static catalog sort/first song is unexpected: ' + firstDojoCatalogTitle);
const hardButtonText = await page.locator('#dojoDifficultyButtons [data-dojo-diff="Hard"]').textContent();
if (!/16\b/.test(hardButtonText || '')) await fail('Dojo difficulty data is not using current generated values for Tell Your World: ' + hardButtonText);

const initialSelection = (await page.locator('#dojoSelectedTitle').textContent() || '').trim();
if (!initialSelection) await fail('Dojo selected-song panel is empty on initial load');

const firstSong = page.locator('#dojoSongList [data-dojo-song]:not(.active)').first();
const firstSongId = await firstSong.getAttribute('data-dojo-song');
const firstSongTitle = (await firstSong.locator('.dojo-song-title').textContent() || '').trim();
if (!firstSongId || !firstSongTitle) await fail('Dojo local song list contains an invalid first song');

await firstSong.evaluate(el => el.click());
await page.waitForTimeout(100);

const selectedAfterClick = await page.evaluate(() => ({
  title: document.querySelector('#dojoSelectedTitle')?.textContent?.trim() || '',
  difficulty: document.querySelector('#dojoSelectedDifficulty')?.textContent?.trim() || '',
  buttons: document.querySelectorAll('#dojoDifficultyButtons [data-dojo-diff]').length,
}));
if (selectedAfterClick.title !== firstSongTitle) {
  await fail('Selecting a Dojo song did not update the selected panel: ' + JSON.stringify(selectedAfterClick));
}
if (!selectedAfterClick.buttons) await fail('Selected Dojo song has no available difficulty buttons');

await page.locator('#dojoSongSearch').evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, firstSongTitle.slice(0, Math.min(8, firstSongTitle.length)));
await page.waitForTimeout(100);
const filtered = await page.locator('#dojoSongList [data-dojo-song]').count();
if (!filtered) await fail('Dojo song search returned no result for the selected title');
await page.locator('#dojoClearSearch').evaluate(el => el.click());
if ((await page.locator('#dojoSongSearch').inputValue()) !== '') {
  await fail('Dojo clear-search did not clear the input');
}

const firstDifficulty = page.locator('#dojoDifficultyButtons [data-dojo-diff]').first();
await firstDifficulty.evaluate(el => el.click());

await page.locator('#dojoAnalyzeBtn').evaluate(el => el.click());
const analyzed = await page.evaluate(() => ({
  title: document.querySelector('#dojoSelectedTitle')?.textContent?.trim() || '',
  notes: document.querySelector('#dojoSelectedNotes')?.textContent?.trim() || '',
  nps: document.querySelector('#dojoSelectedNps')?.textContent?.trim() || '',
}));
if (!analyzed.title || analyzed.notes === '—' || analyzed.nps === '—') {
  await fail('Dojo chart analysis did not populate: ' + JSON.stringify(analyzed));
}

const iframe = page.locator('#dojoSonolusIframe');
await page.locator('#dojoOpenPracticeBtn').evaluate(el => el.click());
await page.waitForFunction(
  () => {
    const frame = document.querySelector('#dojoSonolusIframe');
    return !!frame && !/about:blank$/.test(frame.src);
  },
  null,
  { timeout: 10000 }
);

const frameUrl = await iframe.getAttribute('src');
if (!frameUrl || !frameUrl.includes('/sonolus-web/')) {
  await fail('Dojo practice button did not open the local Sonolus core: ' + frameUrl);
}

const sonolusFrame = page.frameLocator('#dojoSonolusIframe');
const startButton = sonolusFrame.locator('.start-play-trg').first();
try {
  await startButton.waitFor({ state: 'attached', timeout: 60000 });
} catch (error) {
  const debug = await page.evaluate(() => {
    const frame = document.querySelector('#dojoSonolusIframe');
    let child = {};
    try {
      const doc = frame?.contentDocument;
      const runtime = frame?.contentWindow?.__pjPracticeRuntime;
      child = {
        href: frame?.contentWindow?.location?.href || '',
        readyState: doc?.readyState || '',
        bodyText: doc?.body?.innerText?.slice(0, 5000) || '',
        rootText: doc?.querySelector('#root')?.innerText?.slice(0, 4000) || '',
        loadingDisplay: doc?.querySelector('#loading-cover') ? getComputedStyle(doc.querySelector('#loading-cover')).display : '',
        processingDisplay: doc?.querySelector('#processing-cover') ? getComputedStyle(doc.querySelector('#processing-cover')).display : '',
        startButton: doc?.querySelector('.start-play-trg')?.outerHTML?.slice(0, 1000) || '',
        practiceDebug: frame?.contentWindow?.__pjPracticeDebug || null,
        runtime: !!runtime,
      };
    } catch (e) {
      child = { accessError: e?.message || String(e) };
    }
    return {
      iframeSrc: frame?.src || '',
      bridgeStatus: document.querySelector('#dojoBridgeStatus')?.textContent?.trim() || '',
      apiLog: document.querySelector('#dojoApiLog')?.textContent?.trim() || '',
      child,
    };
  });
  await fail('Dojo SourceLoad START button did not appear: ' +
    JSON.stringify({ debug, consoleErrors: errors, pageErrors, failedLocalRequests, timeout: error?.message || String(error) }));
}

let startButtonState = null;
let startReady = false;
const startAttempts = [];
for (let attempt = 1; attempt <= 3 && !startReady; attempt++) {
  await page.waitForFunction(() => {
    const node = document.querySelector('#dojoSonolusIframe')?.contentDocument?.querySelector('.start-play-trg');
    return !!node;
  }, null, { timeout: 20000 });
  startButtonState = await page.evaluate(() => {
    const node = document.querySelector('#dojoSonolusIframe')?.contentDocument?.querySelector('.start-play-trg');
    if (!node) return null;
    const s = getComputedStyle(node);
    const r = node.getBoundingClientRect();
    let bgmState = '';
    try {
      const app = document.querySelector('#dojoSonolusIframe')?.contentWindow?.app;
      bgmState = typeof app?.BGM?.state === 'function' ? String(app.BGM.state() || '') : '';
    } catch (_) {}
    return {
      disabled: node.hasAttribute('disabled'),
      display: s.display,
      visibility: s.visibility,
      opacity: s.opacity,
      width: r.width,
      height: r.height,
      bgmState,
    };
  });
  startAttempts.push(startButtonState);
  startReady = !!startButtonState && !startButtonState.disabled;
  if (!startReady && attempt < 3) {
    await page.evaluate(() => {
      const frame = document.querySelector('#dojoSonolusIframe');
      if (frame?.src) frame.src = frame.src;
    });
    await page.waitForTimeout(2500);
  }
}
if (!startReady) {
  await fail('Dojo SourceLoad START button remained disabled after 3 load attempts: ' + JSON.stringify(startAttempts));
}

const startInfo = await page.evaluate(() => {
  const frame = document.querySelector('#dojoSonolusIframe');
  try {
    const node = frame?.contentDocument?.querySelector('.start-play-trg');
    return node ? { tag: node.tagName, className: node.className || '', disabled: node.hasAttribute('disabled'), outer: node.outerHTML.slice(0, 500) } : null;
  } catch (_) {
    return null;
  }
});

try {
  await page.waitForFunction(
    () => {
      try {
        const runtime = document.querySelector('#dojoSonolusIframe')?.contentWindow?.__pjPracticeRuntime;
        return !!runtime &&
          typeof runtime.getTime === 'function' &&
          typeof runtime.getDuration === 'function' &&
          typeof runtime.seek === 'function' &&
          typeof runtime.setRate === 'function' &&
          typeof runtime.reset === 'function';
      } catch (_) {
        return false;
      }
    },
    null,
    { timeout: 45000 }
  );
} catch (error) {
  const debug = await page.evaluate(() => {
    const frame = document.querySelector('#dojoSonolusIframe');
    let child = {};
    try {
      child = {
        href: frame?.contentWindow?.location?.href || '',
        readyState: frame?.contentDocument?.readyState || '',
        runtime: !!frame?.contentWindow?.__pjPracticeRuntime,
        bodyText: frame?.contentDocument?.body?.innerText?.slice(0, 2000) || '',
        rootText: frame?.contentDocument?.querySelector('#root')?.innerText?.slice(0, 1500) || '',
      };
    } catch (e) {
      child = { accessError: e?.message || String(e) };
    }
    return {
      iframeSrc: frame?.src || '',
      bridgeStatus: document.querySelector('#dojoBridgeStatus')?.textContent?.trim() || '',
      apiLog: document.querySelector('#dojoApiLog')?.textContent?.trim() || '',
      child,
    };
  });
  await fail(
    'Local Sonolus runtime bridge did not expose within 45s: ' +
    JSON.stringify({ debug, startInfo, consoleErrors: errors, pageErrors, failedLocalRequests, timeout: error?.message || String(error) })
  );
}

// Wait for the upstream player bootstrap to reach SourceLoad, then click the REAL play button.
try {
  await page.waitForFunction(
    () => {
      const frame = document.querySelector('#dojoSonolusIframe');
      try {
        const doc = frame?.contentDocument;
        const btn = doc?.querySelector('.start-play-trg');
        return !!btn && !btn.hasAttribute('disabled');
      } catch (_) {
        return false;
      }
    },
    null,
    { timeout: 60000 }
  );
} catch (error) {
  const debug = await page.evaluate(() => {
    const frame = document.querySelector('#dojoSonolusIframe');
    let child = {};
    try {
      const doc = frame?.contentDocument;
      child = {
        href: frame?.contentWindow?.location?.href || '',
        readyState: doc?.readyState || '',
        bodyText: doc?.body?.innerText?.slice(0, 5000) || '',
        rootText: doc?.querySelector('#root')?.innerText?.slice(0, 3000) || '',
        loadingText: doc?.querySelector('.loading-log')?.innerText?.slice(-5000) || '',
        loadingDisplay: doc?.querySelector('#loading-cover') ? getComputedStyle(doc.querySelector('#loading-cover')).display : '',
        processingDisplay: doc?.querySelector('#processing-cover') ? getComputedStyle(doc.querySelector('#processing-cover')).display : '',
        startButton: doc?.querySelector('.start-play-trg')?.outerHTML?.slice(0, 1200) || '',
        runtime: !!frame?.contentWindow?.__pjPracticeRuntime,
      };
    } catch (e) {
      child = { accessError: e?.message || String(e) };
    }
    return {
      iframeSrc: frame?.src || '',
      bridgeStatus: document.querySelector('#dojoBridgeStatus')?.textContent?.trim() || '',
      apiLog: document.querySelector('#dojoApiLog')?.textContent?.trim() || '',
      child,
    };
  });
  await fail(
    'Dojo SourceLoad never exposed playable START button: ' +
    JSON.stringify({ debug, consoleErrors: errors, pageErrors, failedLocalRequests, timeout: error?.message || String(error) })
  );
}

const sourceLoadInfo = await page.evaluate(() => {
  const frame = document.querySelector('#dojoSonolusIframe');
  try {
    const root = frame?.contentDocument?.querySelector('.start-play-trg');
    const log = frame?.contentDocument?.querySelector('.loading-log')?.innerText || '';
    return { button: root?.outerHTML?.slice(0, 600) || '', log };
  } catch (_) {
    return { accessError: 'cannot inspect iframe' };
  }
});

const realStartButton = sonolusFrame.locator('.start-play-trg').first();
await realStartButton.evaluate(el => el.click());
await page.waitForTimeout(1000);

const runtimeState = await page.evaluate(() => {
  const frame = document.querySelector('#dojoSonolusIframe');
  const runtime = frame?.contentWindow?.__pjPracticeRuntime;
  const app = frame?.contentWindow?.app;
  let bgm = {};
  try {
    bgm = {
      state: typeof app?.BGM?.state === 'function' ? app.BGM.state() : '',
      duration: typeof app?.BGM?.duration === 'function' ? Number(app.BGM.duration() || 0) : 0,
      playing: typeof app?.BGM?.playing === 'function' ? !!app.BGM.playing() : false,
      rate: typeof app?.BGM?.rate === 'function' ? Number(app.BGM.rate() || 0) : 0,
      src: app?.BGM?._src || ''
    };
  } catch (_) {}
  return {
    sameOrigin: !!frame?.contentWindow,
    duration: Number(runtime?.getDuration?.() || 0),
    time: Number(runtime?.getTime?.() || 0),
    bridgeStatus: document.querySelector('#dojoBridgeStatus')?.textContent?.trim() || '',
    iframeSrc: frame?.src || '',
    appExists: !!app,
    bgm
  };
});
if (!(runtimeState.duration > 0) || !runtimeState.appExists || runtimeState.bgm.state !== 'loaded') {
  await fail('Dojo real play did not expose a loaded playable BGM: ' + JSON.stringify({ runtimeState, sourceLoadInfo }));
}
const t0 = runtimeState.time;
await page.waitForTimeout(1000);
const t1 = await page.evaluate(() => {
  const frame = document.querySelector('#dojoSonolusIframe');
  return Number(frame?.contentWindow?.__pjPracticeRuntime?.getTime?.() || 0);
});
if (!(t1 > t0 + 0.05)) {
  await fail('Dojo real play did not advance playback time: ' + JSON.stringify({ t0, t1, runtimeState }));
}

const bridgeExercise = await page.evaluate(() => {
  const runtime = document.querySelector('#dojoSonolusIframe')?.contentWindow?.__pjPracticeRuntime;
  try {
    runtime?.setRate?.(0.5);
    runtime?.seek?.(0);
    return true;
  } catch (_) {
    return false;
  }
});
if (!bridgeExercise) await fail('Dojo practice bridge methods threw while the Sonolus core was ready');
const beforeReset = null;
const afterReset = null;

const loopState = await page.evaluate(() => ({
  a: document.querySelector('#dojoLoopA')?.value || '',
  b: document.querySelector('#dojoLoopB')?.value || '',
  toggle: document.querySelector('#dojoLoopToggle')?.getAttribute('aria-pressed') || '',
}));
await page.locator('#dojoLoopToggle').evaluate(el => el.click());
const loopEnabled = await page.locator('#dojoLoopToggle').getAttribute('aria-pressed');
if (loopEnabled !== 'true') await fail('A-B loop toggle did not enable: ' + JSON.stringify(loopState));

await page.locator('#dojoLoopASet').evaluate(el => el.click());
await page.locator('#dojoLoopBSet').evaluate(el => el.click());

await page.locator('[data-practice-speed=".5"]').evaluate(el => el.click());
const speedRuntimeState = await page.evaluate(() => ({
  status: document.querySelector('#dojoBridgeStatus')?.textContent?.trim() || '',
  runtimeExists: !!document.querySelector('#dojoSonolusIframe')?.contentWindow?.__pjPracticeRuntime,
}));
if (!speedRuntimeState.runtimeExists) await fail('Practice speed control lost the local runtime bridge');

if (pageErrors.length || failedLocalRequests.length) {
  await fail(
    'Browser errors detected:\n' +
    pageErrors.join('\n') +
    '\nLocal failed requests:\n' +
    failedLocalRequests.map(x => x.status + ' ' + x.url).join('\n') +
    '\nConsole errors:\n' + errors.join('\n')
  );
}

console.log(JSON.stringify({
  PASS: true,
  initialSelection,
  firstSong: { id: firstSongId, title: firstSongTitle },
  selectedAfterClick,
  analyzed,
  frameUrl,
  runtimeState,
  beforeReset,
  afterReset,
  loopEnabled,
  speedRuntimeState,
  coverProbe,
  errors,
  unexpectedConsoleErrors,
  pageErrors,
  failedLocalRequests,
}, null, 2));

await browser.close();
