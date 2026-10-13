/* Review page: one button per sequence and per brain action, a speed selector and "Play full story".
   Opens straight from disk (double click sequences.html), no server needed. */
(async function () {
  const BASE = '../../src/renderer/character/assets/';
  const char = window.TOKKU_CHARACTER;
  const $ = (id) => document.getElementById(id);
  const canvas = $('stage'), ctx = canvas.getContext('2d');
  const HOME_X = 640, GROUND_Y = 380;
  let speed = 1;

  // ---- images
  const files = new Set([...Object.values(char.rig.layers), ...Object.values(char.rig.overlays), ...Object.values(char.rig.angry || {})]);
  Object.values(char.poses).forEach(p => { if (!p.legacy) files.add(p.file); });
  const images = {};
  let failed = [];
  await Promise.all([...files].map(f => new Promise(res => {
    const im = new Image(); im.onload = () => { images[f] = im; res(); }; im.onerror = () => { failed.push(f); res(); }; im.src = BASE + f;
  })));

  const ch = new TokkuCharacter(char, images);
  ch.x = HOME_X; ch.groundY = GROUND_Y;

  // ---- speech bubble (the brain's "ui")
  let bubbleId = 0, bubbleTimer = null, bubbleDone = null;
  const ui = {
    say(text, o) {
      clearTimeout(bubbleTimer); clearTimeout(bubbleDone);
      const id = ++bubbleId;
      $('bubble-text').textContent = text;
      const acts = $('bubble-acts'); acts.innerHTML = '';
      (o.actions || []).forEach(a => { const b = document.createElement('button'); b.textContent = a.label; b.onclick = () => brain.choose(a.id); acts.appendChild(b); });
      $('bubble').style.display = 'block';
      bubbleDone = setTimeout(() => o.onDone && o.onDone(), Math.min(2200, 300 + text.length * 45) / speed);   // mouth stops when the line is "said"
      bubbleTimer = setTimeout(() => { if (id === bubbleId) { $('bubble').style.display = 'none'; o.onTimeout && o.onTimeout(); } }, o.timeoutMs / speed);
      return id;
    },
    hide() { clearTimeout(bubbleTimer); clearTimeout(bubbleDone); $('bubble').style.display = 'none'; },
    onTimer() {},
  };
  const brain = new TokkuBrain(ch, ui, { homeX: HOME_X });
  const timerDue = () => { if (brain.timer) brain.timer.endsAt = brain.t; };      // review only: make the running timer end now
  const pause = (ms) => ch.wait(ms);                                            // waits in character time, so speed applies

  // ---- buttons
  const add = (rowId, label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; $(rowId).appendChild(b); return b; };

  async function fakeDrag(dropX) {       // what the app does with the mouse: grab, swing, drop, then the brain walks him home
    ui.hide(); await ch.dragStart();
    const from = ch.x, t0 = ch.time;
    while (ch.time - t0 < 1.4 && ch.mode === 'dragged') {
      const k = (ch.time - t0) / 1.4, x = from + (dropX - from) * (k * k * (3 - 2 * k));
      ch.dragMove((x - ch.x) * 60); ch.x = x; ch.groundY = GROUND_Y - 70 * Math.sin(Math.PI * k);
      await pause(16);
    }
    ch.groundY = GROUND_Y;
    await ch.dragEnd();
    await brain.dragged(dropX);
  }

  let watching = null;                                             // review only: pretend a video is in front
  const brainActions = {
    'YouTube opens (nudge after 3 s here)': () => { brain.o.nudgeAfterSec = 3; brain.o.bargainMin = 0.1; brain.o.backGraceSec = 4; watching = 'YouTube'; },
    'YouTube closed': () => { watching = null; },
    'Focus (start 25 min)': () => brain.startFocus(),
    'Attention (focus time is up)': () => { if (brain.state !== 'focusing') brain.startFocus(); timerDue(); },
    'Five more minutes': () => brain.choose('extend'),
    'Break (start 5 min break)': () => brain.choose('break'),
    'Break over': () => { if (brain.state === 'break') timerDue(); },
    'Resume focus': () => brain.choose('resume'),
    'Meal (lunch, he sleeps)': () => brain.startMeal('lunch'),
    'Wake (meal over)': () => brain.endMeal(),
    'Task done': () => brain.taskDone(),
    'Drag him away': () => fakeDrag(220),
    'Quiet on': () => brain.setQuiet(true),
    'Quiet off': () => brain.setQuiet(false),
    'Welcome back': () => { ui.hide(); ch.welcomeBack(); },
  };
  for (const [label, fn] of Object.entries(brainActions)) add('brain-buttons', label, fn);

  const actions = {
    'Walk left': () => ch.walkTo(180), 'Walk right': () => ch.walkTo(840), 'Walk home': () => ch.walkTo(HOME_X),
    'Turn all the way round': async () => { for (const y of [90, 180, -90, 0]) await ch.turnTo(y); ch.rig(); },
    'Attention': () => ch.attention(), 'Point at task': () => ch.pointAtTask(), 'Plead': () => ch.plead(),
    'Accept (thumbs up)': () => ch.accept(), 'Sulk': () => ch.sulk(), 'Surprise': () => ch.surprise(),
    'Annoyed 1': () => ch.annoyed(1), 'Annoyed 2': () => ch.annoyed(2), 'Annoyed 3': () => ch.annoyed(3),
    'Celebrate': () => ch.celebrate(), 'Rest (break)': () => ch.rest(), 'Stretch up': () => ch.stretchUp(),
    'Sleep': () => ch.sleep(), 'Wake': () => ch.wake(), 'Face away (Quiet)': () => ch.faceAway(), 'Face back': () => ch.faceBack(),
    'Angry idle (blink, tail)': () => { ch.forceAngry = !ch.forceAngry; ch.face = ch.forceAngry ? 'angry' : 'normal'; ch.idle(); },
    'Angry walk on the spot': async () => { await ch.walkInPlace(1, 200, 'angry'); setTimeout(() => ch.walkDone(), 4000 / speed); },
    'Talk (mouth)': () => { ch.talk(true); setTimeout(() => ch.talk(false), 2500 / speed); },
    'Blink': () => { ch.blinkClock = 0; },
    'Idle: happy tail wag': () => { ch.idle(); ch.setMood('happy'); }, 'Idle: calm tail': () => { ch.idle(); ch.setMood('calm'); },
  };
  for (const [label, fn] of Object.entries(actions)) add('action-buttons', label, () => { ui.hide(); fn(); });
  for (const name of Object.keys(char.sequences)) {
    if (char.sequences[name].advance === 'distance') continue;        // the walk cycle is shown by the Walk buttons
    add('sequence-buttons', name, () => { ui.hide(); ch.play(name); });
  }

  // ---- clicking him while he sleeps wakes him up (same as on the desktop)
  canvas.addEventListener('mousedown', (e) => {
    const r = canvas.getBoundingClientRect(), k = canvas.width / r.width;
    const x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;
    if (brain.state === 'meal' && Math.abs(x - ch.x) < 120 && y > GROUND_Y - 240 && y < GROUND_Y + 10) brain.endMeal();
  });

  // ---- tabs
  const tabs = [...document.querySelectorAll('[role=tab]')];
  tabs.forEach(t => t.onclick = () => tabs.forEach(o => {
    o.setAttribute('aria-selected', String(o === t)); document.getElementById(o.dataset.tab).hidden = o !== t;
  }));

  // ---- full story
  let storyRun = 0;
  async function story() {
    const me = ++storyRun, alive = () => me === storyRun;
    const step = async (fn, ms) => { if (!alive()) return; fn(); await pause(ms); };
    watching = null; brain.nudges = []; brain.setQuiet(false); ui.hide(); ch.x = HOME_X; await ch.idle(); brain.state = 'idle'; brain.drags = 0; brain.extensions = 0;
    await step(() => {}, 1500);
    await step(() => brain.startFocus(), 3500);                                   // focus starts
    await step(() => brainActions['YouTube opens (nudge after 3 s here)'](), 7000); // YouTube in front: "really?" and the app name
    await step(() => brain.choose('bargain'), 9500);                              // "5 more minutes": open palm, looks away, then checks his watch
    await step(() => { watching = null; }, 4000);                                 // YouTube closed: thumbs up
    await step(() => timerDue(), 5000);                                           // 25 minutes later: he waves hi
    await step(() => brain.choose('extend'), 3500);                               // "Five more minutes": thumbs up
    await step(() => timerDue(), 5000);                                           // extra time over: attention again
    await step(() => brain.choose('break'), 6000);                                // break: stretch, yawn, sit
    await step(() => timerDue(), 4500);                                           // break over: stretch up
    await step(() => brain.choose('resume'), 3000);                               // back to focus
    await step(() => brain.taskDone(), 5500);                                     // task done: jump, check mark, proud
    if (!alive()) return; await fakeDrag(220); await pause(1200);                 // dragged away, walks home
    await step(() => brain.setQuiet(true), 4000);                                 // a call starts: turns his back, dims
    await step(() => brain.setQuiet(false), 4500);                                // call over
    await step(() => brain.startMeal('lunch'), 9000);                             // lunch: falls asleep, breathes
    await step(() => brain.endMeal(), 6500);                                      // meal over: wakes up
    await step(() => { ui.hide(); ch.welcomeBack(); }, 3000);                     // back after being away
    await step(() => { ui.hide(); brain.state = 'idle'; ch.idle(); }, 1500);
    return alive();
  }
  $('story').onclick = story;
  $('stop').onclick = () => { storyRun++; watching = null; brain.setQuiet(false); ui.hide(); brain._clearTimer(); brain.state = 'idle'; ch.minimalMotion = false; ch.setMood('calm'); ch.idle(); };
  document.querySelectorAll('input[name=speed]').forEach(r => r.onchange = () => { if (r.checked) speed = Number(r.value); });

  // ---- drawing loop
  function drawFloor() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)'; ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'; ctx.fillRect(0, GROUND_Y, canvas.width, 1);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'; ctx.fillRect(HOME_X - 1, GROUND_Y, 2, 10);
    ctx.font = '11px system-ui'; ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'; ctx.fillText('home', HOME_X - 14, GROUND_Y + 24);
  }
  function frame(dt) {
    ch.update(dt * speed); brain.tick(dt * 1000 * speed);
    brain.activity(watching ? 'video' : 'work', watching, dt * speed);
    drawFloor(); ch.draw(ctx);
    const k = canvas.clientWidth / canvas.width || 1;
    const b = $('bubble'); b.style.left = (ch.x * k) + 'px'; b.style.top = ((GROUND_Y - 250) * k) + 'px';
    const t = brain.timerInfo();
    $('status').textContent = `brain: ${brain.state}${brain.quiet ? ' (quiet)' : ''}   character: ${ch.mode}   picture: ${ch.visual.type}${ch.visual.name ? ' ' + ch.visual.name : ''}${ch.visual.type === 'ring' ? ' ' + ch.ring[ch.visual.idx].pose : ''}` +
      (t ? `   timer: ${t.kind} ${Math.ceil(t.remainingMs / 1000)} s` : '') + (failed.length ? `   MISSING IMAGES: ${failed.join(', ')}` : '');
  }
  let last = performance.now();
  function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; frame(dt); requestAnimationFrame(loop); }
  frame(0); requestAnimationFrame(loop);

  // for automated checks (tools/review-shot.js)
  window.__tokku = { ch, brain, story, frame, images, failed, setSpeed: (s) => { speed = s; }, canvas };
})();
