/* Developer check: plays "Play full story" from art/review/sequences.html without a visible window
   and saves one picture per second into a single grid image.
   Run:  node_modules\electron\dist\electron.exe tools\review-shot.js art\out\story.png  */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const out = path.resolve(process.argv[2] || 'art/out/story.png');
const errors = [];

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1100, height: 900, show: false, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } });
  win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 'warning' || e.level >= 2) errors.push(e.message); });
  await win.loadFile(path.join(__dirname, '..', 'art', 'review', 'sequences.html'));
  const result = await win.webContents.executeJavaScript(`(async () => {
    for (let i = 0; i < 200 && !window.__tokku; i++) await new Promise(r => setTimeout(r, 50));
    const T = window.__tokku; if (!T) return { error: 'page did not start' };
    const COLS = 8, TW = 500, TH = 215, tiles = [], notes = [];
    let done = false; T.story().then(() => { done = true; });
    const dt = 1 / 60; let t = 0, next = 0;
    while (!done && t < 110) {
      T.frame(dt); t += dt;
      if (t >= next) {
        const c = document.createElement('canvas'); c.width = TW; c.height = TH; const g = c.getContext('2d');
        g.drawImage(T.canvas, 0, 0, TW, TH);
        const bub = document.getElementById('bubble'), shown = bub.style.display !== 'none';
        g.fillStyle = '#fff'; g.font = '11px system-ui';
        g.fillText(Math.round(t) + 's  ' + T.brain.state + (T.brain.quiet ? ' quiet' : '') + ' / ' + T.ch.mode + ' / ' + (T.ch.visual.name || T.ch.visual.type), 6, 12);
        if (shown) { g.fillStyle = '#ffd98a'; g.fillText(document.getElementById('bubble-text').textContent.slice(0, 70) + '  [' + [...document.querySelectorAll('#bubble-acts button')].map(b => b.textContent).join(' | ') + ']', 6, 26); }
        tiles.push(c); notes.push(Math.round(t) + 's ' + T.brain.state + ' ' + T.ch.mode + ' ' + (T.ch.visual.name || T.ch.visual.type) + ' x=' + Math.round(T.ch.x));
        next += 1;
      }
      if ((Math.round(t * 60) % 4) === 0) await new Promise(r => setTimeout(r, 0));   // let the character's waits continue
      else await Promise.resolve();
    }
    const grid = document.createElement('canvas'); grid.width = COLS * TW; grid.height = Math.ceil(tiles.length / COLS) * TH;
    const gg = grid.getContext('2d'); tiles.forEach((c, i) => gg.drawImage(c, (i % COLS) * TW, Math.floor(i / COLS) * TH));
    return { png: grid.toDataURL('image/png'), notes, seconds: t, finished: done, failed: T.failed, images: Object.keys(T.images).length };
  })()`);
  if (result.png) fs.writeFileSync(out, Buffer.from(result.png.split(',')[1], 'base64'));
  delete result.png;
  fs.writeFileSync(out + '.json', JSON.stringify({ ...result, errors }, null, 1));
  app.quit();
});
