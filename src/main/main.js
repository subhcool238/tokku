/* Tokku main process ("Guard"). Phase 1: Tokku lives in the top right corner of the desktop.
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
const WIN = { width: 340, height: 452, margin: 14 };

let win = null, tray = null;
const state = { interview: false, dnd: false, pausedUntil: 0, pausesThisHour: [] };

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
  return { x: a.x + a.width - WIN.width - WIN.margin, y: a.y + WIN.margin };
}

function send(ev) { if (win && !win.isDestroyed()) win.webContents.send('guard:event', ev); }

function createWindow() {
  const home = homePosition();
  win = new BrowserWindow({
    ...home, width: WIN.width, height: WIN.height,
    title: 'Tokku', show: false,
    transparent: true, frame: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    skipTaskbar: true, focusable: false, hasShadow: false, alwaysOnTop: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.js') },
  });
  win.setIgnoreMouseEvents(true, { forward: true });             // clicks pass through to whatever is behind him
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadURL('app://tokku/index.html');
  win.once('ready-to-show', () => win.showInactive());            // never steals keyboard focus

  // self-test: TOKKU_SHOT=<png path> saves the canvas picture and a status line, then quits
  const shot = process.env.TOKKU_SHOT;
  if (shot) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      try {
        const r = await win.webContents.executeJavaScript(
          "({ status: window.__tokkuStatus ? window.__tokkuStatus() : 'no status', png: document.getElementById('stage').toDataURL('image/png') })");
        fs.writeFileSync(shot, Buffer.from(r.png.split(',')[1], 'base64'));
        fs.writeFileSync(shot + '.txt', r.status + ' | window ' + JSON.stringify(win.getBounds()) + ' | onTop ' + win.isAlwaysOnTop() + ' | focusable ' + win.isFocusable());
      } catch (err) { fs.writeFileSync(shot + '.txt', 'SELF-TEST ERROR: ' + err.message); }
      app.quit();
    }, 3000));
  }
}

// ---------- renderer requests (the only things it can ask for) ----------
ipcMain.on('tokku:hover', (e, on) => { if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!on, { forward: true }); });
ipcMain.on('tokku:front', (e, on) => {
  if (!win || win.isDestroyed()) return;
  if (on) { win.setAlwaysOnTop(true, 'screen-saver'); win.showInactive(); }      // come forward without taking focus
  else win.setAlwaysOnTop(false);                                                 // back to normal desktop level
});

// ---------- tray ----------
function mealNow() { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner'; }
function setInterview(on) { state.interview = on; send({ type: 'quiet', on: state.interview || state.dnd, reason: 'interview' }); buildTray(); }
function buildTray() {
  const now = Date.now();
  state.pausesThisHour = state.pausesThisHour.filter(t => now - t < 3600000);
  const paused = state.pausedUntil > now;
  const menu = Menu.buildFromTemplate([
    { label: paused ? 'Paused until ' + new Date(state.pausedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pause 15 min',
      enabled: !paused && state.pausesThisHour.length < 2,
      click: () => { state.pausedUntil = Date.now() + 15 * 60000; state.pausesThisHour.push(Date.now()); send({ type: 'pause', minutes: 15 }); buildTray(); } },
    { label: 'Interview mode (Ctrl+Alt+Q)', type: 'checkbox', checked: state.interview, click: (i) => setInterview(i.checked) },
    { label: 'Do not disturb', type: 'checkbox', checked: state.dnd, click: (i) => { state.dnd = i.checked; send({ type: 'quiet', on: state.interview || state.dnd, reason: 'dnd' }); } },
    { type: 'separator' },
    { label: 'Breakfast', click: () => send({ type: 'meal', meal: 'breakfast' }) },
    { label: 'Lunch', click: () => send({ type: 'meal', meal: 'lunch' }) },
    { label: 'Dinner', click: () => send({ type: 'meal', meal: 'dinner' }) },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', enabled: app.isPackaged, checked: app.isPackaged && app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { label: 'Settings (coming in a later phase)', enabled: false },
    { label: 'What Tokku saw today (coming in a later phase)', enabled: false },
    { type: 'separator' },
    { label: 'Bring Tokku back to his corner', click: () => { const h = homePosition(); win.setPosition(h.x, h.y); win.showInactive(); } },
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

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.whenReady().then(() => {
    serveRenderer(); lockDownSession(); createWindow();
    if (!process.env.TOKKU_SHOT) {
      createTray();
      globalShortcut.register('Control+Alt+Q', () => setInterview(!state.interview));
      screen.on('display-metrics-changed', () => { const h = homePosition(); if (win && !win.isDestroyed()) win.setPosition(h.x, h.y); });
    }
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
