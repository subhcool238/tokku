/* Tokku character engine v3 (2.5D, no dependencies).
   v3 adds frame sequences for art v3 (character.json "sequences"), an 8 frame walk, a 12 view
   turn and the drag, welcome back, surprise and point actions. v2 is kept in backup/.

   What it does:
   - "Rig" idle: the front idle pose split into layers (body, tail, two ears) plus
     overlays (blink half, blink closed, mouth open). The body stays still while the
     eyes blink, ears twitch, tail moves by mood and the mouth flaps while talking.
   - Turn ring: 12 views from the turnaround sheet, stepped with short crossfades.
   - Poses: single frames cut from the art v3 sheets, played in order as sequences (play(name)).
   - Every visual change is a crossfade, so nothing pops.
   - Walking: turn, start frames, eased speed, 8 frame walk cycle advanced by distance
     (not by time) so feet do not slide, stop frames, turn back to the front.
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
  const W_SPEED = 120;   // walking speed, screen pixels per second
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
      this.varietyClock = 40 + Math.random() * 50;   // idle variety (a thought, a look around), never while focusing
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
    pose(name, fadeMs = 140, flip = false, keepYaw = false) {
      const p = this.c.poses[name]; if (!p) { console.warn('missing pose', name); return; }
      if (!keepYaw) { this.yaw = 0; if (this.visual.type !== 'pose' || this.visual.name !== name) this.squashV += 2.2; }  // small squash hides the swap
      this.setVisual({ type: 'pose', name, flip }, fadeMs);
    }

    // ---------- sequences (character.json "sequences") ----------
    // Plays the frames of a sequence inside the current action. Returns false if another action took over.
    async _run(name, tk) {
      const q = this.c.sequences && this.c.sequences[name]; if (!q) { console.warn('missing sequence', name); return true; }
      let first = true;
      for (const f of q.frames) {
        this.pose(f.pose, first ? 150 : 80); first = false;        // 150 ms from an unrelated picture, 80 ms inside a sequence
        if (q.hop && q.hop.at === f.pose) this.hop(q.hop.heightPx, Math.max(260, f.ms - 60));
        if (q.hold === f.pose) return true;                         // stays on this frame until the next action
        await this.wait(f.ms); if (!this._alive(tk)) return false;
      }
      if (q.end === 'rig') this.rig(150);
      return true;
    }
    // Public: play one sequence by name as its own action.
    async play(name) {
      const tk = this._begin(); this.sleeping = false; this.mode = 'playing'; this.leanTarget = 0;
      if (this.visual.type === 'ring') { if (!await this.turnTo(0, tk)) return false; }
      const ok = await this._run(name, tk);
      if (ok && (this.c.sequences[name] || {}).end === 'rig') this.mode = 'idle';
      return ok;
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

    // Turns through the ring views. The front view is never shown: facing the user is always the idle rig,
    // so a turn starts at 30 degrees and a turn to the front ends in the rig.
    async turnTo(yaw, tk = this.token) {
      const n = this.ring.length, want = this.ringIdx(yaw), zero = this.ringIdx(0);
      let idx = this.visual.type === 'ring' ? this.visual.idx : this.ringIdx(this.yaw);
      if (this.visual.type !== 'ring' && idx !== zero) { this.setVisual({ type: 'ring', idx }, 140); await this.wait(110); if (!this._alive(tk)) return false; }
      while (idx !== want) {
        const plus = ((this.ring[want].yaw - this.ring[idx].yaw) + 360) % 360;
        idx = (idx + (plus <= 180 ? 1 : -1) + n) % n;
        if (idx === zero) continue;
        this.setVisual({ type: 'ring', idx }, 80);
        this.yaw = this.ring[idx].yaw;
        await this.wait(72); if (!this._alive(tk)) return false;
      }
      if (want === zero) { this.rig(130); await this.wait(110); if (!this._alive(tk)) return false; }
      this.yaw = yaw; return true;
    }

    // ---------- high level actions (each cancels the previous one) ----------
    async idle(fadeMs = 240) { const tk = this._begin(); this.sleeping = false; this.mode = 'idle'; if (this.visual.type === 'ring' && Math.abs(this.yaw) > 30) { if (!await this.turnTo(0, tk)) return; } this.rig(fadeMs); this.leanTarget = 0; }

    async walkTo(tx) {
      const tk = this._begin(); this.sleeping = false;
      const dir = Math.sign(tx - this.x); if (!dir) { this.rig(); return true; }
      this.mode = 'walking'; const W = this.c.walk, left = dir < 0;
      if (!await this.turnTo(dir * 90, tk)) return false;                                   // turn to the side first
      for (const n of W.start || []) { this.pose(n, 80, left, true); await this.wait(110); if (!this._alive(tk)) return false; }
      this.yaw = dir * 90; this.leanTarget = dir * 0.02;
      const arrived = await new Promise(done => { this.walk = { tx, dir, v: 0, dist: 0, frame: -1, done }; });
      if (!arrived || !this._alive(tk)) return false;
      this.leanTarget = 0;
      for (const n of W.stop || []) { this.pose(n, 80, left, true); await this.wait(130); if (!this._alive(tk)) return false; }
      this.setVisual({ type: 'ring', idx: this.ringIdx(dir * 90) }, 100);
      if (!await this.turnTo(0, tk)) return false;                                          // turn back to the user
      this.rig(150); this.bounce(0.6); this.mode = 'idle'; return true;
    }

    async attention() {   // waves hi and holds it while the bubble with buttons is open
      const tk = this._begin(); this.sleeping = false; this.mode = 'attention'; this.leanTarget = 0;
      if (this.visual.type === 'ring') { if (!await this.turnTo(0, tk)) return false; }
      this.setMood('happy');
      return this._run('attention', tk);
    }
    async pointAtTask() {   // holds until the next action
      const tk = this._begin(); this.sleeping = false; this.mode = 'pointing';
      return this._run('point_at_task', tk);
    }
    async celebrate() {
      const tk = this._begin(); this.sleeping = false; this.mode = 'celebrating'; this.setMood('celebrate');
      if (!await this._run('celebrate', tk)) return false;
      this.setMood('happy'); await this.wait(800); if (!this._alive(tk)) return false;
      this.setMood('calm'); this.mode = 'idle'; return true;
    }
    async annoyed(level = 1) {   // level 1 mild, 2 questioning, 3 angry (never shouting)
      const tk = this._begin(); this.mode = 'annoyed'; this.sleeping = false;
      level = clamp(Math.round(level) || 1, 1, 3);
      if (!await this._run('annoyed_' + level, tk)) return false;       // the annoyed face is the pose itself;
      this.setMood('calm'); this.mode = 'idle'; return true;            // the smiling idle never gets an annoyed tail
    }
    async plead() {   // when a reminder is ignored
      const tk = this._begin(); this.mode = 'pleading'; this.sleeping = false;
      if (!await this._run('plead', tk)) return false;
      this.rig(150); this.mode = 'idle'; return true;
    }
    async accept() { const ok = await this.play('accept'); if (ok) this.setMood('calm'); return ok; }        // "Five more minutes"
    async sulk() { const ok = await this.play('sulk'); if (ok) this.setMood('calm'); return ok; }            // "Back to work" after a scolding
    async surprise() { this.twitchEar('l'); this.twitchEar('r'); return this.play('surprise'); }             // a task due today appears
    async welcomeBack() { const ok = await this.play('welcome_back'); if (ok) this.setMood('happy'); return ok; }
    async rest() {   // short Pomodoro break: stretch, yawn, sit relaxed, lie down after a minute
      const tk = this._begin(); this.mode = 'break'; this.sleeping = false; this.setMood('calm');
      this.breathAmp = 0.008; this.breathHz = 0.28;
      return this._run('rest', tk);
    }
    async sleep() {   // meal break
      const tk = this._begin(); this.mode = 'sleeping'; this.setMood('sleepy');
      if (this.visual.type === 'ring') { if (!await this.turnTo(0, tk)) return false; }
      if (!await this._run('sleep_in', tk)) return false;
      // one sleeping picture only: he breathes by a slow, small scale up and down (no picture changes)
      this.pose('sleep_curl', 150); this.sleeping = true; this.breathAmp = 0.022; this.breathHz = 0.2;
      return true;
    }
    async wake() {
      const tk = this._begin(); this.mode = 'waking'; this.sleeping = false;
      this.breathAmp = 0.006; this.breathHz = 0.35;
      if (!await this._run('wake', tk)) return false;
      this.setMood('calm'); this.bounce(0.6); this.mode = 'idle'; return true;
    }
    async stretchUp() {   // end of a break: stretch, then back to the idle rig, a little happy
      const tk = this._begin(); this.mode = 'waking'; this.sleeping = false; this.breathAmp = 0.006; this.breathHz = 0.35;
      if (!await this._run('stretch_up', tk)) return false;
      this.setMood('happy'); this.bounce(0.6); await this.wait(1200); if (!this._alive(tk)) return false;
      this.setMood('calm'); this.mode = 'idle'; return true;
    }
    // Dragging: the host calls dragStart on mouse down, dragMove(vx) while moving, dragEnd on release.
    async dragStart() {
      const tk = this._begin(); this.mode = 'dragged'; this.sleeping = false; this.talk(false);
      return this._run('drag_start', tk);
    }
    dragMove(vx) { if (this.mode === 'dragged') this.leanTarget = clamp(-vx * 0.0005, -0.16, 0.16); }   // sways a few degrees with mouse speed
    async dragEnd() {
      const tk = this._begin(); this.mode = 'landing'; this.leanTarget = 0;
      if (!await this._run('drag_end', tk)) return false;
      this.rig(150); this.mode = 'idle'; return true;
    }
    async faceAway() {   // Quiet mode look: turns his back, sits, dimmed
      const tk = this._begin(); this.mode = 'quiet'; this.sleeping = false; this.talk(false); this.leanTarget = 0;
      this.setQuietLook(true);
      if (!await this.turnTo(180, tk)) return false;
      this.pose('quiet_back_sit', 150, false, true); this.yaw = 180; return true;
    }
    async faceBack() {
      const tk = this._begin(); this.setQuietLook(false);
      if (!await this.turnTo(0, tk)) return false; this.rig(150); this.mode = 'idle'; return true;
    }
    async _variety() {   // idle only: a thought, a look at the ground, or a glance to the side
      const names = ['idle_inspect', 'idle_glance'];
      const tk = this._begin(); this.mode = 'variety';
      if (await this._run(names[Math.floor(Math.random() * names.length)], tk)) this.mode = 'idle';
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
      // idle variety: never during focus, Quiet mode, talking or any action
      if (this.mode === 'idle' && this.visual.type === 'rig' && !this.minimalMotion && this.alphaTarget === 1 && !this.talking) {
        this.varietyClock -= dt;
        if (this.varietyClock <= 0) { this.varietyClock = 40 + Math.random() * 50; this._variety(); }
      }
      // sleeping z's
      if (this.sleeping) { this.zClock -= dt; if (this.zClock <= 0) { this.zClock = 1.4; this.zs.push({ t: 0, x0: Math.random() * 6 }); } }
      this.zs.forEach(z => z.t += dt); this.zs = this.zs.filter(z => z.t < 2.6);
      if (this.prev && this.time - this.prev.t0 >= this.prev.dur) this.prev = null;
    }

    _walkStep(dt) {
      const w = this.walk, vmax = W_SPEED, acc = 360, dec = 320, W = this.c.walk, frames = W.right, per = W.framePx || 11;
      const rem = Math.abs(w.tx - this.x);
      const vStop = Math.sqrt(2 * dec * rem);
      w.v = Math.min(w.v + acc * dt, vmax, Math.max(24, vStop));
      const step = Math.min(rem, w.v * dt);
      this.x += w.dir * step; w.dist += step;
      const f = Math.floor(w.dist / per) % frames.length;     // the frame follows distance, so the feet do not slide
      if (f !== w.frame) { w.frame = f; this.pose(frames[f], W.fadeMs || 0, w.dir < 0, true); }   // short blend only: a long fade smears the frames
      this.leanTarget = w.dir * 0.02 * (w.v / vmax);
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
      let k = 1;
      if (v.type === 'rig') { im = this._renderRig(); if (!im) return; ax = this.c.rig.anchorX + this.M; fy = this.c.rig.feetY + this.M; w = im.width; h = im.height; k = this.c.rig.scale || 1; }
      if (v.type === 'ring') { const r = this.ring[v.idx]; im = this.img[r.file]; ax = r.anchorX ?? this.c.ring.anchorX; fy = r.feetY ?? this.c.ring.feetY; flip = !!r.flip; k = r.scale ?? this.c.ring.scale ?? 1; }   // art v3: each view has its own anchor and scale
      else if (v.type === 'pose') { const p = this.c.poses[v.name]; im = this.img[p.file]; ax = p.anchorX; fy = p.feetY; flip = !!v.flip; k = p.scale || 1; }
      if (!im) return; w = w || im.width; h = h || im.height;
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.translate(this.x, this.groundY - this.yOff); ctx.rotate(this.lean);
      ctx.scale((flip ? -1 : 1) * sx * this.S * k, sy * this.S * k);
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
      ang = clamp(ang, lim[0], lim[1]) * (R.tailSign || 1);    // tailSign -1: the tail is on the left of the body
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
