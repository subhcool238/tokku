/* Tokku character engine v2 (2.5D, no dependencies).
   Replaces tokku-sprite.js (v1 is kept in backup/).

   What it does:
   - "Rig" idle: the front idle pose split into layers (body, tail, two ears) plus
     overlays (blink half, blink closed, mouth open). The body stays still while the
     eyes blink, ears twitch, tail moves by mood and the mouth flaps while talking.
   - Turn ring: 12 views from the turnaround sheet, stepped with short crossfades.
   - Poses: 23 single poses from the pose sheet (sleep, yawn, stretch, happy, annoyed...).
   - Every visual change is a crossfade, so nothing pops.
   - Walking: anticipation, turn, eased speed, 2-frame walk cycle advanced by distance
     (not by time) so feet do not slide, small bob, settle on arrival.
   - All actions are cancellable: starting a new action cleanly stops the old one.

   Host usage:
     const t = new TokkuCharacter(characterJson, images); // images: {"rig/body.png": Image, ...}
     t.x = 1100; t.groundY = 360;
     each frame: t.update(dtSeconds); t.draw(ctx);
*/
(function (root) {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  // Tail moods: base angle (deg, + = tip up toward body), sway amplitude, sway Hz, scale (puff), bristle jitter
  const MOODS = {
    focused:   { base: 1,  amp: 1.5, hz: 0.22, scale: 1.0,  jit: 0 },
    calm:      { base: 3,  amp: 3.0, hz: 0.32, scale: 1.0,  jit: 0 },
    curious:   { base: 6,  amp: 3.5, hz: 0.5,  scale: 1.02, jit: 0 },
    happy:     { base: 12, amp: 7.0, hz: 1.4,  scale: 1.05, jit: 0 },
    celebrate: { base: 15, amp: 8.0, hz: 2.6,  scale: 1.08, jit: 0 },
    annoyed:   { base: 8,  amp: 0.8, hz: 0.6,  scale: 1.16, jit: 1.1 },
    sleepy:    { base: 0,  amp: 1.0, hz: 0.15, scale: 1.0,  jit: 0 },
  };

  class TokkuCharacter {
    constructor(char, images) {
      this.c = char; this.img = images;
      this.S = char.displayHeightPx / char.spriteHeightPx;   // sprite px -> screen px
      this.ring = char.ring.ring.slice().sort((a, b) => a.yaw - b.yaw);
      this.x = 0; this.groundY = 0;
      this.time = 0;
      this.visual = { type: 'rig' }; this.prev = null; // prev = {visual, t0, dur}
      this.yaw = 0;
      this.token = 0; this.waiters = [];
      this.squash = 0; this.squashV = 0;
      this.hopH = 0; this.hopT = -1; this.hopDur = 0.35; this.yOff = 0;
      this.lean = 0; this.leanTarget = 0;
      this.alpha = 1; this.alphaTarget = 1;
      this.mood = 'calm'; this.tailP = Object.assign({}, MOODS.calm); this.tailPhase = 0;
      this.blink = 0; this.blinkClock = 2 + Math.random() * 3; this.blinkSeq = null;
      this.ear = { l: 0, lv: 0, r: 0, rv: 0 }; this.earClock = 4 + Math.random() * 5;
      this.talking = false; this.mouth = 0; this.mouthClock = 0;
      this.breathAmp = 0.006; this.breathHz = 0.35;
      this.sleeping = false; this.zs = []; this.zClock = 0;
      this.walk = null; this.mode = 'idle';
      this.minimalMotion = false; // focus sessions: fewer ear twitches, no extra movement
      // offscreen buffer so layered drawing fades as one image
      const doc = root.document;
      this.buf = doc ? doc.createElement('canvas') : null;
      this.M = 80; // margin around the rig for tail rotation
      if (this.buf) { this.buf.width = char.rig.w + this.M * 2; this.buf.height = char.rig.h + this.M * 2; this.bctx = this.buf.getContext('2d'); }
    }

    // ---------- time helpers (engine time, so tests can speed it up) ----------
    wait(ms) { const until = this.time + ms / 1000; return new Promise(r => this.waiters.push({ until, r })); }
    _begin() { this.token++; this.walk && this.walk.done && this.walk.done(false); this.walk = null; return this.token; }
    _alive(tk) { return tk === this.token; }

    // ---------- visual switching ----------
    setVisual(v, fadeMs = 180) {
      if (sameVisual(v, this.visual)) return;
      this.prev = fadeMs > 0 ? { visual: this.visual, t0: this.time, dur: fadeMs / 1000 } : null;
      this.visual = v;
    }
    pose(name, fadeMs = 140, flip = false) {
      const p = this.c.poses[name]; if (!p) { console.warn('missing pose', name); return; }
      if (!name.startsWith('walk')) { this.yaw = 0; if (this.visual.type !== 'pose' || this.visual.name !== name) this.squashV += 2.2; }  // small squash hides the swap
      this.setVisual({ type: 'pose', name, flip }, fadeMs);
    }
    rig(fadeMs = 150) { this.setVisual({ type: 'rig' }, fadeMs); this.yaw = 0; }
    ringIdx(yaw) { let b = 0, bd = 1e9; this.ring.forEach((r, i) => { const d = Math.abs(angDiff(r.yaw, yaw)); if (d < bd) { bd = d; b = i; } }); return b; }
    setMood(m) { if (MOODS[m]) this.mood = m; }

    // ---------- primitive motions ----------
    hop(heightPx = 18, durMs = 340) { this.hopH = heightPx; this.hopDur = durMs / 1000; this.hopT = 0; this.squashV -= 2.5; }
    bounce(k = 1) { this.squashV += 5 * k; }
    twitchEar(side = Math.random() < 0.5 ? 'l' : 'r', k = 1) { this.ear[side + 'v'] += (side === 'l' ? 1 : -1) * 260 * k; }
    talk(on) { this.talking = !!on; if (!on) this.mouth = 0; }
    setQuietLook(on) { this.alphaTarget = on ? 0.55 : 1; }

    async turnTo(yaw, tk = this.token) {
      if (this.visual.type !== 'ring') { this.setVisual({ type: 'ring', idx: this.ringIdx(this.yaw) }, 140); await this.wait(110); if (!this._alive(tk)) return false; }
      const want = this.ringIdx(yaw); const n = this.ring.length;
      let idx = this.visual.idx;
      while (idx !== want) {
        const plus = ((this.ring[want].yaw - this.ring[idx].yaw) + 360) % 360;
        idx = (idx + (plus <= 180 ? 1 : -1) + n) % n;
        this.setVisual({ type: 'ring', idx }, 90);
        this.yaw = this.ring[idx].yaw;
        await this.wait(85); if (!this._alive(tk)) return false;
      }
      this.yaw = yaw; return true;
    }

    // ---------- high level actions (each cancels the previous one) ----------
    async idle(fadeMs = 240) { const tk = this._begin(); this.sleeping = false; this.mode = 'idle'; if (this.visual.type === 'ring' && Math.abs(this.yaw) > 30) { if (!await this.turnTo(0, tk)) return; } this.rig(fadeMs); this.leanTarget = 0; }

    async walkTo(tx) {
      const tk = this._begin(); this.sleeping = false;
      const dir = Math.sign(tx - this.x); if (!dir) { this.rig(); return true; }
      this.mode = 'walking';
      this.bounce(0.8); await this.wait(150); if (!this._alive(tk)) return false;          // anticipation
      if (!await this.turnTo(dir > 0 ? 85 : -90, tk)) return false;                       // face the target
      this.pose('walk_a', 0, dir < 0); this.leanTarget = dir * 0.03;
      const arrived = await new Promise(done => { this.walk = { tx, dir, v: 0, dist: 0, frame: 0, done }; });
      if (!arrived || !this._alive(tk)) return false;
      this.setVisual({ type: 'ring', idx: this.ringIdx(dir > 0 ? 85 : -90) }, 160);        // settle
      this.leanTarget = 0; this.bounce(1.0); await this.wait(180); if (!this._alive(tk)) return false;
      if (!await this.turnTo(0, tk)) return false;
      this.rig(150); this.mode = 'idle'; return true;
    }

    async attention() {
      const tk = this._begin(); this.sleeping = false; this.mode = 'attention';
      if (this.visual.type !== 'rig') { this.rig(150); await this.wait(220); if (!this._alive(tk)) return false; }
      this.setMood('happy'); this.twitchEar('l'); this.twitchEar('r');
      this.hop(16, 320); await this.wait(420); if (!this._alive(tk)) return false;
      return true;
    }
    async celebrate() {
      const tk = this._begin(); this.sleeping = false; this.mode = 'celebrating';
      this.pose('celebrate', 150); this.bounce(1); await this.wait(650); if (!this._alive(tk)) return false;
      this.pose('jump_happy', 120); this.hop(30, 420); await this.wait(520); if (!this._alive(tk)) return false;
      this.pose('celebrate', 120); this.bounce(0.8); await this.wait(500); if (!this._alive(tk)) return false;
      this.rig(150); this.setMood('happy'); await this.wait(1800); if (!this._alive(tk)) return false;
      this.setMood('calm'); this.mode = 'idle'; return true;
    }
    async annoyed(hold = 1600, after = 2500) {
      const tk = this._begin(); this.mode = 'annoyed';
      this.pose('annoyed_sit', 150); this.bounce(0.6); await this.wait(hold); if (!this._alive(tk)) return false;
      this.rig(150); this.setMood('annoyed'); await this.wait(after); if (!this._alive(tk)) return false;
      this.setMood('calm'); this.mode = 'idle'; return true;
    }
    async plead(hold = 1400) {
      const tk = this._begin();
      this.pose('pleading', 150); await this.wait(hold); if (!this._alive(tk)) return false;
      this.rig(150); return true;
    }
    async curious(hold = 1200) {
      const tk = this._begin(); this.setMood('curious');
      this.pose('look_tilt', 150); await this.wait(hold); if (!this._alive(tk)) return false;
      this.rig(150); this.setMood('calm'); return true;
    }
    async rest() {   // short Pomodoro break: relaxed stance, curled tail
      const tk = this._begin(); this.mode = 'break'; this.setMood('calm');
      this.pose('calm_curled_tail', 150); this.breathAmp = 0.008; this.breathHz = 0.28; return this._alive(tk);
    }
    async sleep() {
      const tk = this._begin(); this.mode = 'sleeping'; this.setMood('sleepy');
      if (this.visual.type === 'ring') { if (!await this.turnTo(0, tk)) return false; }
      this.pose('yawn', 150); this.bounce(0.5); await this.wait(1400); if (!this._alive(tk)) return false;
      this.pose('sit_drowsy', 150); await this.wait(1500); if (!this._alive(tk)) return false;
      this.pose('sleep_curl', 150); this.sleeping = true; this.breathAmp = 0.018; this.breathHz = 0.22;
      return true;
    }
    async wake() {
      const tk = this._begin(); this.mode = 'waking'; this.sleeping = false;
      this.breathAmp = 0.006; this.breathHz = 0.35;
      this.pose('lying_wake', 150); await this.wait(1300); if (!this._alive(tk)) return false;
      this.pose('stretch', 150); this.bounce(-0.6); await this.wait(1300); if (!this._alive(tk)) return false;
      this.rig(150); this.setMood('calm'); this.bounce(0.6); this.mode = 'idle'; return true;
    }
    async stretchUp() {   // end of a break: stretch, then back to the idle rig, a little happy
      const tk = this._begin(); this.mode = 'waking'; this.sleeping = false; this.breathAmp = 0.006; this.breathHz = 0.35;
      this.pose('stretch', 150); this.bounce(-0.6); await this.wait(1100); if (!this._alive(tk)) return false;
      this.rig(150); this.setMood('happy'); this.bounce(0.6); await this.wait(1200); if (!this._alive(tk)) return false;
      this.setMood('calm'); this.mode = 'idle'; return true;
    }
    async faceAway() {   // Quiet mode look: back to the user, dimmed
      const tk = this._begin(); this.mode = 'quiet'; this.sleeping = false; this.talk(false);
      this.setQuietLook(true); await this.turnTo(180, tk); return this._alive(tk);
    }
    async faceBack() {
      const tk = this._begin(); this.setQuietLook(false);
      if (!await this.turnTo(0, tk)) return false; this.rig(150); this.mode = 'idle'; return true;
    }

    // ---------- per-frame update ----------
    update(dt) {
      dt = Math.min(dt, 0.05); this.time += dt;
      // resolve waits
      if (this.waiters.length) { const now = this.time; const due = this.waiters.filter(w => w.until <= now); this.waiters = this.waiters.filter(w => w.until > now); due.forEach(w => w.r(true)); }
      // springs
      this.squashV += (-170 * this.squash - 14 * this.squashV) * dt; this.squash += this.squashV * dt;
      for (const s of ['l', 'r']) { this.ear[s + 'v'] += (-260 * this.ear[s] - 16 * this.ear[s + 'v']) * dt; this.ear[s] += this.ear[s + 'v'] * dt; }
      this.alpha += (this.alphaTarget - this.alpha) * Math.min(1, dt * 4);
      this.lean += (this.leanTarget - this.lean) * Math.min(1, dt * 6);
      // tail mood blends smoothly
      const target = MOODS[this.mood]; const k = Math.min(1, dt * 2.5);
      for (const key in target) this.tailP[key] = lerp(this.tailP[key], target[key], k);
      this.tailPhase += dt * this.tailP.hz * TAU;
      // hop
      this.yOff = 0;
      if (this.hopT >= 0) { this.hopT += dt; const p = Math.min(1, this.hopT / this.hopDur); this.yOff = 4 * this.hopH * p * (1 - p); if (p >= 1) { this.hopT = -1; this.squash = 0.6; this.squashV = 0; } }
      // walking
      if (this.walk) this._walkStep(dt);
      // blink (only when the rig is showing and awake)
      if (this.visual.type === 'rig' && !this.sleeping) {
        this.blinkClock -= dt;
        if (!this.blinkSeq && this.blinkClock <= 0) {
          this.blinkSeq = { t: 0, steps: [[0.05, 1], [0.07, 2], [0.05, 1]] }; // [seconds, 1=half 2=closed]
          if (Math.random() < 0.2) this.blinkSeq.steps.push([0.09, 0], [0.05, 1], [0.07, 2], [0.05, 1]);
          this.blinkClock = 2.2 + Math.random() * 4;
        }
        if (this.blinkSeq) {
          this.blinkSeq.t += dt; let acc = 0, val = 0, done = true;
          for (const [d, v] of this.blinkSeq.steps) { acc += d; if (this.blinkSeq.t < acc) { val = v; done = false; break; } }
          this.blink = val; if (done) { this.blinkSeq = null; this.blink = 0; }
        }
        this.earClock -= dt;
        if (this.earClock <= 0) { this.twitchEar(undefined, this.minimalMotion ? 0.6 : 1); this.earClock = (this.minimalMotion ? 9 : 4) + Math.random() * 6; }
      } else { this.blink = 0; this.blinkSeq = null; }
      // talking: mouth flap and small bob
      if (this.talking) {
        this.mouthClock -= dt;
        if (this.mouthClock <= 0) { this.mouth = this.mouth ? 0 : 1; this.mouthClock = this.mouth ? 0.09 + Math.random() * 0.08 : 0.07 + Math.random() * 0.1; if (this.mouth) this.squashV += 1.2; }
      }
      // sleeping z's
      if (this.sleeping) { this.zClock -= dt; if (this.zClock <= 0) { this.zClock = 1.4; this.zs.push({ t: 0, x0: Math.random() * 6 }); } }
      this.zs.forEach(z => z.t += dt); this.zs = this.zs.filter(z => z.t < 2.6);
      if (this.prev && this.time - this.prev.t0 >= this.prev.dur) this.prev = null;
    }

    _walkStep(dt) {
      const w = this.walk, vmax = 150, acc = 420, dec = 380, stride = this.c.walk.strideDisplayPx || 34;
      const rem = Math.abs(w.tx - this.x);
      const vStop = Math.sqrt(2 * dec * rem);
      w.v = Math.min(w.v + acc * dt, vmax, Math.max(24, vStop));
      const step = Math.min(rem, w.v * dt);
      this.x += w.dir * step; w.dist += step;
      const f = Math.floor(w.dist / stride) % 2;
      if (f !== w.frame) { w.frame = f; this.pose(f ? 'walk_b' : 'walk_a', 0, w.dir < 0); }
      this.yOff = Math.abs(Math.sin(Math.PI * w.dist / stride)) * 3;
      this.leanTarget = w.dir * 0.03 * (w.v / vmax);
      if (rem - step < 0.5) { this.x = w.tx; const d = w.done; this.walk = null; d(true); }
    }

    // ---------- drawing ----------
    draw(ctx) {
      const breathe = 1 + Math.sin(this.time * this.breathHz * TAU) * this.breathAmp;
      const sx = (1 + this.squash * 0.06) * (1 - (breathe - 1) * 0.4), sy = (1 - this.squash * 0.08) * breathe;
      ctx.save();
      // ground shadow
      const air = this.yOff;
      ctx.globalAlpha = 0.28 * this.alpha * (1 - Math.min(0.5, air / 80));
      ctx.fillStyle = '#000'; ctx.beginPath();
      ctx.ellipse(this.x, this.groundY - 1, 62 * (1 - air / 200), 8 * (1 - air / 200), 0, 0, TAU); ctx.fill();
      ctx.restore();
      if (this.prev) {
        const p = clamp((this.time - this.prev.t0) / this.prev.dur, 0, 1);
        this._drawVisual(ctx, this.prev.visual, this.alpha * (1 - smooth(0.35, 1, p)), sx, sy);
        this._drawVisual(ctx, this.visual, this.alpha * smooth(0, 0.65, p), sx, sy);
      } else this._drawVisual(ctx, this.visual, this.alpha, sx, sy);
      // z's
      if (this.zs.length) {
        ctx.save(); ctx.fillStyle = '#e8ecff'; ctx.font = 'bold 18px system-ui, sans-serif';
        for (const z of this.zs) { const a = Math.sin(Math.PI * z.t / 2.6); ctx.globalAlpha = 0.8 * a * this.alpha; ctx.fillText('z', this.x - 40 + z.x0 + z.t * 10, this.groundY - 80 - z.t * 22); }
        ctx.restore();
      }
    }

    _drawVisual(ctx, v, alpha, sx, sy) {
      if (alpha <= 0.003) return;
      let im, ax, fy, flip = false, w, h;
      if (v.type === 'rig') { im = this._renderRig(); if (!im) return; ax = this.c.rig.anchorX + this.M; fy = this.c.rig.feetY + this.M; w = im.width; h = im.height; }
      else if (v.type === 'ring') { const r = this.ring[v.idx]; im = this.img[r.file]; ax = this.c.ring.anchorX; fy = this.c.ring.feetY; flip = !!r.flip; }
      else { const p = this.c.poses[v.name]; im = this.img[p.file]; ax = p.anchorX; fy = p.feetY; flip = !!v.flip; }
      if (!im) return; w = w || im.width; h = h || im.height;
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.translate(this.x, this.groundY - this.yOff); ctx.rotate(this.lean);
      ctx.scale((flip ? -1 : 1) * sx * this.S, sy * this.S);
      ctx.drawImage(im, -ax, -fy, w, h);
      ctx.restore();
    }

    _renderRig() {
      if (!this.bctx) return null;
      const g = this.bctx, R = this.c.rig, M = this.M, I = this.img, P = R.pivots;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.buf.width, this.buf.height);
      g.translate(M, M);
      // tail
      const tp = this.tailP; const lim = R.tailRotationLimits || [-2, 24];
      let ang = tp.base + Math.sin(this.tailPhase) * tp.amp + (tp.jit ? (Math.sin(this.time * 113) * 0.5 + Math.sin(this.time * 71)) * tp.jit : 0);
      ang = clamp(ang, lim[0], lim[1]);
      drawRot(g, I[R.layers.tail], P.tail, ang, tp.scale);
      drawRot(g, I[R.layers.ear_l], P.earL, this.ear.l, 1);
      drawRot(g, I[R.layers.ear_r], P.earR, this.ear.r, 1);
      g.drawImage(I[R.layers.body], 0, 0);
      if (this.blink === 1) g.drawImage(I[R.overlays.blink_half], 0, 0);
      if (this.blink === 2) g.drawImage(I[R.overlays.blink_closed], 0, 0);
      if (this.talking && this.mouth) g.drawImage(I[R.overlays.mouth_open], 0, 0);
      return this.buf;
    }
  }

  function drawRot(g, im, pivot, deg, scale) {
    if (!im) return; const [px, py] = pivot;
    g.save(); g.translate(px, py); g.rotate(-deg * Math.PI / 180); g.scale(scale, scale); g.drawImage(im, -px, -py); g.restore();
  }
  function angDiff(a, b) { return ((a - b + 540) % 360) - 180; }
  function sameVisual(a, b) { return a && b && a.type === b.type && a.idx === b.idx && a.name === b.name && !!a.flip === !!b.flip; }

  TokkuCharacter.MOODS = MOODS;
  if (typeof module !== 'undefined' && module.exports) module.exports = TokkuCharacter; else root.TokkuCharacter = TokkuCharacter;
})(typeof window !== 'undefined' ? window : globalThis);
