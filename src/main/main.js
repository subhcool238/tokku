/* Tokku main process ("Guard"). Tokku lives in the bottom right corner of the desktop.
   - transparent, frameless window, not on the taskbar, never takes keyboard focus
   - NOT always on top: other windows cover him. He comes forward only when the renderer asks.
   - click-through everywhere except on the character and his buttons
   - the renderer is sandboxed, has no network and no permissions, and is served from a private app:// scheme */
const { app, BrowserWindow, Tray, Menu, protocol, session, screen, ipcMain, nativeImage, globalShortcut } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const RENDERER_ROOT = path.join(__dirname, '..', 'renderer');
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'";
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const WIN = { width: 340, height: 452, margin: 0 };      // he stands in the very corner

let win = null, tray = null;
const sense = require('./guard-sense');
const state = { interview: false, dnd: false, pausedUntil: 0, pausesThisHour: [], micCamera: true, debug: false, sensed: [], quiet: false };

// Quiet mode is on when any reason holds: Interview mode, Do not disturb, a meeting window, mic or camera in use, a full screen work app
function updateQuiet() {
  const on = state.interview || state.dnd || state.sensed.length > 0;
  if (on !== state.quiet) { state.quiet = on; send({ type: 'quiet', on }); }
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function serveRenderer() {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(RENDERER_ROOT, rel);
    // never serve anything outside src/renderer
    if (file !== RENDERER_ROOT && !file.startsWith(RENDERER_ROOT + path.sep)) return new Response('Forbidden', { status: 403 });
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('Not found', { status: 404 });
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    return new Response(await fs.promises.readFile(file), { headers: { 'Content-Type': type, 'Content-Security-Policy': CSP } });
  });
}

function lockDownSession() {
  const ses = session.defaultSession;
  // the character window loads nothing from the internet
  ses.webRequest.onBeforeRequest((details, cb) => {
    const ok = details.url.startsWith('app://tokku/') || details.url.startsWith('devtools://');
    cb({ cancel: !ok });
  });
  // camera, microphone, screen capture and every other permission: always no
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
}

function homePosition() {
  const a = screen.getPrimaryDisplay().workArea;
  return { x: a.x + a.width - WIN.width - WIN.margin, y: a.y + a.height - WIN.height };      // bottom right, feet on the top edge of the taskbar
}

function send(ev) { if (win && !win.isDestroyed()) win.webContents.send('guard:event', ev); }

