/* Guard sensing. Runs in the main process only.
   Every 3 seconds it looks at the window in front, turns its title into a category, and throws the title away.
   What leaves this file is only: { category, app label, idle seconds, quiet reasons }. Titles are never stored,
   logged or sent anywhere. The mic and camera check reads a yes or no flag from the Windows privacy registry;
   Tokku never opens the mic or camera himself. */
const { powerMonitor, screen } = require('electron');
const { execFile } = require('node:child_process');

const POLL_MS = 1000;
const SLOW_EVERY = 3;            // mic and camera are checked every third look (they start a small Windows tool each time)
// Matched against the window title and the app name, lower case. The first match wins.
const VIDEO = [['youtube', 'YouTube'], ['netflix', 'Netflix'], ['jiohotstar', 'Hotstar'], ['hotstar', 'Hotstar'], ['disney+', 'Disney+'],
  ['prime video', 'Prime Video'], ['primevideo', 'Prime Video'], ['amazon video', 'Prime Video'], ['sonyliv', 'SonyLIV'], ['sony liv', 'SonyLIV'],
  ['zee5', 'ZEE5'], ['jiocinema', 'JioCinema'], ['mx player', 'MX Player'], ['apple tv', 'Apple TV'], ['crunchyroll', 'Crunchyroll'],
  ['twitch', 'Twitch'], ['hulu', 'Hulu'], ['max |', 'Max'], ['instagram', 'Instagram'], ['reels', 'Reels'], ['tiktok', 'TikTok']];
const GAME = [['steam', 'Steam'], ['epic games', 'Epic Games'], ['riot client', 'Riot Games'], ['valorant', 'Valorant'], ['league of legends', 'League of Legends'],
  ['battle.net', 'Battle.net'], ['xbox', 'Xbox'], ['ea app', 'EA app'], ['ubisoft connect', 'Ubisoft Connect'], ['gog galaxy', 'GOG Galaxy'],
  ['minecraft', 'Minecraft'], ['roblox', 'Roblox'], ['genshin', 'Genshin Impact'], ['counter-strike', 'Counter-Strike'], ['fortnite', 'Fortnite']];
const MEETING = ['zoom meeting', 'meet -', 'microsoft teams', 'webex', 'skype', 'discord'];
// never counted as a full screen work app: the desktop itself, and screenshot overlays (Win + Shift + S)
const NOT_FULLSCREEN_APP = /explorer|search|shell ?experience|lock ?app|snip|screen ?clipping|screen ?sketch|screenshot|sharex|lightshot|greenshot/i;
const FULLSCREEN_POLLS = 9;      // full screen must last about 9 seconds before it means Quiet mode

function classify(title, owner) {
  const t = (title || '').toLowerCase(), o = (owner || '').toLowerCase();
  for (const [key, label] of VIDEO) if (t.includes(key) || o.includes(key)) return { category: 'video', app: label };
  for (const [key, label] of GAME) if (t.includes(key) || o.includes(key)) return { category: 'game', app: label };
  if (MEETING.some(k => t.includes(k)) && !(o.includes('discord') && !/voice|call/.test(t))) return { category: 'meeting', app: null };
  return { category: t ? 'work' : 'other', app: null };
}

// "in use now" = any app entry whose LastUsedTimeStop is 0 (the same data that shows the mic icon in the taskbar)
// Screen recorders use the microphone too, but recording your screen is not a call: these never cause Quiet mode.
const RECORDERS = /ScreenSketch|XboxGamingOverlay|XboxGameBar|GamingApp|obs(64|32)?\.exe|obs-studio|sharex|camtasia|bandicam|screenrec|loom|clipchamp/i;
// Reads the output of "reg query": a line with the app's key, then its value. Returns true if any app that is
// not a screen recorder has LastUsedTimeStop = 0, which means "in use right now".
function inUseFromReg(out) {
  let app = '';
  for (const line of String(out || '').split(/?
/)) {
    if (/^HKEY_/i.test(line)) app = line;
    else if (/LastUsedTimeStop/.test(line) && /\s0x0\s*$/.test(line) && !RECORDERS.test(app)) return true;
  }
  return false;
}
function deviceInUse(kind) {
  const key = 'HKCU\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\' + kind;
  return new Promise((resolve) => {
    execFile('reg', ['query', key, '/s', '/v', 'LastUsedTimeStop'], { windowsHide: true, timeout: 4000 }, (err, out) => resolve(inUseFromReg(out)));
  });
}

function start(onReport, options) {
  let activeWindow = null, locked = false, awaySince = 0, busy = false, lastPoll = Date.now(), fullCount = 0, tickNo = 0, micCam = [false, false];
  import('get-windows').then(m => { activeWindow = m.activeWindow; }).catch(() => {});
  powerMonitor.on('lock-screen', () => { locked = true; if (!awaySince) awaySince = Date.now(); });
  powerMonitor.on('unlock-screen', () => { locked = false; });
  powerMonitor.on('suspend', () => { if (!awaySince) awaySince = Date.now(); });

  async function poll() {
    if (busy) return; busy = true;
    try {
      const now = Date.now(), dt = Math.min(10, (now - lastPoll) / 1000); lastPoll = now;
      const idle = powerMonitor.getSystemIdleTime();
      let seen = { category: 'other', app: null }, full = false, desktop = false;
      if (activeWindow && !locked) {
        const w = await activeWindow().catch(() => null);
        if (w) {
          const owner = (w.owner && w.owner.name) || '';
          seen = classify(w.title, owner);                             // the raw title is not kept beyond this line
          desktop = /explorer/i.test(owner) && (!w.title || w.title === 'Program Manager');      // the bare desktop (Win + D, or a click on it)
          const d = screen.getDisplayMatching(w.bounds).bounds, b = w.bounds;
          full = !NOT_FULLSCREEN_APP.test(owner + ' ' + ((w.owner && w.owner.path) || '').split(/[\\/]/).pop()) && !!w.title
            && b.x <= d.x && b.y <= d.y && b.width >= d.width && b.height >= d.height;
        }
      }
      const reasons = [];
      if (seen.category === 'meeting') reasons.push('meeting');
      if (!options.micCamera()) micCam = [false, false];
      else if (tickNo++ % SLOW_EVERY === 0) micCam = await Promise.all([deviceInUse('microphone'), deviceInUse('webcam')]);
      if (micCam[0]) reasons.push('mic'); if (micCam[1]) reasons.push('camera');
      fullCount = (full && seen.category !== 'video' && seen.category !== 'game') ? fullCount + 1 : 0;
      if (fullCount >= FULLSCREEN_POLLS) reasons.push('fullscreen');

      // away: idle or locked. Reported once, when you come back.
      if ((idle >= 60 || locked) && !awaySince) awaySince = now - idle * 1000;
      let backMinutes = 0;
      if (awaySince && !locked && idle < 5) { backMinutes = Math.round((now - awaySince) / 60000); awaySince = 0; }

      onReport({ category: locked ? 'other' : seen.category, app: seen.app, idle, locked, dt, reasons, backMinutes, desktop });
    } finally { busy = false; }
  }
  const timer = setInterval(poll, POLL_MS);
  return () => clearInterval(timer);
}

module.exports = { start, classify, inUseFromReg };
