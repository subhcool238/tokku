/* Tokku browser demo: the real character engine and the real brain, with the desktop sensing replaced by buttons.
   All timers are a few seconds long so a visitor can see every moment quickly. */
(async function () {
  const BASE = '../src/renderer/character/assets/';
  const char = window.TOKKU_CHARACTER;
  const $ = (id) => document.getElementById(id);
  const canvas = $('stage'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  const HOME_X = 860, GROUND_Y = 420;

  const files = new Set([...Object.values(char.rig.layers), ...Object.values(char.rig.overlays), ...Object.values(char.rig.angry || {})]);
  Object.values(char.poses).forEach(p => { if (!p.legacy) files.add(p.file); });
  const images = {};
  await Promise.all([...files].map(f => new Promise(res => { const im = new Image(); im.onload = () => { images[f] = im; res(); }; im.onerror = res; im.src = BASE + f; })));

  const ch = new TokkuCharacter(char, images);
  ch.x = HOME_X; ch.groundY = GROUND_Y; ch.faceSide = 'left';

  // ---------- speech bubble ----------
  let bubbleId = 0, hideT = null, typeT = null;
  const ui = {
    say(text, o) {
      clearTimeout(hideT); clearInterval(typeT);
      const id = ++bubbleId;
      $('bubble-acts').replaceChildren(...(o.actions || []).map((a, i) => {
        const b = document.createElement('button'); b.textContent = a.label; if (i === 0) b.className = 'primary';
        b.onclick = () => brain.choose(a.id); return b;
      }));
      $('bubble-text').textContent = ''; $('bubble').hidden = false;
      let n = 0;
      typeT = setInterval(() => { n += 2; $('bubble-text').textContent = text.slice(0, n); if (n >= text.length) { clearInterval(typeT); o.onDone && o.onDone(); } }, 30);
      hideT = setTimeout(() => { if (id === bubbleId) { $('bubble').hidden = true; o.onTimeout && o.onTimeout(); } }, o.timeoutMs);
      return id;
    },
    hide() { clearTimeout(hideT); clearInterval(typeT); $('bubble').hidden = true; },
    onTimer() {},
  };
  const tasks = ['Finish the DJXHack video', 'Write the concept PDF', 'Send the submission'];
  const brain = new TokkuBrain(ch, ui, { homeX: HOME_X, topTask: () => tasks[0], nextTask: () => tasks[1] || 'a well earned rest' });
  // short timers for the demo
  Object.assign(brain.o, { focusMin: 0.25, breakMin: 0.15, extendMin: 0.15, mealMin: 0.2, remindMin: 0.2, nudgeAfterSec: 3, bargainMin: 0.12,
    renudgeSec: 6, backGraceSec: 4, askSec: 9 });

  // ---------- simulated desktop ----------
  let watching = false;
  const setTube = (on) => { watching = on; $('tube').hidden = !on; };

  // ---------- dragging with the real mouse ----------
  const toCanvas = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height }; };
  const onHim = (p) => { const px = Math.round(p.x), py = Math.round(p.y); return px >= 0 && py >= 0 && px < canvas.width && py < canvas.height && ctx.getImageData(px, py, 1, 1).data[3] > 40; };
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    const p = toCanvas(e);
    if (!onHim(p) || brain.quiet) return;
    if (brain.state === 'meal') { brain.endMeal(); return; }            // a click wakes him
    if (brain.state === 'break') { brain.breakOver(); return; }
    drag = { dx: ch.x - p.x, dy: ch.groundY - p.y, moved: false, lastX: p.x };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = toCanvas(e);
    if (!drag.moved) { drag.moved = true; ui.hide(); ch.shadowTarget = 0; ch.dragStart(brain.drags >= 1); canvas.classList.add('grabbing'); }
    ch.x = Math.max(60, Math.min(canvas.width - 60, p.x + drag.dx)); ch.groundY = Math.min(GROUND_Y, p.y + drag.dy);
    ch.dragMove((p.x - drag.lastX) * 60); drag.lastX = p.x;
  });
  const drop = async () => {
    if (!drag) return;
    const d = drag; drag = null; canvas.classList.remove('grabbing');
    if (!d.moved) return;
    while (ch.groundY < GROUND_Y) { ch.groundY = Math.min(GROUND_Y, ch.groundY + 18); await ch.wait(16); }   // he falls to the floor
    ch.shadowTarget = 1;
    await ch.dragEnd(false, brain.drags >= 1);
    brain.dragged(ch.x);                                                // complains, walks home, angrier each time
  };
  canvas.addEventListener('pointerup', drop); canvas.addEventListener('pointercancel', drop);

  // ---------- buttons ----------
  const acts = {
    focus: () => { setTube(false); brain.setQuiet(false); brain.startFocus(); },
    youtube: () => { brain.setQuiet(false); if (brain.state === 'idle') brain.startFocus(); setTube(true); },
    close: () => setTube(false),
    lunch: () => { setTube(false); brain.setQuiet(false); brain.startMeal('lunch'); },
    done: () => { setTube(false); brain.setQuiet(false); if (brain.taskDone()) { tasks.push(tasks.shift()); } },
    quiet: () => { const on = !brain.quiet; brain.setQuiet(on); document.querySelector('[data-act=quiet]').textContent = on ? 'End the call' : 'Join a call'; },
    story, reset,
  };
  document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => acts[b.dataset.act]()));

  function reset() {
    storyRun++; setTube(false); brain.setQuiet(false); ui.hide(); brain._clearTimer();
    Object.assign(brain, { state: 'idle', nudges: [], nudging: false, bargaining: false, watching: false, ignored: 0, blocked: false, drags: 0, extensions: 0 });
    brain.dist = { app: null, sec: 0, nudged: false, graceUntil: 0 };
    document.querySelector('[data-act=quiet]').textContent = 'Join a call';
    ch.forceAngry = false; ch.face = 'normal'; ch.minimalMotion = false; ch.setMood('calm'); ch.x = HOME_X; ch.groundY = GROUND_Y; ch.shadowTarget = 1; ch.idle();
  }

  // ---------- the full story ----------
  let storyRun = 0;
  async function story() {
    reset(); const me = storyRun, alive = () => me === storyRun;
    const step = async (fn, ms) => { if (!alive()) return; fn(); await new Promise(r => setTimeout(r, ms)); };
    await step(() => brain.startFocus(), 3000);                  // starts working
    await step(() => setTube(true), 7000);                       // YouTube: he names the task
    await step(() => brain.choose('bargain'), 10500);            // five more minutes, then he checks his watch
    await step(() => setTube(false), 4500);                      // closed: thumbs up
    await step(() => { brain.timer && (brain.timer.endsAt = brain.t); }, 6000);   // focus time is up: he waves
    await step(() => brain.choose('break'), 4500);               // a break
    await step(() => brain.breakOver(), 4000);                   // back to work
    await step(() => { if (brain.taskDone()) tasks.push(tasks.shift()); }, 5500);   // Notion task done
    await step(() => brain.setQuiet(true), 4000);                // a call: he turns around
    await step(() => brain.setQuiet(false), 4000);
    await step(() => brain.startMeal('lunch'), 6500);            // lunch: he sleeps
    await step(() => brain.endMeal(), 5000);
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.5, Math.max(0, (now - last) / 1000)); last = now;
    for (let left = dt; left > 0.0005; left -= 0.05) ch.update(Math.min(0.05, left));
    brain.tick(dt * 1000);
    brain.activity(watching ? 'video' : 'work', watching ? 'YouTube' : null, dt);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)'; ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);
    ch.draw(ctx);
    const r = canvas.getBoundingClientRect(), k = r.width / canvas.width, b = $('bubble');
    b.style.left = Math.max(140 * k, Math.min(r.width - 140 * k, ch.x * k)) + 'px';
    b.style.top = ((ch.groundY - 215) * k) + 'px';
    const t = brain.timerInfo();
    $('status').textContent = 'Tokku is ' + ({ idle: 'relaxing', focusing: 'keeping watch while you work', attention: 'asking you something', break: 'on a break with you',
      meal: 'asleep while you eat', waking: 'waking up', walking: 'walking home', celebrating: 'celebrating' }[brain.state] || brain.state)
      + (brain.quiet ? ' (quiet: you are on a call)' : '') + (t ? '  |  ' + t.kind + ' timer ' + Math.ceil(t.remainingMs / 1000) + ' s' : '');
  }
  // drawn every animation frame, and also on a timer so he keeps thinking when the tab is in the background
  const loop = (now) => { frame(now); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  setInterval(() => frame(performance.now()), 100);
  window.__demo = { brain, ch, acts };
})();
