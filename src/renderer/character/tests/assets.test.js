// Run: node src/renderer/character/tests/assets.test.js   (no dependencies)
// Checks the art v3 files against character.json: every frame exists, is transparent, and stands on its feet line.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ASSETS = path.join(__dirname, '..', 'assets');
const char = JSON.parse(fs.readFileSync(path.join(ASSETS, 'character.json'), 'utf8'));
let pass = 0, fail = 0; const fails = [];
function check(name, cond, info = '') { if (cond) pass++; else { fail++; fails.push('FAIL ' + name + (info ? '  [' + info + ']' : '')); } }

// Minimal PNG reader (8 bit RGBA, not interlaced): returns { w, h, alpha(x, y) }
function readPng(file) {
  const b = fs.readFileSync(file);
  let p = 8, w = 0, h = 0, type = -1, depth = 0, lace = 0; const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), kind = b.toString('latin1', p + 4, p + 8), data = b.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; lace = data[12]; }
    if (kind === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  if (type !== 6 || depth !== 8 || lace !== 0) return { w, h, rgba: false };
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = 4, stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0, up = y ? out[dst + x - stride] : 0, c = (y && x >= bpp) ? out[dst + x - stride - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? up : c); }
      out[dst + x] = v & 255;
    }
  }
  return { w, h, rgba: true, alpha: (x, y) => out[y * stride + x * 4 + 3], px: (x, y) => out.subarray(y * stride + x * 4, y * stride + x * 4 + 4) };
}

// lowest row with solid coloured or dark pixels (same idea as the pipeline: a light grey shadow does not count)
function feetRow(png) {
  for (let y = png.h - 1; y >= 0; y--) {
    let n = 0;
    for (let x = 0; x < png.w; x++) {
      const p = png.px(x, y); if (p[3] <= 153) continue;
      const mx = Math.max(p[0], p[1], p[2]), mn = Math.min(p[0], p[1], p[2]);
      if ((mx ? (mx - mn) / mx : 0) > 0.3 || mx / 255 < 0.35) n++;
    }
    if (n >= 3) return y;
  }
  return -1;
}

const v3 = Object.entries(char.poses).filter(([, p]) => !p.legacy);
check('there are 84 art v3 frames', v3.length === 84, String(v3.length));

// 1. every frame named in a sequence exists in character.json and on disk
for (const [name, q] of Object.entries(char.sequences)) {
  for (const f of q.frames.concat(q.extras || [])) {
    const p = char.poses[f.pose];
    check(`sequence ${name}: frame ${f.pose} is in character.json`, !!p && !p.legacy);
    check(`sequence ${name}: frame ${f.pose} is on disk`, !!p && fs.existsSync(path.join(ASSETS, p.file)));
  }
  if (q.hold) check(`sequence ${name}: hold frame is one of its frames`, q.frames.some(f => f.pose === q.hold));
}
for (const n of [...char.walk.right, ...char.walk.start, ...char.walk.stop]) check(`walk frame ${n} exists`, !!char.poses[n] && fs.existsSync(path.join(ASSETS, char.poses[n].file)));
check('turn ring has 12 views', char.ring.ring.length === 12);
for (const r of char.ring.ring) check(`ring view ${r.yaw} (${r.pose}) is on disk`, fs.existsSync(path.join(ASSETS, r.file)));
check('ring covers every 30 degrees', [...char.ring.ring].map(r => (r.yaw + 360) % 360).sort((a, b) => a - b).join() === [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].join());

// 2. every exported PNG has transparency, 3. feet line
for (const [name, p] of v3) {
  const file = path.join(ASSETS, p.file);
  if (!fs.existsSync(file)) { check(`${name}: file exists`, false); continue; }
  const png = readPng(file);
  check(`${name}: is an RGBA PNG of the size in character.json`, png.rgba && png.w === p.w && png.h === p.h, `${png.w}x${png.h}`);
  if (!png.rgba) continue;
  const corners = [png.alpha(0, 0), png.alpha(png.w - 1, 0), png.alpha(0, png.h - 1), png.alpha(png.w - 1, png.h - 1)];
  check(`${name}: has a transparent background`, corners.every(a => a === 0), corners.join(','));
  const fr = feetRow(png), want = p.feetY - (p.airPx || 0);
  check(`${name}: feet within 3 px of feetY${p.airPx ? ' (airborne, ' + p.airPx + ' px up)' : ''}`, Math.abs(fr - want) <= 3, `feet row ${fr}, expected ${want}`);
  check(`${name}: anchor inside the picture, sensible scale`, p.anchorX > 0 && p.anchorX < p.w && p.scale > 0.5 && p.scale < 2.2, `anchorX ${p.anchorX} scale ${p.scale}`);
}

// 4. idle rig layers
for (const f of [...Object.values(char.rig.layers), ...Object.values(char.rig.overlays)]) {
  const file = path.join(ASSETS, f);
  check(`rig layer ${f} is on disk`, fs.existsSync(file));
  if (fs.existsSync(file)) { const png = readPng(file); check(`rig layer ${f} matches the rig size`, png.rgba && png.w === char.rig.w && png.h === char.rig.h, `${png.w}x${png.h}`); }
}

// 5. the page data file is in sync with character.json
const dataJs = fs.readFileSync(path.join(ASSETS, 'character.data.js'), 'utf8');
const embedded = JSON.parse(dataJs.slice(dataJs.indexOf('window.TOKKU_CHARACTER = ') + 25, dataJs.lastIndexOf(';')));
check('character.data.js matches character.json', JSON.stringify(embedded) === JSON.stringify(char));

console.log(fails.join('\n') + (fails.length ? '\n' : '') + `${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
