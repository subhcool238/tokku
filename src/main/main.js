/* Tokku main process ("Guard"). Phase 0: opens one sandboxed window that shows the character.
   The renderer is served from a private app:// scheme, so it never needs the network
   and the Content Security Policy can stay at default-src 'self'. */
const { app, BrowserWindow, protocol, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

const RENDERER_ROOT = path.join(__dirname, '..', 'renderer');
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'";

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

function createWindow() {
  const win = new BrowserWindow({
    width: 360, height: 460,
    title: 'Tokku',
    backgroundColor: '#2b2f3a',
    autoHideMenuBar: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadURL('app://tokku/index.html');

  // self-test: TOKKU_SHOT=<png path> saves the canvas picture and the status line, then quits
  const shot = process.env.TOKKU_SHOT;
  if (shot) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      try {
        const r = await win.webContents.executeJavaScript(
          "({ status: document.getElementById('status').textContent, png: document.getElementById('stage').toDataURL('image/png') })");
        fs.writeFileSync(shot, Buffer.from(r.png.split(',')[1], 'base64'));
        fs.writeFileSync(shot + '.txt', r.status);
      } catch (err) { fs.writeFileSync(shot + '.txt', 'SELF-TEST ERROR: ' + err.message); }
      app.quit();
    }, 2500));
  }
  return win;
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.whenReady().then(() => { serveRenderer(); lockDownSession(); createWindow(); });
  app.on('window-all-closed', () => app.quit());
}
