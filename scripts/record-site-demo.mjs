import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE_URL = process.env.DEMO_BASE_URL || 'http://127.0.0.1:4173/';
const OUT_DIR = process.env.DEMO_OUT_DIR || path.resolve('recording-output');
const DESKTOP_SECONDS = 110;
const MOBILE_SECONDS = 40;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const deadlineWait = async (start, seconds) => {
  const left = start + seconds * 1000 - Date.now();
  if (left > 0) await sleep(left);
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const partsDir = path.join(OUT_DIR, 'parts');
fs.mkdirSync(partsDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required']
});
const allConsoleErrors = [];
const pageErrors = [];

async function waitRoute(page, route) {
  await page.waitForSelector('.page[data-page="' + route + '"].active', {
    state: 'visible',
    timeout: 12000
  });
}
async function clickVisible(locator, timeout = 12000) {
  await locator.waitFor({ state: 'visible', timeout });
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click({ timeout });
}
async function openHomeCard(page, key, itemIndex, route) {
  await clickVisible(page.locator('nav.bottom-bar button.tab[data-go="home"]'));
  await waitRoute(page, 'home');
  const card = page.locator('.home-grid .app-card[data-home-sheet="' + key + '"]');
  await clickVisible(card);
  const item = page.locator('.home-accordion-item[data-home-action="' + key + '-' + itemIndex + '"]');
  await clickVisible(item);
  await waitRoute(page, route);
}
async function waitSongCatalog(page) {
  await page.waitForFunction(() => {
    return document.querySelectorAll('#dojoSongList [data-dojo-song]').length > 50;
  }, null, { timeout: 25000 });
}
async function waitForPlayableStart(page, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await page.waitForFunction(() => {
        const frame = document.querySelector('#dojoSonolusIframe');
        const button = frame?.contentDocument?.querySelector('.start-play-trg');
        return !!button && !button.hasAttribute('disabled');
      }, null, { timeout: 14000 });
      return true;
    } catch (_) {
      if (attempt < attempts) {
        await page.evaluate(() => {
          const frame = document.querySelector('#dojoSonolusIframe');
          if (frame?.src && !/about:blank$/.test(frame.src)) frame.src = frame.src;
        });
        await sleep(1400);
      }
    }
  }
  const debug = await page.evaluate(() => {
    const frame = document.querySelector('#dojoSonolusIframe');
    try {
      return {
        src: frame?.src || '',
        log: frame?.contentDocument?.querySelector('.loading-log')?.innerText?.slice(-3000) || '',
        body: frame?.contentDocument?.body?.innerText?.slice(-1200) || ''
      };
    } catch (e) {
      return { src: frame?.src || '', error: String(e) };
    }
  });
  throw new Error('Dojo did not reach playable START state: ' + JSON.stringify(debug));
}
async function openAndPlayDojo(page) {
  await clickVisible(page.locator('nav.bottom-bar button.tab[data-go="songs"]'));
  await waitRoute(page, 'songs');
  await waitSongCatalog(page);

  // Choose the first non-selected real song, matching the stable path in the QA test.
  let song = page.locator('#dojoSongList [data-dojo-song]:not(.active)').first();
  if (await song.count() === 0) song = page.locator('#dojoSongList [data-dojo-song]').first();
  await clickVisible(song);
  await page.locator('#dojoSelectedTitle').waitFor({ state: 'visible', timeout: 8000 });

  const easy = page.locator('#dojoDifficultyButtons [data-dojo-diff="Easy"]');
  if (await easy.count()) await clickVisible(easy);
  await clickVisible(page.locator('#dojoAnalyzeBtn'));
  await sleep(700);
  await clickVisible(page.locator('#dojoOpenPracticeBtn'));
  await page.waitForFunction(() => {
    const frame = document.querySelector('#dojoSonolusIframe');
    return !!frame && !/about:blank$/.test(frame.src);
  }, null, { timeout: 10000 });
  const frameUrl = await page.locator('#dojoSonolusIframe').getAttribute('src');
  if (!frameUrl || !frameUrl.includes('/sonolus-web/')) {
    throw new Error('Practice button did not load the local player: ' + frameUrl);
  }

  await waitForPlayableStart(page);
  await page.frameLocator('#dojoSonolusIframe').locator('.start-play-trg').first().click({ timeout: 12000 });
  await page.waitForFunction(() => {
    const frame = document.querySelector('#dojoSonolusIframe');
    const runtime = frame?.contentWindow?.__pjPracticeRuntime;
    return !!runtime && Number(runtime.getDuration?.() || 0) > 0;
  }, null, { timeout: 45000 });
  await page.waitForFunction(() => {
    const frame = document.querySelector('#dojoSonolusIframe');
    const runtime = frame?.contentWindow?.__pjPracticeRuntime;
    const app = frame?.contentWindow?.app;
    return !!runtime && !!app && Number(runtime.getDuration?.() || 0) > 0 &&
      Number(runtime.getTime?.() || 0) > 0.3;
  }, null, { timeout: 20000 });

  // Demonstrate only controls already verified by the browser QA: real play,
  // playback rate, and the A-B loop control. No unverified visual options are toggled.
  const halfSpeed = page.locator('[data-practice-speed=".5"]');
  if (await halfSpeed.count()) await clickVisible(halfSpeed);
  const loop = page.locator('#dojoLoopToggle');
  if (await loop.count()) await clickVisible(loop);
  return await page.evaluate(() => {
    const frame = document.querySelector('#dojoSonolusIframe');
    const runtime = frame?.contentWindow?.__pjPracticeRuntime;
    const app = frame?.contentWindow?.app;
    return {
      title: document.querySelector('#dojoSelectedTitle')?.textContent?.trim() || '',
      duration: Number(runtime?.getDuration?.() || 0),
      time: Number(runtime?.getTime?.() || 0),
      bgmState: String(app?.BGM?.state?.() || ''),
      playing: !!app?.BGM?.playing?.()
    };
  });
}

