/* Builds a portable Windows copy of Tokku: no installer, no Node.js needed.
   Run:  node tools/package-win.js            -> dist/Tokku/ and dist/Tokku-Windows.zip
   It copies the Electron runtime already in node_modules (nothing is downloaded), renames it to Tokku.exe,
   and puts the app and only its production packages in resources/app. No settings, tokens or topics are included:
   those live in each user's own Windows profile. */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'Tokku');
const APP = path.join(OUT, 'resources', 'app');
const ZIP = path.join(ROOT, 'dist', 'Tokku-Windows.zip');
const SKIP = [/[\\/]tests?[\\/]/, /[\\/]backup[\\/]/, /[\\/]assets[\\/]_old[\\/]/, /[\\/]assets[\\/]rig[\\/]/, /\.map$/];

const copy = (from, to) => fs.cpSync(from, to, { recursive: true, filter: (p) => !SKIP.some(r => r.test(p)) });

fs.rmSync(path.join(ROOT, 'dist'), { recursive: true, force: true });
console.log('1/5 Electron runtime');
fs.cpSync(path.join(ROOT, 'node_modules', 'electron', 'dist'), OUT, { recursive: true });
fs.renameSync(path.join(OUT, 'electron.exe'), path.join(OUT, 'Tokku.exe'));
fs.rmSync(path.join(OUT, 'resources', 'default_app.asar'), { force: true });
for (const f of fs.readdirSync(path.join(OUT, 'locales'))) if (f !== 'en-US.pak') fs.rmSync(path.join(OUT, 'locales', f));   // English only: saves about 40 MB

console.log('2/5 app files');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
fs.mkdirSync(APP, { recursive: true });
fs.writeFileSync(path.join(APP, 'package.json'), JSON.stringify({ name: pkg.name, productName: 'Tokku', version: pkg.version,
  description: pkg.description, author: pkg.author, main: pkg.main, dependencies: pkg.dependencies }, null, 1));
copy(path.join(ROOT, 'src'), path.join(APP, 'src'));

console.log('3/5 production packages');
const list = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ls', '--omit=dev', '--all', '--parseable'], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
const dirs = list.split(/\r?\n/).filter(Boolean).filter(d => path.resolve(d) !== ROOT);
for (const d of dirs) {
  const rel = path.relative(ROOT, d);
  if (!rel.startsWith('node_modules')) continue;
  copy(d, path.join(APP, rel));
}
console.log('   ' + dirs.length + ' packages');

console.log('4/5 instructions');
fs.writeFileSync(path.join(OUT, 'READ ME FIRST.txt'), [
  'Tokku for Windows 10 and 11',
  '',
  '1. Double click Tokku.exe.',
  '2. If Windows shows "Windows protected your PC": click "More info", then "Run anyway".',
  '   This appears because the app is not signed with a paid certificate.',
  '3. Tokku appears in the bottom right corner of your screen. There is no window around him.',
  '',
  'Try: hover over him, drag him, open YouTube for 45 seconds, or use the tray icon near the clock',
  '(it may be under the small arrow). Tray, More, Demo mode makes every timer short.',
  'To close him: tray icon, Turn Tokku off.',
  '',
  'Optional: connect Notion and your phone from the tray menu. Nothing is set up in this copy.',
  'Source code and privacy notes: https://github.com/subhcool238/tokku',
  '',
].join('\r\n'));

console.log('5/5 zip');
execFileSync(process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\Windows', 'System32', 'tar.exe') : 'tar', ['-a', '-c', '-f', ZIP, '-C', path.join(ROOT, 'dist'), 'Tokku']);
console.log('done: ' + ZIP + ' (' + Math.round(fs.statSync(ZIP).size / 1048576) + ' MB)');
