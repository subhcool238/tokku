/* Tokku on the desktop: character + brain + speech bubble + hover buttons. No other UI.
   Talks to Guard only through the narrow window.guard bridge (see src/main/preload.js). */
(async function () {
  const BASE = 'character/assets/';
  const $ = (id) => document.getElementById(id);
  const canvas = $('stage'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  const bubble = $('bubble'), bubbleText = $('bubble-text'), bubbleActs = $('bubble-acts'), hoverBar = $('hover-bar');
  const guard = window.guard || { hover() {}, front() {}, walk() {}, dragStart() {}, drag() {}, drop() {}, onEvent() {} };
  const HOME_X = 215, GROUND_Y = canvas.height - 7;               // 215 is also the centre of the bubble and buttons in app.css
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
    const files = new Set([...Object.values(char.rig.layers), ...Object.values(char.rig.overlays), ...Object.values(char.rig.angry || {})]);
    Object.values(char.poses).forEach(p => { if (!p.legacy) files.add(p.file); });   // the turn ring uses the same files
    images = Object.fromEntries(await Promise.all([...files].map(loadImage)));
    status = 'running, ' + files.size + ' images';
  } catch (err) { status = 'ERROR: ' + err.message; return; }

  const ch = new TokkuCharacter(char, images);
  ch.x = HOME_X; ch.groundY = GROUND_Y;

  // ---------- speech bubble (the brain's "ui") ----------
  let bubbleId = 0, hideTimer = null, typeTimer = null, asking = false;
  // He is in front while a question is open, and from his first nudge until the video or game is closed.
  // Going back behind the windows waits a moment, so the last pose (thumbs up) is still seen.
  let inFront = false, backAt = 0;
  function updateFront(now) {
    const want = asking || brain.watching || moving || dragging || place !== 'home';
    if (want) { backAt = 0; if (!inFront) { inFront = true; guard.front(true); } }
    else if (inFront) { if (!backAt) backAt = now + 2600; else if (now >= backAt) { inFront = false; backAt = 0; guard.front(false); } }
  }
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
      asking = !!o.actionable;                                      // a question for you: come to the front
      hideTimer = setTimeout(() => { if (id !== bubbleId) return; bubble.hidden = true; asking = false; o.onTimeout && o.onTimeout(); }, o.timeoutMs);
      return id;
    },
    hide() { clearTimeout(hideTimer); clearInterval(typeTimer); bubble.hidden = true; asking = false; },
    onTimer() {},
  };
  const brain = new TokkuBrain(ch, ui, { homeX: HOME_X, topTask: () => 'your work', nextTask: () => 'the next task' });   // real Notion tasks arrive in Phase 5

  // ---------- hover buttons: only what fits the moment ----------
  const mealNow = () => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner'; };
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  function hoverButtons() {
    if (brain.quiet || !bubble.hidden || brain.watching || moving || dragging) return [];      // never on top of a bubble or during a nudge
    if (brain.state === 'meal') return [button("I'm back", true, () => brain.endMeal())];
    if (brain.state === 'break') return [button('Break over', true, () => brain.breakOver())];
    if (brain.state === 'waking' || brain.state === 'celebrating' || brain.state === 'walking') return [];
    const meal = mealNow();
    return [button('Take a break', true, () => brain.startBreak()), button(cap(meal), false, () => brain.startMeal(meal))];
  }
  let hoverKey = '';
  function showHover(on) {
    if (!on) { hoverBar.hidden = true; hoverKey = ''; return; }
    const key = brain.state + '|' + brain.quiet + '|' + mealNow() + '|' + bubble.hidden + '|' + brain.watching;
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
  // Click and drag. A press that does not move is a click (wakes him from a meal, ends a break).
  // A press that moves is a drag: he hangs from the mouse, drops, sits, complains and walks back.
  let press = null, dragging = false, dragTimes = [];
  window.addEventListener('mousemove', (e) => {
    if (press && !dragging && Math.hypot(e.screenX - press.x, e.screenY - press.y) > 6 && !brain.quiet && brain.state !== 'meal') {
      // works at any moment, also while he is walking back or still falling: this drag simply takes over
      dragging = true; moveGen++; moving = false; ui.hide(); showHover(false); guard.dragStart(); ch.shadowTarget = 0; ch.dragStart();
    }
    if (dragging) { guard.drag(e.screenX - press.x, e.screenY - press.y); ch.dragMove(e.movementX * 60); return; }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    setOver(!!(el && el.closest('.hit')) || onCharacter(e.clientX, e.clientY));
  });
  document.addEventListener('mouseleave', () => { if (!dragging) setOver(false); });
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0 && !e.target.closest('.hit') && onCharacter(e.clientX, e.clientY)) press = { x: e.screenX, y: e.screenY };
  });
  window.addEventListener('mouseup', () => {
    const was = press; press = null;
    if (dragging) { dragging = false; moving = true; guard.drop(); return; }      // let go: he falls, then onArrived('ground')
    if (!was) return;
    if (brain.state === 'meal') brain.endMeal();                    // clicking him while he sleeps wakes him up
    else if (brain.state === 'break') brain.breakOver();            // and clicking him on a break ends the break
  });

  // ---------- events from Guard (tray menu now; sensing arrives in Phase 2) ----------
  let pausedUntil = 0, idleSec = 0, debugOn = false, lastSense = '';
  guard.onEvent((ev) => {
    if (ev.type === 'arrived') { onArrived(ev.where); return; }
    if (ev.type === 'activity') {
      idleSec = ev.idle;
      lastSense = ev.category + (ev.app ? ' ' + ev.app : '') + ' | idle ' + ev.idle + ' s' + (ev.locked ? ' | locked' : '') + (ev.desktop ? ' | desktop in front' : '') + (ev.reasons.length ? ' | quiet: ' + ev.reasons.join(', ') : '');
      // Watching a video means no mouse and no keyboard, so idle time must not end a distraction.
      // Only a very long idle (30 min: the video is playing to an empty chair) or a locked screen does.
      const there = !ev.locked && ev.idle < 1800;
      if (performance.now() >= pausedUntil) brain.activity(there ? ev.category : 'other', ev.app, ev.dt);
      step();                                                       // react at once, even if the window is covered
      if (ev.idle >= 300 && brain.state === 'focusing' && brain.timer && brain.timer.kind === 'focus') brain._setTimer('focus', brain.o.focusMin);   // 5 idle minutes count as a break
    }
    else if (ev.type === 'back') { if (ev.minutes >= 30 && !brain.quiet && brain.state !== 'meal') { ch.welcomeBack(); brain.say('welcome_back'); } }
    else if (ev.type === 'debug') { debugOn = ev.on; $('debug').hidden = !ev.on; }
    else if (ev.type === 'quiet') brain.setQuiet(ev.on);
    else if (ev.type === 'meal') brain.startMeal(ev.meal);
    else if (ev.type === 'pause') { pausedUntil = performance.now() + ev.minutes * 60000; ui.hide(); }
  });

  // ---------- ignored for too long: he walks to the middle of the screen and stays until the video is closed ----------
  let place = 'home', moving = false, holdUntil = 0, moveGen = 0;      // moveGen: a new drag cancels whatever was going on
  const WALK_SPEED = 200;                                         // same as WALK_PX_PER_SEC in src/main/main.js
  function targetX(where) {                                       // where the window's left edge will be, to know which way to walk
    const left = screen.availLeft || 0, w = window.outerWidth || 340;
    return where === 'center' ? Math.round(left + (screen.availWidth - w) / 2) : left + screen.availWidth - w;
  }
  function updatePlace() {
    if (moving || dragging || performance.now() < holdUntil) return;
    const want = (brain.blocked && !brain.quiet) ? 'center' : 'home';
    if (want === place) return;
    if (want === 'home' && ch.mode !== 'idle' && ch.mode !== 'quiet') return;   // let him finish his thumbs up first
    const dir = Math.sign(targetX(want) - window.screenX);
    if (!dir) { place = want; return; }
    moving = true; ui.hide(); showHover(false);
    const angry = want === 'center' || (place === 'dropped' && dragTimes.length >= 2);      // he stomps over, or stomps back
    ch.forceAngry = angry; ch.face = angry ? 'angry' : ch.face;
    ch.walkInPlace(dir, WALK_SPEED, angry ? 'angry' : null);
    guard.walk(want);
  }
  async function onArrived(where) {
    const gen = moveGen;
    if (dragging) return;
    if (where === 'ground') {                                     // dropped after a drag: land, sit, complain, then walk back
      const now = performance.now();
      dragTimes = dragTimes.filter(t => now - t < 3600000); dragTimes.push(now);      // annoyance resets after an hour
      ch.shadowTarget = 1; place = 'dropped';
      await ch.dragEnd(!(dragTimes.length >= 2 && !brain.quiet)); if (gen !== moveGen) return;
      if (dragTimes.length >= 2 && !brain.quiet) { await ch.annoyed(Math.min(3, dragTimes.length)); if (gen !== moveGen) return; }
      brain.say(dragTimes.length >= 2 ? 'dragged_again' : 'dragged');
      holdUntil = performance.now() + 2200; moving = false;
      return;
    }
    place = where;
    await ch.walkDone(); ch.forceAngry = false; if (gen !== moveGen) return;
    moving = false;
    if (brain.quiet) ch.faceAway();                               // Quiet mode started while he was walking
    if (where === 'center' && brain.dist.app) brain.dist.graceUntil = brain.t;   // he speaks up as soon as he gets there
  }

  // ---------- loop ----------
  brain.startFocus();
  let last = performance.now();
  function frame(now) {
    const elapsed = Math.min(5, Math.max(0, (now - last) / 1000)); last = now;      // real time, even if frames were skipped while covered
    for (let left = elapsed; left > 0.0005; left -= 0.05) ch.update(Math.min(0.05, left));
    // The focus timer only counts while you are at the keyboard. Everything else (breaks, meals, the five minutes
    // of a video) counts in real time. Pause 15 min stops all of it.
    const working = brain.state === 'focusing' && !brain.dist.app;
    if (now >= pausedUntil && !(working && idleSec >= 60)) brain.tick(elapsed * 1000);
    if (debugOn) $('debug').textContent = lastSense + ' | ' + brain.state + (brain.timer ? ' ' + brain.timer.kind + ' ' + Math.ceil((brain.timer.endsAt - brain.t) / 1000) + ' s' : '');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ch.draw(ctx);
    if (over) showHover(true);
    ch.faceSide = (window.screenX + HOME_X) > ((screen.availLeft || 0) + screen.availWidth / 2) ? 'left' : 'right';   // look into the screen
    updatePlace();
    updateFront(now);
    status = 'running, ' + Object.keys(images).length + ' images, brain ' + brain.state + ', picture ' + (ch.visual.name || ch.visual.type);
  }
  window.__tokku = { brain, ch };                                 // for the self-test in src/main/main.js
  function step() { frame(performance.now()); }
  function loop() { step(); requestAnimationFrame(loop); }
  step(); requestAnimationFrame(loop);
  setInterval(step, 250);                                         // keeps him thinking when the window is covered and frames stop
})();
