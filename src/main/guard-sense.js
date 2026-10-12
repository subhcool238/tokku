/* Guard sensing. Runs in the main process only.
   Every 3 seconds it looks at the window in front, turns its title into a category, and throws the title away.
   What leaves this file is only: { category, app label, idle seconds, quiet reasons }. Titles are never stored,
   logged or sent anywhere. The mic and camera check reads a yes or no flag from the Windows privacy registry;
   Tokku never opens the mic or camera himself. */
const { powerMonitor, screen } = require('electron');
const { execFile } = require('node:child_process');

const POLL_MS = 3000;
const VIDEO = [['youtube', 'YouTube'], ['netflix', 'Netflix'], ['jiohotstar', 'Hotstar'], ['hotstar', 'Hotstar'], ['prime video', 'Prime Video'], ['primevideo', 'Prime Video']];
const GAME = [['steam', 'Steam'], ['epic games', 'Epic Games']];
const MEETING = ['zoom meeting', 'meet -', 'microsoft teams', 'webex', 'skype', 'discord'];
const SHELL = ['explorer.exe', 'windows explorer', 'searchhost.exe', 'shellexperiencehost.exe', 'lockapp.exe'];

function classify(title, owner) {
  const t = (title || '').toLowerCase(), o = (owner || '').toLowerCase();
  for (const [key, label] of VIDEO) if (t.includes(key)) return { category: 'video', app: label };
  for (const [key, label] of GAME) if (t.includes(key) || o.includes(key)) return { category: 'game', app: label };
  if (MEETING.some(k => t.includes(k)) && !(o.includes('discord') && !/voice|call/.test(t))) return { category: 'meeting', app: null };
  return { category: t ? 'work' : 'other', app: null };
}

// "in use now" = any app entry whose LastUsedTimeStop is 0 (the same data that shows the mic icon in the taskbar)
function deviceInUse(kind) {
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\' + kind;
  return new Promise((resolve) => {
    execFile('reg', ['query', key, '/s', '/v', 'LastUsedTimeStop'], { windowsHide: true, timeout: 4000 }, (err, out) => {
      resolve((out || '').split(/\r?\n/).some(l => /LastUsedTimeStop/.test(l) && /\s0x0\s*$/.test(l)));
    });
  });
}

function start(onReport, options) {
  let activeWindow = null, locked = false, awaySince = 0, busy = false, lastPoll = Date.now();
  import('get-windows').then(m => { activeWindow = m.activeWindow; }).catch(() => {});
  powerMonitor.on('lock-screen', () => { locked = true; if (!awaySince) awaySince = Date.now(); });
  powerMonitor.on('unlock-screen', () => { locked = false; });
  powerMonitor.on('suspend', () => { if (!awaySince) awaySince = Date.now(); });

  async function poll() {
    if (busy) return; busy = true;
    try {
      const now = Date.now(), dt = Math.min(10, (now - lastPoll) / 1000); lastPoll = now;
      const idle = powerMonitor.getSystemIdleTime();
      let seen = { category: 'other', app: null }, full = false;
      if (activeWindow && !locked) {
        const w = await activeWindow().catch(() => null);
        if (w) {
          const owner = (w.owner && w.owner.name) || '';
          seen = classify(w.title, owner);                             // the raw title is not kept beyond this line
          const d = screen.getDisplayMatching(w.bounds).bounds, b = w.bounds;
          full = !SHELL.includes(owner.toLowerCase()) && !!w.title && b.x <= d.x && b.y <= d.y && b.width >= d.width && b.height >= d.height;
        }
      }
      const reasons = [];
      if (seen.category === 'meeting') reasons.push('meeting');
      if (options.micCamera()) { const [mic, cam] = await Promise.all([deviceInUse('microphone'), deviceInUse('webcam')]); if (mic) reasons.push('mic'); if (cam) reasons.push('camera'); }
      if (full && seen.category !== 'video' && seen.category !== 'game') reasons.push('fullscreen');

      // away: idle or locked. Reported once, when you come back.
      if ((idle >= 60 || locked) && !awaySince) awaySince = now - idle * 1000;
      let backMinutes = 0;
      if (awaySince && !locked && idle < 5) { backMinutes = Math.round((now - awaySince) / 60000); awaySince = 0; }

      onReport({ category: locked ? 'other' : seen.category, app: seen.app, idle, locked, dt, reasons, backMinutes });
    } finally { busy = false; }
  }
  const timer = setInterval(poll, POLL_MS);
  return () => clearInterval(timer);
}

module.exports = { start, classify };
