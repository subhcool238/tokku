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
    break_end: ["Break's over. Back to '{task}'?", "Ready? '{task}' is waiting."],
    meal_start: ["Enjoy your {meal}. See you in an hour.", "Go eat. I'll nap till you're back."],
    meal_end: ["Welcome back. Ready to focus?", "Hope the {meal} was good. Shall we start?"],
    task_done: ["Done! Next up: '{next}'.", "One down. Next: '{next}'."],
    dragged: ["Hey. That's my corner.", "I'm walking back, you know."],
    dragged_again: ["Again? I'm going back.", "Nope. Corner. Mine."],
    quiet_over: ["You're free again. I waited quietly.", "Call's over? Picking up where we left off."],
    remind: ["Still here. Break or five more minutes?"],
  };
  const pick = (arr, last) => { if (arr.length === 1) return arr[0]; let s; do { s = arr[Math.floor(Math.random() * arr.length)]; } while (s === last); return s; };

  class TokkuBrain {
    constructor(character, ui, opts = {}) {
      this.ch = character; this.ui = ui;
      this.o = Object.assign({ focusMin: 25, breakMin: 5, extendMin: 5, mealMin: 60, maxExtensions: 1, remindMin: 2,
        lines: DEFAULT_LINES, topTask: () => 'Finish DJX concept PDF', nextTask: () => 'Record demo video',
        homeX: 1100 }, opts);
      this.t = 0;                 // sim ms
      this.state = 'idle'; this.quiet = false; this.timer = null; this.pending = [];
      this.extensions = 0; this.meal = null; this.drags = 0; this.lastLine = {};
      this.voiceOn = false; this.voiceName = null;
      this.log = [];              // [{t, ev, state}] for tests and the privacy panel
      this.bubble = null;         // {id, actionable}
    }

    // ---------- time ----------
    tick(dtMs) {
      this.t += dtMs;
      if (this.timer && this.t >= this.timer.endsAt) { const tm = this.timer; this.timer = null; this._due(tm.kind); }
      if (this.ui.onTimer) this.ui.onTimer(this.timerInfo());
    }
    timerInfo() { if (!this.timer) return null; return { kind: this.timer.kind, remainingMs: Math.max(0, this.timer.endsAt - this.t), state: this.state }; }
    _setTimer(kind, minutes) { this.timer = { kind, endsAt: this.t + minutes * MIN }; this._ev('timer:' + kind); }   // one timer only: replaces any other
    _clearTimer() { this.timer = null; }
    _ev(ev) { this.log.push({ t: this.t, ev, state: this.state, quiet: this.quiet }); }

    // ---------- dialogue ----------
    line(key, vars = {}) {
      const arr = this.o.lines[key] || [key]; const s = pick(arr, this.lastLine[key]); this.lastLine[key] = s;
      return s.replace('{task}', this.o.topTask()).replace('{next}', this.o.nextTask()).replace('{meal}', this.meal || 'meal').replace('{minutes}', vars.minutes || '');
    }
    say(key, actions = null, vars) {
      const text = this.line(key, vars);
      if (this.quiet) { this._ev('suppressed:' + key); return null; }
      const actionable = !!(actions && actions.length);
      this.ch.talk(true);
      const id = this.ui.say(text, { actions, actionable, timeoutMs: actionable ? 60000 : Math.max(2600, text.length * 70),
        onDone: () => this.ch.talk(false), onTimeout: actionable ? () => this._actionTimeout(key) : null });
      this.bubble = { id, actionable, key, actions };
      this._speak(text); this._ev('say:' + key);
      return id;
    }
    _hideBubble() { if (this.bubble) { this.ui.hide(this.bubble.id); this.bubble = null; } this.ch.talk(false); }
    _actionTimeout(key) { this._ev('timeout:' + key); this.bubble = null; this.ch.talk(false); if (this.state === 'attention') this._setTimer('remind', this.o.remindMin); }

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
      if (action === 'extend' && this.state === 'attention' && this.extensions < this.o.maxExtensions) {
        this.extensions++; this.state = 'focusing'; this._setTimer('extend', this.o.extendMin);
        if (!this.quiet) { this.ch.plead(1000).then(ok => ok && this.ch.setMood('focused')); } this.say('extend_ok'); return true;
      }
      if (action === 'break' && this.state === 'attention') {
        this.state = 'break'; this._setTimer('break', this.o.breakMin); this.ch.minimalMotion = false;
        if (!this.quiet) this.ch.rest(); this.say('break_start'); return true;
      }
      if (action === 'resume') return this.startFocus();
      return false;
    }
    _due(kind) {
      this._ev('due:' + kind);
      if (this.quiet && kind !== 'meal') { this.pending.push(kind); this._ev('deferred:' + kind); return; }
      this._deliver(kind);
    }
    _deliver(kind) {
      if (kind === 'focus' || kind === 'extend' || kind === 'remind') {
        if (this.state !== 'focusing' && this.state !== 'attention') return;
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
      if (this.drags >= 2) { await this.ch.annoyed(1300, 700); this.say('dragged_again'); } else this.say('dragged');
      const ok = await this.ch.walkTo(this.o.homeX);
      if (ok) { this.state = back === 'walking' ? 'idle' : back; if (this.state === 'focusing') this.ch.setMood('focused'); }
      return ok;
    }

    // ---------- Quiet mode (overrides visuals and speech, never timers) ----------
    setQuiet(on) {
      on = !!on; if (on === this.quiet) return; this.quiet = on; this._ev('quiet:' + (on ? 'on' : 'off'));
      if (on) {
        this._stopSpeech();
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