function createWindow() {
  const home = homePosition();
  win = new BrowserWindow({
    ...home, width: WIN.width, height: WIN.height,
    title: 'Tokku', show: false, backgroundColor: '#00000000', opacity: 0,
    transparent: true, frame: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    skipTaskbar: true, focusable: false, hasShadow: false, alwaysOnTop: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false },                                // he must keep thinking while a window covers him
  });
  win.setIgnoreMouseEvents(true, { forward: true });             // clicks pass through to whatever is behind him
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadURL('app://tokku/index.html');
  // Shown only once his picture is really drawn, so no empty box flashes at start. Never steals keyboard focus.
  win.webContents.once('did-finish-load', () => setTimeout(() => { if (!win.isDestroyed()) { win.showInactive(); win.setOpacity(1); } }, 700));
  win.on('minimize', () => { win.restore(); win.showInactive(); });

  // self-test: TOKKU_SHOT=<png path> saves the canvas picture and a status line, then quits
  const shot = process.env.TOKKU_SHOT;
  if (shot) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      try {
        const r = await win.webContents.executeJavaScript(
          "({ status: window.__tokkuStatus ? window.__tokkuStatus() : 'no status', png: document.getElementById('stage').toDataURL('image/png') })");
        fs.writeFileSync(shot, Buffer.from(r.png.split(',')[1], 'base64'));
        // act out a distraction: 50 s of YouTube in front, then closed. Checks that he really comes forward and goes back.
        const wait = (ms) => new Promise(res => setTimeout(res, ms)), js = (code) => win.webContents.executeJavaScript(code);
        const probe = [];
        probe.push('before: onTop ' + !!state.front);
        await js("window.__tokku.brain.activity('video', 'YouTube', 50)"); await wait(1500);
        probe.push('YouTube 50 s: onTop ' + !!state.front + ', bubble \"' + await js("document.getElementById('bubble-text').textContent") + '\", buttons ' + await js("[...document.querySelectorAll('#bubble-acts button')].map(b => b.textContent).join(' / ')") + ', pose ' + await js("window.__tokku.ch.visual.name"));
        fs.writeFileSync(shot + '.nudge.png', Buffer.from((await js("document.getElementById('stage').toDataURL('image/png')")).split(',')[1], 'base64'));
        // a real mouse click on the first bubble button, to prove nothing covers it
        const hit = await js("(() => { const b = document.querySelector('#bubble-acts button'), r = b.getBoundingClientRect(), x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2), el = document.elementFromPoint(x, y); return { x, y, top: el && (el.tagName + ' ' + el.textContent), bubble: JSON.stringify(document.getElementById('bubble').getBoundingClientRect()) }; })()");
        probe.push('element under the button centre: ' + hit.top + ' ; bubble box ' + hit.bubble);
        for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) win.webContents.sendInputEvent({ type, x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
        await wait(2500);
        probe.push('after the click: bargaining ' + await js("window.__tokku.brain.bargaining"));
        probe.push('5 more minutes: onTop ' + !!state.front + ', pose ' + await js("window.__tokku.ch.visual.name"));
        await js("window.__tokku.brain.activity('work', null, 3)"); await wait(1000);
        probe.push('closed, 1 s later: onTop ' + !!state.front + ', pose ' + await js("window.__tokku.ch.visual.name"));
        await wait(3200);
        probe.push('closed, 4 s later: onTop ' + !!state.front);
        await js("window.guard.dragStart(); window.guard.drag(-400, -300)"); await wait(400);
        const lifted = win.getBounds();
        await js("window.guard.drop()"); await wait(1500);
        probe.push('drag: lifted to ' + lifted.x + ',' + lifted.y + ' then dropped to ' + win.getBounds().x + ',' + win.getBounds().y + ' (floor y ' + homePosition().y + ')');
        await wait(6000);
        probe.push('after the drop he walked home: x ' + win.getBounds().x + ' (home x ' + homePosition().x + ')');
        // the crash from 13 Oct: a position that rounds to -0, and a drag that starts in the middle of a walk
        let crash = 'none'; try { win.setPosition(Math.round(-0.3), win.getPosition()[1]); } catch (err) { crash = 'raw setPosition throws (' + err.message.slice(0, 40) + ')'; }
        const before = win.getPosition(); moveTo(-0.3, before[1]); const at = win.getPosition(); moveTo(before[0], before[1]);
        probe.push('minus zero: ' + crash + ' ; moveTo(-0.3) put him at x ' + at[0]);
        await js("window.guard.walk('center')"); await wait(1200);
        const midWalk = win.getBounds().x;
        await js("window.guard.dragStart(); window.guard.drag(-150, -250)"); await wait(600);
        const grabbed = win.getBounds();
        await js("window.guard.drop()"); await wait(9000);
        probe.push('drag during a walk: was walking at x ' + midWalk + ', grabbed to ' + grabbed.x + ',' + grabbed.y + ', after the drop he is home at x ' + win.getBounds().x + ' y ' + win.getBounds().y);
        await js("window.guard.walk('center')");
        const xs = []; for (let i = 0; i < 8; i++) { await wait(1000); xs.push(win.getBounds().x); }
        probe.push('x each second: ' + xs.join(' '));
        const area = screen.getPrimaryDisplay().workArea;
        probe.push('walk to the middle: window x ' + win.getBounds().x + ', expected ' + Math.round(area.x + (area.width - WIN.width) / 2) + ', pose ' + await js("window.__tokku.ch.visual.name || window.__tokku.ch.visual.type"));
        r.status += ' | PROBE ' + probe.join(' ; ');
        fs.writeFileSync(shot + '.txt', r.status + ' | window ' + JSON.stringify(win.getBounds()) + ' | onTop ' + state.top + ' | focusable ' + win.isFocusable() + ' | sensed ' + JSON.stringify(state.lastReport || null));
      } catch (err) { fs.writeFileSync(shot + '.txt', 'SELF-TEST ERROR: ' + err.message); }
      app.quit();
    }, 8000));
  }
}

