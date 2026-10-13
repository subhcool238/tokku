/* Partner PIN. The PIN itself is never stored: only a salted scrypt hash, in the user's app data folder.
   The partner can only unlock. They never see what the user was doing. */
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const file = () => path.join(app.getPath('userData'), 'partner-pin.json');
const logFile = () => path.join(app.getPath('userData'), 'tokku-log.txt');
const valid = (pin) => /^\d{4,6}$/.test(String(pin || ''));

function hash(pin, salt) { return crypto.scryptSync(String(pin), salt, 32); }
function make(pin) { const salt = crypto.randomBytes(16); return { salt: salt.toString('base64'), hash: hash(pin, salt).toString('base64') }; }
function matches(pin, rec) {
  if (!rec || !valid(pin)) return false;
  const want = Buffer.from(rec.hash, 'base64'), got = hash(pin, Buffer.from(rec.salt, 'base64'));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

function read() { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return null; } }
const isSet = () => !!read();
function check(pin) { return matches(pin, read()); }
function set(pin) { if (!valid(pin)) return false; fs.writeFileSync(file(), JSON.stringify(make(pin))); return true; }
function logEmergency(reason) {
  fs.appendFileSync(logFile(), new Date().toISOString() + '  emergency exit: ' + String(reason).replace(/\s+/g, ' ').slice(0, 300) + '\n');
}

module.exports = { valid, make, matches, isSet, check, set, logEmergency };
