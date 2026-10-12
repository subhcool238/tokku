/* Tokku on the desktop: character + brain + speech bubble + hover buttons. No other UI.
   Talks to Guard only through the narrow window.guard bridge (see src/main/preload.js). */
(async function () {
  const BASE = 'character/assets/';
  const $ = (id) => document.getElementById(id);
  const canvas = $('stage'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  const bubble = $('bubble'), bubbleText = $('bubble-text'), bubbleActs = $('bubble-acts'), hoverBar = $('hover-bar');
  const guard = window.guard || { hover() {}, front() {}, onEvent() {} };
  const HOME_X = canvas.width / 2 + 14, GROUND_Y = canvas.height - 16;
  let status = 'loading';
  window.__tokkuStatus = () => status;

  const loadImage = (file) => new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve([file, im]);
    im.onerror = () => reject(new Error('Could not load ' + file));
    im.src = BASE + file;
  });

  let char, images;
  try {
    char = await (await fetch(BASE + 'character.json')).json();
    const files = new Set([...Object.values(char.rig.layers), ...Object.values(char.rig.overlays)]);
    Object.values(char.poses).forEach(p => { if (!p.legacy) files.add(p.file); });   // the turn ring uses the same files
    images = Object.fromEntries(await Promise.all([...files].map(loadImage)));
    status = 'running, ' + files.size + ' images';
  } catch (err) { status = 'ERROR: ' + err.message; return; }

  const ch = new TokkuCharacter(char, images);
  ch.x = HOME_X; ch.groundY = GROUND_Y;

  // ---------- speech bubble (the brain's "ui") ----------
  let bubbleId = 0, hideTimer = null, typeTimer = null;
  function button(label, primary, onClick) {
    const b = document.createElement('button'); b.textContent = label; if (primary) b.className = 'primary';
    b.addEventListener('click', onClick); return b;
  }
  const ui = {
    say(text, o) {
      clearTimeout(hideTimer); clearInterval(typeTimer);
      const id = ++bubbleId;
      bubbleActs.replaceChildren(...(o.actions || []).map((a, i) => button(a.label, i === 0, () => brain.choose(a.id))));
      bubbleText.textContent = ''; bubble.hidden = false;
      let n = 0;                                                    // type the line out while his mouth moves
      typeTimer = setInterval(() => { n += 2; bubbleText.textContent = text.slice(0, n); if (n >= text.length) { clearInterval(typeTimer); o.onDone && o.onDone(); } }, 34);
      if (o.actionable) guard.front(true);                          // a question for you: come to the front
      hideTimer = setTimeout(() => { if (id !== bubbleId) return; bubble.hidden = true; guard.front(false); o.onTimeout && o.onTimeout(); }, o.timeoutMs);
      return id;
    },
    hide() { clearTimeout(hideTimer); clearInterval(typeTimer); bubble.hidden = true; guard.front(false); },
    onTimer() {},
  };
  const brain = new TokkuBrain(ch, ui, { homeX: HOME_X, topTask: () => 'your work', nextTask: () => 'the next task' });   // real Notion tasks arrive in Phase 5

  // ---------- hover buttons: only what fits the moment ----------
  const mealNow = () => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner'; };
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  function hoverButtons() {
    if (brain.quiet) return [];
    if (brain.state === 'meal') return [button("I'm back", true, () => brain.endMeal())];
    if (brain.state === 'break') return [button('Break over', true, () => brain.breakOver())];
    if (brain.state === 'waking' || brain.state === 'celebrating' || brain.state === 'walking') return [];
    const meal = mealNow();
    return [button('Take a break', true, () => brain.startBreak()), button(cap(meal), false, () => brain.startMeal(meal))];
  }
  let hoverKey = '';
  function showHover(on) {
    if (!on) { hoverBar.hidden = true; hoverKey = ''; return; }
    const key = brain.state + '|' + brain.quiet + '|' + mealNow();
    if (key !== hoverKey) { hoverKey = key; const bs = hoverButtons(); hoverBar.replaceChildren(...bs); hoverBar.hidden = bs.length === 0; }
  }

  // ---------- mouse: the window lets clicks through unless the mouse is on Tokku or his UI ----------
  let over = false, leaveTimer = null;
  function onCharacter(x, y) {
    const r = canvas.getBoundingClientRect(), cx = Math.round(x - r.left), cy = Math.round(y - r.top);
    if (cx < 0 || cy < 0 || cx >= canvas.width || cy >= canvas.height) return false;
    return ctx.getImageData(cx, cy, 1, 1).data[3] > 40;             // a solid pixel of the drawing
  }
  function setOver(on) {
    if (on) { clearTimeout(leaveTimer); leaveTimer = null; if (!over) { over = true; guard.hover(true); } showHover(true); return; }
    if (over && !leaveTimer) leaveTimer = setTimeout(() => { over = false; leaveTimer = null; guard.hover(false); showHover(false); }, 450);
  }
  window.addEventListener('mousemove', (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    setOver(!!(el && el.closest('.hit')) || onCharacter(e.clientX, e.clientY));
  });
  document.addEventListener('mouseleave', () => setOver(false));
  canvas.addEventListener('click', (e) => {                       // clicking him while he sleeps wakes him up
    if (brain.state === 'meal' && onCharacter(e.clientX, e.clientY)) brain.endMeal();
  });

  // ---------- events from Guard (tray menu now; sensing arrives in Phase 2) ----------
  let pausedUntil = 0, idleSec = 0, debugOn = false, lastSense = '';
  guard.onEvent((ev) => {
    if (ev.type === 'activity') {
      idleSec = ev.idle;
      lastSense = ev.category + (ev.app ? ' ' + ev.app : '') + ' | idle ' + ev.idle + ' s' + (ev.locked ? ' | locked' : '') + (ev.reasons.length ? ' | quiet: ' + ev.reasons.join(', ') : '');
      if (performance.now() >= pausedUntil) brain.activity(ev.idle < 60 ? ev.category : 'other', ev.app, ev.dt);   // a video only counts while you are there
      if (ev.idle >= 300 && brain.state === 'focusing' && brain.timer && brain.timer.kind === 'focus') brain._setTimer('focus', brain.o.focusMin);   // 5 idle minutes count as a break
    }
    else if (ev.type === 'back') { if (ev.minutes >= 30 && !brain.quiet && brain.state !== 'meal') { ch.welcomeBack(); brain.say('welcome_back'); } }
    else if (ev.type === 'debug') { debugOn = ev.on; $('debug').hidden = !ev.on; }
    else if (ev.type === 'quiet') brain.setQuiet(ev.on);
    else if (ev.type === 'meal') brain.startMeal(ev.meal);
    else if (ev.type === 'pause') { pausedUntil = performance.now() + ev.minutes * 60000; ui.hide(); }
  });

  // ---------- loop ----------
  brain.startFocus();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ch.update(dt);
    if (now >= pausedUntil && idleSec < 60) brain.tick(dt * 1000);  // timers stand still during Pause 15 min and while you are away from the keyboard
    else if (now >= pausedUntil && brain.state !== 'focusing') brain.tick(dt * 1000);   // breaks and meals keep counting while you are away
    if (debugOn) $('debug').textContent = lastSense + ' | ' + brain.state + (brain.timer ? ' ' + brain.timer.kind + ' ' + Math.ceil((brain.timer.endsAt - brain.t) / 1000) + ' s' : '');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ch.draw(ctx);
    if (over) showHover(true);
    status = 'running, ' + Object.keys(images).length + ' images, brain ' + brain.state + ', picture ' + (ch.visual.name || ch.visual.type);
  }
  function loop(now) { frame(now); requestAnimationFrame(loop); }
  frame(last); requestAnimationFrame(loop);
})();