// ---------- renderer requests (the only things it can ask for) ----------
function moveTo(x, y) {
  x = Math.round(x) | 0; y = Math.round(y) | 0;                     // "| 0" turns -0 and anything odd into a plain whole number
  try { if (win && !win.isDestroyed()) win.setPosition(x, y); } catch (err) { /* a bad position must never stop Tokku */ }
}
let walkTimer = null;
const WALK_PX_PER_SEC = 200;
ipcMain.on('tokku:walk', (e, where) => {
  if (!win || win.isDestroyed()) return;
  clearInterval(walkTimer);
  const home = homePosition(), a = screen.getPrimaryDisplay().workArea;
  const targetX = where === 'center' ? Math.round(a.x + (a.width - WIN.width) / 2) : home.x;
  let x = win.getPosition()[0], last = Date.now();
  walkTimer = setInterval(() => {
    if (!win || win.isDestroyed()) { clearInterval(walkTimer); return; }
    const now = Date.now(), step = WALK_PX_PER_SEC * (now - last) / 1000; last = now;
    x = Math.abs(targetX - x) <= step ? targetX : x + Math.sign(targetX - x) * step;
    moveTo(x, home.y);
    if (x === targetX) { clearInterval(walkTimer); send({ type: 'arrived', where }); }
  }, 16);
});
// Dragging: the window follows the mouse, then drops back to the floor.
let dragFrom = null;
ipcMain.on('tokku:drag-start', () => { if (win && !win.isDestroyed()) { clearInterval(walkTimer); dragFrom = win.getPosition(); } });
ipcMain.on('tokku:drag', (e, dx, dy) => {
  if (!win || win.isDestroyed() || !dragFrom) return;
  const a = screen.getPrimaryDisplay().workArea, home = homePosition();
  const x = Math.max(a.x - 120, Math.min(a.x + a.width - WIN.width + 60, dragFrom[0] + Math.round(dx)));
  const y = Math.max(a.y - 150, Math.min(home.y, dragFrom[1] + Math.round(dy)));
  moveTo(x, y);
});
ipcMain.on('tokku:drop', () => {
  if (!win || win.isDestroyed()) return;
  dragFrom = null; clearInterval(walkTimer);
  const home = homePosition(); let [x, y] = win.getPosition(), v = 300, last = Date.now();
  walkTimer = setInterval(() => {                                   // falls to the floor, a little faster each moment
    if (!win || win.isDestroyed()) { clearInterval(walkTimer); return; }
    const now = Date.now(), dt = (now - last) / 1000; last = now; v += 3200 * dt;
    y = Math.min(home.y, y + v * dt);
    moveTo(x, y);
    if (y >= home.y) { clearInterval(walkTimer); send({ type: 'arrived', where: 'ground' }); }
  }, 16);
});
ipcMain.on('tokku:hover', (e, on) => { if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!on, { forward: true }); });
// He is on top when the renderer asks for it (a question, a nudge), and also while the bare desktop is in front:
// Win + D pushes every normal window behind the desktop, and he should still be standing there.
function applyTop() {
  if (!win || win.isDestroyed()) return;
  const want = !!(state.front || state.desktop);
  if (want === state.top) return;
  state.top = want;
  if (want) { win.setAlwaysOnTop(true, 'screen-saver'); win.showInactive(); win.moveTop(); }      // come forward without taking focus
  else win.setAlwaysOnTop(false);                                                                  // back to normal desktop level
}
ipcMain.on('tokku:front', (e, on) => { state.front = !!on; applyTop(); });

