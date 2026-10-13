/* Tokku brain: state machine for focus, breaks, meals, Quiet mode, dialogue and optional voice.
   Timers run on "sim time" (milliseconds) that the host advances with tick(dtMs).
   In the real app the host passes real time; in the test page it can be sped up.

   States: idle, focusing, attention, break, meal, sleeping, waking, walking, celebrating
   Quiet mode is an overlay flag, not a state: it hides bubbles, stops speech and turns
   Tokku away, while every timer keeps running. Anything that was due while quiet is
   delivered once when Quiet mode ends.

   Host must provide ui = { say(text, opts) -> id, hide(id?), onTimer(info) }
*/
(function (root) {
  const MIN = 60000;
  const DEFAULT_LINES = {
    focus_start: ["Focus time. I'll keep watch.", "25 minutes. Let's go."],
    focus_end: ["25 minutes done. Time for a 5 minute break.", "Nice focus. Take 5 minutes?"],
    extend_ok: ["Okay. Five more minutes.", "Deal. Five more, then a break."],
    extend_end: ["Five minutes are up. Break time.", "That was the extra five. Break now."],
    break_start: ["Enjoy your break. Stretch and drink some water.", "Break time. Look away from the screen."],
    nudge_gentle: ["You're watching {app} again. {task} is still waiting.", "{app}? Really? {task} is still waiting.", "{app} again? I'll stand here until {task} is done."],
    bargain_granted: ["Fine. Five minutes. I'm counting.", "Five minutes, then we're back. Deal?"],
    bargain_over: ["Five minutes are over. Please turn {app} off.", "Time's up. Close {app}, {task} is waiting.", "I kept my promise about {app}. Your turn."],
    nudge_firm: ["You are wasting your time on {app} again. Please turn it off.", "{app} again, third time. Even my tail is annoyed now.", "{app} will still be here tomorrow. {task} will not wait."],
    late_night: ["{app} at {time}? Tomorrow-you will not be happy.", "{app} this late? Sleep or work. There's no third option."],
    back_to_work: ["Good choice. Let's go.", "That's the spirit. Back to it."],
    welcome_back: ["Welcome back. Let's pick up where we left off.", "There you are. {task} missed you."],
    break_over: ["Break's over. Fresh start.", "Back at it. You've got this."],
    break_end: ["Break's over. Back to '{task}'?", "Ready? '{task}' is waiting."],
    meal_start: ["Enjoy your {meal}. See you in an hour.", "Go eat. I'll nap till you're back."],
    meal_end: ["Welcome back. Ready to focus?", "Hope the {meal} was good. Shall we start?"],
    task_done: ["Done! Next up: '{next}'.", "One down. Next: '{next}'."],
    dragged: ["Hey, I was standing there.", "Moving me won't finish the work."],
    dragged_again: ["Again? I'm walking back to my corner.", "Stop dragging me. I'm going back.", "You can move me, but I will come back."],
    quiet_over: ["You're free again. I waited quietly.", "Call's over? Picking up where we left off."],
    remind: ["Still here. Break or five more minutes?"],
  };
  const pick = (arr, last) => { if (arr.length === 1) return arr[0]; let s; do { s = arr[Math.floor(Math.random() * arr.length)]; } while (s === last); return s; };

  class TokkuBrain {
    constructor(character, ui, opts = {}) {
      this.ch = character; this.ui = ui;
      this.o = Object.assign({ focusMin: 25, breakMin: 5, extendMin: 5, mealMin: 60, maxExtensions: 1, remindMin: 2,
        lines: DEFAULT_LINES, topTask: () => 'Finish DJX concept PDF', nextTask: () => 'Record demo video',
        homeX: 1100, nudgeAfterSec: 45, bargainMin: 5, backGraceSec: 60, renudgeSec: 60, blockAfterIgnored: 2, now: () => new Date() }, opts);
      this.t = 0;                 // sim ms
      this.state = 'idle'; this.quiet = false; this.timer = null; this.pending = [];
      this.extensions = 0; this.meal = null; this.drags = 0; this.lastLine = {};
      this.voiceOn = false; this.voiceName = null;
      this.log = [];              // [{t, ev, state}] for tests and the privacy panel
      this.bubble = null;         // {id, actionable}
      this.dist = { app: null, sec: 0, nudged: false, graceUntil: 0 };   // current video or game in front
      this.nudges = []; this.nudging = false; this.bargaining = false; this.watching = false;
      this.ignored = 0; this.blocked = false;                             // ignored nudges in a row; standing in the middle of the screen    // nudge times (last 30 min), open nudge, granted bargain
    }

    // ---------- time ----------
    tick(dtMs) {
      this.t += dtMs;
      if (this.timer && this.t >= this.timer.endsAt) { const tm = this.timer; this.timer = null; this._due(tm.kind); }
      this.ch.face = ((this.watching && !this.bargaining) || this.ch.forceAngry) ? 'angry' : 'normal';   // on watch over a video: angry idle
      if (this.ui.onTimer) this.ui.onTimer(this.timerInfo());
    }
    timerInfo() { if (!this.timer) return null; return { kind: this.timer.kind, remainingMs: Math.max(0, this.timer.endsAt - this.t), state: this.state }; }
    _setTimer(kind, minutes) { this.timer = { kind, endsAt: this.t + minutes * MIN }; this._ev('timer:' + kind); }   // one timer only: replaces any other
    _clearTimer() { this.timer = null; }
    _ev(ev) { this.log.push({ t: this.t, ev, state: this.state, quiet: this.quiet }); }

    // ---------- dialogue ----------
    line(key, vars = {}) {
      const arr = this.o.lines[key] || [key]; const s = pick(arr, this.lastLine[key]); this.lastLine[key] = s;
      const time = this.o.now().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const out = s.replaceAll('{task}', this.o.topTask()).replaceAll('{next}', this.o.nextTask()).replaceAll('{meal}', this.meal || 'meal')
        .replaceAll('{minutes}', vars.minutes || '').replaceAll('{app}', this.dist.app || 'that').replaceAll('{time}', time);
      return (out[0].toUpperCase() + out.slice(1)).replace(/([.?!]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());   // a capital after every full stop
    }
    say(key, actions = null, vars, sticky = false) {      // sticky: no buttons, but it stays up and he waits for you to act
      const text = this.line(key, vars);
      if (this.quiet) { this._ev('suppressed:' + key); return null; }
      const actionable = sticky || !!(actions && actions.length);
      this.ch.talk(true);
      const id = this.ui.say(text, { actions, actionable, timeoutMs: actionable ? 60000 : Math.max(2600, text.length * 70),
        onDone: () => this.ch.talk(false), onTimeout: actionable ? () => this._actionTimeout(key) : null });
      this.bubble = { id, actionable, key, actions };
      this._speak(text); this._ev('say:' + key);
      return id;
    }
    _hideBubble() { if (this.bubble) { this.ui.hide(this.bubble.id); this.bubble = null; } this.ch.talk(false); }
    _actionTimeout(key) {
      this._ev('timeout:' + key); this.bubble = null; this.ch.talk(false);
      if (this.nudging) {          // no answer to a nudge: he stays, arms crossed, and asks again in a minute
        this.nudging = false; this.dist.nudged = false; this.dist.graceUntil = this.t + this.o.renudgeSec * 1000;
        this.ignored++;
        if (this.ignored >= this.o.blockAfterIgnored && !this.blocked) { this.blocked = true; this._ev('block'); }   // the host walks him to the middle
        if (!this.quiet) { this.ch.face = 'angry'; this.ch.idle(); } return;      // waits in the angry idle, blinking
      }
      if (this.state === 'attention') this._setTimer('remind', this.o.remindMin);
    }

    // ---------- distraction: a video or game is in front (Guard reports only a category and an app label) ----------
    activity(category, app, dtSec) {
      const d = this.dist, bad = category === 'video' || category === 'game';
      if (!bad) { if (d.app) this._distractionEnded(); return; }
      if (this.state === 'meal' || this.state === 'waking') return;             // watching something while eating is fine
      if (d.app !== app) { d.app = app; d.sec = 0; d.nudged = false; }
      d.sec += dtSec;
      if (this.quiet || this.nudging || d.nudged || this.t < d.graceUntil || d.sec < this.o.nudgeAfterSec) return;
      this._nudge();
    }
    _nudge() {
      const d = this.dist; d.nudged = true; this.nudging = true; this.watching = true;   // stays in front until the video is closed
      this.nudges = this.nudges.filter(t => this.t - t < 30 * MIN); this.nudges.push(this.t);
      // No "Back to work" button: only really closing the video or switching away counts, and he sees that himself.
      const n = this.nudges.length;
      const now = this.o.now(), mins = now.getHours() * 60 + now.getMinutes(), late = mins >= 23 * 60 + 30 || mins < 5 * 60;
      this._ev('nudge:' + n); this.ch.minimalMotion = false;
      if (n >= 3) { this.bargaining = false; this.ch.show('annoyed_angry'); this.say('nudge_firm', null, undefined, true); }                      // third time in 30 min
      else if (this.bargaining) { this.bargaining = false; this.ch.show('away_check_time'); this.say('bargain_over', null, undefined, true); }    // the five minutes are over
      else { this.ch.show('annoyed_question'); this.say(late ? 'late_night' : 'nudge_gentle', [{ id: 'bargain', label: '5 more minutes' }]); }
    }
    _distractionEnded() {          // the video or game is no longer in front
      const d = this.dist, was = this.nudging || this.bargaining;
      const watched = this.watching;
      d.app = null; d.sec = 0; d.nudged = false; this.nudging = false; this.bargaining = false; this.watching = false;
      this.ignored = 0; this.blocked = false;
      if (!was && !watched) return;
      this._ev('distraction:ended'); this._hideBubble();
      if (this.quiet) return;
      this.say('back_to_work'); this.ch.play('thanks').then(ok => ok && this.state === 'focusing' && this.ch.setMood('focused'));
    }

    // ---------- voice (optional, local Windows voices only, off by default) ----------
    setVoice(on) { this.voiceOn = !!on; if (!on) this._stopSpeech(); this._ev('voice:' + (on ? 'on' : 'off')); }
    _speak(text) {
      if (!this.voiceOn || this.quiet) return;
      const ss = root.speechSynthesis; if (!ss) return;
      const voices = ss.getVoices().filter(v => v.localService);           // never cloud voices
      if (!voices.length) { this._ev('voice:no-local-voice'); return; }
      ss.cancel();                                                         // no overlapping speech
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voices.find(v => /en/i.test(v.lang) && /male|david|mark|guy/i.test(v.name)) || voices.find(v => /en/i.test(v.lang)) || voices[0];
      u.rate = 1.05; u.pitch = 1.15; ss.speak(u);
    }
    _stopSpeech() { const ss = root.speechSynthesis; if (ss) ss.cancel(); }

    // ---------- Pomodoro ----------
    startFocus() {
      if (this.state === 'meal') return false;
      this._hideBubble(); this.state = 'focusing'; this.extensions = 0; this._setTimer('focus', this.o.focusMin);
      this.ch.minimalMotion = true; this.ch.setMood('focused');
      if (!this.quiet) this.ch.idle(); this.say('focus_start'); return true;
    }
    choose(action) {
      this._ev('choose:' + action); this._hideBubble();
      if (this.nudging) this.ignored = 0;                             // any answer counts as not ignoring him
      if (action === 'bargain' && this.nudging) {                     // "5 more minutes" of the video: open palm, then he looks away
        this.nudging = false; this.bargaining = true; this.dist.nudged = false; this.dist.graceUntil = this.t + this.o.bargainMin * MIN;
        if (!this.quiet) this.ch.accept().then(ok => ok && this.bargaining && this.ch.show('away_look_away'));
        this.say('bargain_granted'); return true;
      }
      if (action === 'backtowork' && this.nudging) {                  // I promise to go back: thumbs up, and a minute to actually do it
        this.nudging = false; this.bargaining = false; this.dist.nudged = false; this.dist.sec = 0; this.dist.graceUntil = this.t + this.o.backGraceSec * 1000;
        if (!this.quiet) this.ch.play('thanks').then(ok => {
          if (!ok) return;
          if (this.dist.app) this.ch.show('annoyed_mild');            // still open: he waits with arms crossed, not with a smile
          else if (this.state === 'focusing') this.ch.setMood('focused');
        });
        this.say('back_to_work'); return true;
      }
      if (action === 'extend' && this.state === 'attention' && this.extensions < this.o.maxExtensions) {
        this.extensions++; this.state = 'focusing'; this._setTimer('extend', this.o.extendMin);
        if (!this.quiet) { this.ch.accept().then(ok => ok && this.ch.setMood('focused')); } this.say('extend_ok'); return true;
      }
      if (action === 'break' && this.state === 'attention') {
        this.state = 'break'; this._setTimer('break', this.o.breakMin); this.ch.minimalMotion = false;
        if (!this.quiet) this.ch.rest(); this.say('break_start'); return true;
      }
      if (action === 'resume') return this.startFocus();
      return false;
    }
    // Hover button "Take a break": a break I start myself, at any time while working.
    startBreak() {
      if (this.state === 'meal' || this.state === 'break' || this.state === 'waking') return false;
      this._ev('user:break'); this._hideBubble();
      this.state = 'break'; this._setTimer('break', this.o.breakMin); this.ch.minimalMotion = false;
      if (!this.quiet) this.ch.rest(); this.say('break_start'); return true;
    }
    // Hover button "Break over": I am back before the 5 minutes ended. Straight back to focus, no question asked.
    breakOver() {
      if (this.state !== 'break') return false;
      this._ev('user:break_over'); this._hideBubble();
      this.state = 'focusing'; this.extensions = 0; this._setTimer('focus', this.o.focusMin); this.ch.minimalMotion = true;
      if (!this.quiet) this.ch.stretchUp().then(ok => ok && this.state === 'focusing' && this.ch.setMood('focused'));
      this.say('break_over'); return true;
    }
    _due(kind) {
      this._ev('due:' + kind);
      if (this.quiet && kind !== 'meal') { this.pending.push(kind); this._ev('deferred:' + kind); return; }
      this._deliver(kind);
    }
    _deliver(kind) {
      if (kind === 'focus' || kind === 'extend' || kind === 'remind') {
        if (this.state !== 'focusing' && this.state !== 'attention') return;
        if (this.dist.app) { this._setTimer('remind', this.o.remindMin); return; }   // no break reminder on top of a video: the nudge handles that
        this.state = 'attention'; this.ch.minimalMotion = false; this.ch.attention();
        const acts = [{ id: 'break', label: 'Start break' }];
        if (this.extensions < this.o.maxExtensions) acts.push({ id: 'extend', label: 'Five more minutes' });
        this.say(kind === 'extend' ? 'extend_end' : kind === 'remind' ? 'remind' : 'focus_end', acts);
      } else if (kind === 'break') {
        if (this.state !== 'break') return;
        this.state = 'attention'; this.ch.stretchUp();
        this.say('break_end', [{ id: 'resume', label: 'Resume focus' }]);
      } else if (kind === 'meal') {
        this.endMeal();
      }
    }

    // ---------- meals ----------
    startMeal(meal) {
      this._hideBubble(); this._clearTimer(); this.pending = this.pending.filter(k => k === 'meal');
      this.meal = meal; this.state = 'meal'; this._setTimer('meal', this.o.mealMin); this.ch.minimalMotion = false;
      this.say('meal_start'); this.ch.sleep(); return true;
    }
    endMeal() {
      if (this.state !== 'meal') return false;
      this._clearTimer(); this.state = 'waking'; this._ev('meal_end');
      this.ch.setQuietLook(this.quiet);
      this.ch.wake().then(ok => {
        if (!ok) return; this.state = 'idle';
        if (this.quiet) { this.pending.push('meal_end_line'); this.ch.faceAway(); return; }
        this.say('meal_end', [{ id: 'resume', label: 'Resume focus' }]);
      });
      return true;
    }
    awayPingAllowed() { return this.state !== 'meal' && this.state !== 'waking'; }   // meal breaks never ping the phone

    // ---------- tasks and dragging ----------
    taskDone() {
      this._ev('task_done'); if (this.quiet) return false;
      const back = this.state; this.state = 'celebrating';
      this.say('task_done'); this.ch.celebrate().then(ok => { if (ok && this.state === 'celebrating') this.state = back === 'celebrating' ? 'idle' : back; });
      return true;
    }
    async dragged(toX) {
      if (this.state === 'meal') return false;
      this.drags++; const back = this.state; this.state = 'walking'; this._hideBubble();
      this.ch.x = toX;                               // the user dropped him here
      if (this.quiet) { this.ch.x = this.o.homeX; this.state = back; return true; }
      if (this.drags >= 2) { await this.ch.annoyed(Math.min(3, this.drags)); this.say('dragged_again'); } else this.say('dragged');
      const ok = await this.ch.walkTo(this.o.homeX);
      if (ok) { this.state = back === 'walking' ? 'idle' : back; if (this.state === 'focusing') this.ch.setMood('focused'); }
      return ok;
    }

    // ---------- Quiet mode (overrides visuals and speech, never timers) ----------
    setQuiet(on) {
      on = !!on; if (on === this.quiet) return; this.quiet = on; this._ev('quiet:' + (on ? 'on' : 'off'));
      if (on) {
        this._stopSpeech(); this.nudging = false; this.dist.nudged = false;
        if (this.bubble && this.bubble.actionable) this.pending.push('bubble:' + this.bubble.key);
        this._hideBubble();
        if (this.state === 'meal' || this.state === 'sleeping') this.ch.setQuietLook(true); else this.ch.faceAway();
      } else {
        if (this.state === 'meal' || this.state === 'sleeping') { this.ch.setQuietLook(false); return; }
        const p = this.pending; this.pending = [];
        this.ch.faceBack().then(ok => {
          if (!ok) return;
          const due = p.filter(k => !k.startsWith('bubble:') && k !== 'meal_end_line');
          if (due.length) { this._deliver(due[due.length - 1]); return; }
          if (p.includes('meal_end_line')) { this.say('meal_end', [{ id: 'resume', label: 'Resume focus' }]); return; }
          const b = p.find(k => k.startsWith('bubble:'));
          if (b && this.state === 'attention') { this._deliver('remind'); return; }
          if (this.state === 'break') this.ch.rest();
          if (p.length || this.state === 'focusing') this.say('quiet_over');
          if (this.state === 'focusing') this.ch.setMood('focused');
        });
      }
    }
  }
  TokkuBrain.LINES = DEFAULT_LINES;
  if (typeof module !== 'undefined' && module.exports) module.exports = TokkuBrain; else root.TokkuBrain = TokkuBrain;
})(typeof window !== 'undefined' ? window : globalThis);
