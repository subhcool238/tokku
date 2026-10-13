/* Phone link (ntfy). Runs in the main process only.
   - The topic is a long random string. It is stored encrypted with Electron safeStorage (Windows DPAPI)
     in the user's app data folder, never in the project folder and never in git.
   - Only fixed text is ever sent: no window titles, no app names, no task names.
   - The only address this file may talk to is https://ntfy.sh. */
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');

const HOST = 'ntfy.sh';
const file = () => path.join(app.getPath('userData'), 'phone-link.json');

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return { on: j.on !== false, topic: j.topic ? safeStorage.decryptString(Buffer.from(j.topic, 'base64')) : null };
  } catch { return { on: true, topic: null }; }
}
function save(s) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows encryption is not available');
  fs.writeFileSync(file(), JSON.stringify({ on: s.on, topic: s.topic ? safeStorage.encryptString(s.topic).toString('base64') : null }));
}
function newTopic() { return 'tokku-' + crypto.randomBytes(18).toString('base64url'); }      // 24 random characters: nobody can guess it

// One away session = one ping. Pure function, so it can be tested without a phone.
function shouldPing(s) {
  return s.linked && s.on && !s.alreadyPinged && s.awaySec >= s.afterSec && !s.quiet && !s.paused && s.brainState !== 'meal' && s.brainState !== 'waking';
}
function awayText(minutes) { return `Your computer has been idle for ${minutes} minutes. Tokku is waiting.`; }

function send(topic, text) {
  return new Promise((resolve) => {
    if (!/^tokku-[A-Za-z0-9_-]{20,}$/.test(topic || '')) return resolve({ ok: false, error: 'no topic' });
    const req = https.request({ host: HOST, path: '/' + topic, method: 'POST', timeout: 8000,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', Title: 'Tokku', Tags: 'eyes' } },
      (res) => { res.resume(); resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, error: 'ntfy answered ' + res.statusCode }); });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', (err) => resolve({ ok: false, error: err.message }));      // offline: the ping is dropped, a late one is useless
    req.end(text);
  });
}

module.exports = { load, save, newTopic, shouldPing, awayText, send };