// ---------- tray ----------
function mealNow() { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner'; }
function setInterview(on) { state.interview = on; updateQuiet(); buildTray(); }
function buildTray() {
  const now = Date.now();
  state.pausesThisHour = state.pausesThisHour.filter(t => now - t < 3600000);
  const paused = state.pausedUntil > now;
  const menu = Menu.buildFromTemplate([
    { label: paused ? 'Paused until ' + new Date(state.pausedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pause 15 min',
      enabled: !paused && state.pausesThisHour.length < 2,
      click: () => { state.pausedUntil = Date.now() + 15 * 60000; state.pausesThisHour.push(Date.now()); send({ type: 'pause', minutes: 15 }); buildTray(); } },
    { label: 'Interview mode (Ctrl+Alt+Q)', type: 'checkbox', checked: state.interview, click: (i) => setInterview(i.checked) },
    { label: 'Do not disturb', type: 'checkbox', checked: state.dnd, click: (i) => { state.dnd = i.checked; updateQuiet(); } },
    { label: 'Quiet when mic or camera is in use', type: 'checkbox', checked: state.micCamera, click: (i) => { state.micCamera = i.checked; } },
    { type: 'separator' },
    { label: 'Breakfast', click: () => send({ type: 'meal', meal: 'breakfast' }) },
    { label: 'Lunch', click: () => send({ type: 'meal', meal: 'lunch' }) },
    { label: 'Dinner', click: () => send({ type: 'meal', meal: 'dinner' }) },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', enabled: app.isPackaged, checked: app.isPackaged && app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { label: 'Show what Tokku senses (debug line)', type: 'checkbox', checked: state.debug, click: (i) => { state.debug = i.checked; send({ type: 'debug', on: state.debug }); } },
    { label: 'Settings (coming in a later phase)', enabled: false },
    { label: 'What Tokku saw today (coming in a later phase)', enabled: false },
    { type: 'separator' },
    { label: 'Bring Tokku back to his corner', click: () => { clearInterval(walkTimer); const h = homePosition(); moveTo(h.x, h.y); win.showInactive(); send({ type: 'arrived', where: 'home' }); } },
    { label: 'Turn Tokku off', click: () => app.quit() },          // partner PIN is added in Phase 7
  ]);
  tray.setContextMenu(menu);
}
function createTray() {
  const full = nativeImage.createFromPath(path.join(RENDERER_ROOT, 'character', 'assets', 'rig_v3', 'idle_full.png'));
  const s = full.getSize();
  const side = Math.min(s.width, Math.round(s.height * 0.5));     // his head: the top half, cropped square
  const icon = full.crop({ x: Math.round((s.width - side) / 2 + s.width * 0.08), y: 0, width: Math.min(side, s.width), height: side }).resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  tray.setToolTip('Tokku');
  buildTray();
  tray.on('click', () => tray.popUpContextMenu());
}

// Windows pauses a window that is completely covered. Tokku is covered most of the time, and must still be able
// to notice a distraction and come forward, so that pausing is switched off.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.whenReady().then(() => {
    serveRenderer(); lockDownSession(); createWindow();
    sense.start((r) => {
      state.lastReport = r;
      state.desktop = !!r.desktop; applyTop();
      if (process.env.TOKKU_SHOT) return;                           // the self-test acts out its own activity
      state.sensed = r.reasons; updateQuiet();
      send({ type: 'activity', category: r.category, app: r.app, idle: r.idle, locked: r.locked, dt: r.dt, reasons: r.reasons, desktop: !!r.desktop });
      if (r.backMinutes >= 1) send({ type: 'back', minutes: r.backMinutes });
    }, { micCamera: () => state.micCamera });
    if (!process.env.TOKKU_SHOT) {
      createTray();
      globalShortcut.register('Control+Alt+Q', () => setInterview(!state.interview));
      screen.on('display-metrics-changed', () => { const h = homePosition(); moveTo(h.x, h.y); });
      process.on('uncaughtException', (err) => { console.error('Tokku error:', err); });      // log it, no error box, keep running
    }
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
