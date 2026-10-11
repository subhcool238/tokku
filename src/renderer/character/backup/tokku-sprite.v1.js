/* Tokku 2.5D sprite engine. No dependencies. Works in a browser or an Electron renderer.
   Usage:
     const t = new TokkuSprite(canvas, meta, images);   // images: {"a0.png": HTMLImageElement, ...}
     t.homeX = ...; t.groundY = ...;
     requestAnimationFrame loop: t.update(dt); t.draw(ctx);
   Behaviours: faceYaw(), walkTo(), attention(), talk(), quiet(), idle looks, breathing.
*/
class TokkuSprite {
  constructor(canvas, meta, images) {
    this.canvas = canvas; this.meta = meta; this.img = images;
    this.ring = meta.ring.slice().sort((a, b) => a.yaw - b.yaw);
    this.s = meta.displayScale || 0.5;           // sprite px -> css px
    this.x = 0; this.groundY = 0; this.homeX = 0;
    this.yaw = 0; this.targetYaw = 0; this.ringIdx = this.indexOfYaw(0);
    this.turnClock = 0;
    this.t = 0;
    this.hopT = -1; this.hopDur = 0.42; this.hopH = 22; this.hopFrom = 0; this.hopTo = 0;
    this.squash = 0; this.squashV = 0;           // damped spring, + = squashed
    this.lean = 0; this.alpha = 1; this.alphaTarget = 1;
    this.mode = 'idle'; this.walkTarget = null; this.onArrive = null;
    this.talking = false; this.talkClock = 0; this.talkBounce = 0;
    this.lookClock = 2 + Math.random() * 3; this.lookHold = 0;
    this.useGlance = 0; this.quietOn = false; this.scaleExtra = 1; this.scaleTarget = 1;
    this.queue = [];
  }
  indexOfYaw(y) { let best = 0, bd = 1e9; this.ring.forEach((r, i) => { const d = Math.abs(this.angDiff(r.yaw, y)); if (d < bd) { bd = d; best = i; } }); return best; }
  angDiff(a, b) { let d = ((a - b + 540) % 360) - 180; return d; }  // a-b in (-180,180]
  // ---- public commands -------------------------------------------------
  faceYaw(y) { this.targetYaw = y; }
  faceNow(y) { this.targetYaw = y; this.yaw = y; this.ringIdx = this.indexOfYaw(y); }
  attention() { this.mode = 'attention'; this.faceYaw(0); this.hops = 2; this._startHop(0.5, 34, this.x, this.x); }
  walkTo(x, cb) { this.walkTarget = x; this.onArrive = cb || null; this.mode = 'walk'; this.faceYaw(x > this.x ? 85 : -90); }
  talk(on) { this.talking = !!on; if (on) { this.faceYaw(0); } }
  quiet(on) { this.quietOn = !!on; this.alphaTarget = on ? 0.5 : 1; this.scaleTarget = on ? 0.94 : 1; this.faceYaw(on ? 180 : 0); }
  nudge(amount = 1) { this.squashV += 6 * amount; }
  // ---- internals ------------------------------------------------------
  _startHop(dur, h, fromX, toX) { this.hopT = 0; this.hopDur = dur; this.hopH = h; this.hopFrom = fromX; this.hopTo = toX; }
  _land() { this.squash = 0.9; this.squashV = 0; }
  update(dt) {
    dt = Math.min(dt, 0.05); this.t += dt;
    // turning: step through the ring toward the target, 70ms per step
    const want = this.indexOfYaw(this.targetYaw);
    if (this.ringIdx !== want) {
      this.turnClock += dt;
      if (this.turnClock > 0.07) {
        this.turnClock = 0;
        const n = this.ring.length;
        const plus = ((this.ring[want].yaw - this.ring[this.ringIdx].yaw) + 360) % 360;   // degrees going +yaw
        const dir = plus <= 180 ? 1 : -1;
        this.ringIdx = (this.ringIdx + dir + n) % n;
        this.yaw = this.ring[this.ringIdx].yaw;
      }
    }
    // spring for squash
    const k = 160, c = 14;
    this.squashV += (-k * this.squash - c * this.squashV) * dt; this.squash += this.squashV * dt;
    this.alpha += (this.alphaTarget - this.alpha) * Math.min(1, dt * 5);
    this.scaleExtra += (this.scaleTarget - this.scaleExtra) * Math.min(1, dt * 5);
    // hop
    let hopY = 0, stretch = 0;
    if (this.hopT >= 0) {
      this.hopT += dt; const p = Math.min(1, this.hopT / this.hopDur);
      hopY = 4 * this.hopH * p * (1 - p);
      stretch = Math.sin(p * Math.PI) * 0.06 * (p < 0.5 ? 1 : -0.4);
      this.x = this.hopFrom + (this.hopTo - this.hopFrom) * p;
      if (p >= 1) { this.hopT = -1; this._land(); this._afterHop(); }
    }
    // mode logic
    if (this.mode === 'walk' && this.hopT < 0) {
      const facing = this.ringIdx === this.indexOfYaw(this.targetYaw);
      if (facing) {
        const dx = this.walkTarget - this.x, step = Math.min(Math.abs(dx), 46);
        if (Math.abs(dx) < 3) { this.mode = 'idle'; this.faceYaw(0); const cb = this.onArrive; this.onArrive = null; if (cb) cb(); }
        else this._startHop(0.34, 12, this.x, this.x + Math.sign(dx) * step);
      }
    }
    if (this.mode === 'idle' || this.mode === 'attention') this._idleLogic(dt);
    // talk bounce
    this.talkBounce = 0;
    if (this.talking) {
      this.talkClock -= dt;
      if (this.talkClock <= 0) { this.talkClock = 0.16 + Math.random() * 0.18; this.squashV += 3 + Math.random() * 3; this.talkBump = 1; }
    }
    this.hopY = hopY; this.stretch = stretch;
    this.lean = (this.mode === 'walk' && this.hopT >= 0) ? Math.sign(this.walkTarget - this.x || 1) * 0.06 : Math.sin(this.t * 0.9) * 0.008;
  }
  _afterHop() { if (this.mode === 'attention') { this.hops = (this.hops || 1) - 1; if (this.hops > 0) this._startHop(0.4, 24, this.x, this.x); else this.mode = 'idle'; } }
  _idleLogic(dt) {
    if (this.quietOn || this.talking) { this.useGlance = 0; return; }
    this.lookClock -= dt;
    if (this.lookClock <= 0) {
      if (this.lookHold > 0) { this.lookHold = 0; this.faceYaw(0); this.useGlance = 0; this.lookClock = 3 + Math.random() * 4; }
      else { const r = Math.random(); if (r < 0.4) { this.useGlance = 1; this.lookHold = 1; this.lookClock = 1; } else { this.faceYaw(r < 0.7 ? -30 : 25); this.lookHold = 1; this.lookClock = 1.2; } }
    }
  }
  // ---- drawing -----------------------------------------------------------
  draw(ctx, dpr = 1) {
    const m = this.meta, s = this.s * this.scaleExtra;
    let r = this.ring[this.ringIdx], file = r.file, flip = !!r.flip;
    if (this.useGlance && this.ringIdx === this.indexOfYaw(0)) file = m.extras.glance;
    const im = this.img[file]; if (!im) return;
    const breathe = 1 + Math.sin(this.t * 2.2) * 0.006;
    const sq = this.squash, sx = (1 + sq * 0.07 - this.stretch * 0.5) , sy = (1 - sq * 0.09 + this.stretch) * breathe;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    // ground shadow
    const air = this.hopY || 0;
    ctx.save(); ctx.globalAlpha *= 0.35 * (1 - Math.min(0.5, air / 60)); ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(this.x, this.groundY - 2, 62 * s * 2 * (1 - air / 160), 9 * s * 2 * (1 - air / 160), 0, 0, 6.283); ctx.filter = 'blur(4px)'; ctx.fill(); ctx.restore();
    ctx.translate(this.x, this.groundY - air);
    ctx.rotate(this.lean);
    ctx.scale((flip ? -1 : 1) * sx, sy);
    const ax = m.anchorX;
    ctx.drawImage(im, -ax * s, -m.feetY * s, m.canvas[0] * s, m.canvas[1] * s);
    ctx.restore();
  }
}
if (typeof module !== 'undefined') module.exports = TokkuSprite;