let desktopPath = '';
let mobilePath = '';
let desktopStats = null;
let mobileStats = null;

try {
  const desktopStart = Date.now();
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    recordVideo: { dir: partsDir, size: { width: 1280, height: 720 } }
  });
  const desktop = await desktopContext.newPage();
  desktop.on('console', msg => { if (msg.type() === 'error') allConsoleErrors.push(msg.text()); });
  desktop.on('pageerror', err => pageErrors.push(err.stack || err.message));
  await desktop.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitRoute(desktop, 'home');
  await sleep(4500);

  // Songs & Dojo catalogue, then the in-page chart analyser.
  await clickVisible(desktop.locator('nav.bottom-bar button.tab[data-go="songs"]'));
  await waitRoute(desktop, 'songs');
  await waitSongCatalog(desktop);
  await sleep(4500);
  await desktop.locator('#dojoSongSearch').fill('ロキ');
  await sleep(900);
  if (await desktop.locator('#dojoSongList [data-dojo-song]').count()) {
    await clickVisible(desktop.locator('#dojoSongList [data-dojo-song]').first());
  }
  await clickVisible(desktop.locator('#dojoAnalyzeBtn'));
  await sleep(2800);

  // Strategy calculator and the separate chart-analysis catalogue.
  await clickVisible(desktop.locator('nav.bottom-bar button.tab[data-go="tools"]'));
  await waitRoute(desktop, 'tools');
  await desktop.waitForFunction(() => {
    const el = document.querySelector('#caCount');
    return el && Number((el.textContent || '').replace(/[^0-9]/g, '')) > 0;
  }, null, { timeout: 25000 });
  await sleep(2500);
  const chartSong = desktop.locator('#caSongList [data-ca-song]').first();
  if (await chartSong.count()) {
    await clickVisible(chartSong);
    await desktop.locator('#caDetail .ca-detail-metrics').waitFor({ state: 'visible', timeout: 10000 });
  }
  await sleep(2500);

  // Activity centre.
  await openHomeCard(desktop, 'home-events', 0, 'events');
  await sleep(4300);

  // Character groups.
  await openHomeCard(desktop, 'home-characters', 0, 'characters');
  await sleep(3500);
  const unit = desktop.locator('.page[data-page="characters"].active .catalog-card[data-sheet^="unit-"]').first();
  if (await unit.count()) await clickVisible(unit);
  await sleep(1800);

  // Card archive.
  await openHomeCard(desktop, 'home-cards', 0, 'cards');
  await sleep(4200);

  // Player dashboard.
  await clickVisible(desktop.locator('nav.bottom-bar button.tab[data-go="profile"]'));
  await waitRoute(desktop, 'profile');
  await sleep(4300);

  // Display settings through the site's real global search.
  await clickVisible(desktop.locator('#globalSearchBtn'));
  await desktop.locator('#globalSearchInput').fill('設定');
  await desktop.locator('#globalSearchResults .search-result[data-search-route="settings"]').first().waitFor({
    state: 'visible', timeout: 8000
  });
  await clickVisible(desktop.locator('#globalSearchResults .search-result[data-search-route="settings"]').first());
  await waitRoute(desktop, 'settings');
  await sleep(3000);

  // End the desktop portion on the real playable Dojo, with a safety reserve for loading.
  desktopStats = await openAndPlayDojo(desktop);
  await sleep(25000);
  await deadlineWait(desktopStart, DESKTOP_SECONDS);
  const desktopVideo = desktop.video();
  await desktopContext.close();
  desktopPath = await desktopVideo.path();

  // Mobile recording: a separate 390×844 responsive browser viewport, not a mock-up.
  const mobileStart = Date.now();
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: partsDir, size: { width: 390, height: 844 } }
  });
  const mobile = await mobileContext.newPage();
  mobile.on('console', msg => { if (msg.type() === 'error') allConsoleErrors.push(msg.text()); });
  mobile.on('pageerror', err => pageErrors.push(err.stack || err.message));
  await mobile.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitRoute(mobile, 'home');
  await sleep(6500);

  // Show the actual mobile Dock and Songs/Dojo controls.
  await clickVisible(mobile.locator('nav.bottom-bar button.tab[data-go="songs"]'));
  await waitRoute(mobile, 'songs');
  await waitSongCatalog(mobile);
  await mobile.locator('#dojoSongSearch').fill('ロキ');
  await sleep(2200);
  await mobile.locator('#dojoSongSearch').fill('');
  await sleep(2500);

  await clickVisible(mobile.locator('nav.bottom-bar button.tab[data-go="tools"]'));
  await waitRoute(mobile, 'tools');
  await sleep(4500);
  await clickVisible(mobile.locator('nav.bottom-bar button.tab[data-go="profile"]'));
  await waitRoute(mobile, 'profile');
  await sleep(4500);
  await clickVisible(mobile.locator('nav.bottom-bar button.tab[data-go="home"]'));
  await waitRoute(mobile, 'home');
  await sleep(3000);

  await deadlineWait(mobileStart, MOBILE_SECONDS);
  const mobileVideo = mobile.video();
  await mobileContext.close();
  mobilePath = await mobileVideo.path();

  const outFile = path.join(OUT_DIR, 'pjsekai-terminal-demo-150s.mp4');
  const filter = [
    '[0:v]fps=30,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,tpad=stop_mode=clone:stop_duration=8,trim=duration=110,setpts=PTS-STARTPTS[desktop]',
    '[1:v]fps=30,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,boxblur=18:1[blurred]',
    '[1:v]fps=30,scale=400:720:force_original_aspect_ratio=decrease[mobile]',
    '[blurred][mobile]overlay=(W-w)/2:(H-h)/2,setsar=1,tpad=stop_mode=clone:stop_duration=5,trim=duration=40,setpts=PTS-STARTPTS[mobileFrame]',
    '[desktop][mobileFrame]concat=n=2:v=1:a=0[outv]'
  ].join(';');
  execFileSync('ffmpeg', [
    '-y', '-i', desktopPath, '-i', mobilePath,
    '-filter_complex', filter,
    '-map', '[outv]', '-t', '150',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    outFile
  ], { stdio: 'inherit' });

  const durationText = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', outFile
  ], { encoding: 'utf8' }).trim();
  const duration = Number(durationText);
  if (!Number.isFinite(duration) || duration < 149.8 || duration > 150.2) {
    throw new Error('Final demo duration is not 150 seconds: ' + durationText);
  }
  console.log(JSON.stringify({
    ok: true,
    file: outFile,
    durationSeconds: duration,
    desktop: desktopStats,
    mobileViewport: '390x844',
    pageErrors,
    consoleErrorCount: allConsoleErrors.length,
    knownSonolusNoise: allConsoleErrors.filter(x => /A function named "StreamSet" does not exist\./.test(x)).length,
    unexpectedConsoleErrors: allConsoleErrors.filter(x => !/A function named "StreamSet" does not exist\./.test(x))
  }, null, 2));
} finally {
  await browser.close().catch(() => {});
}
