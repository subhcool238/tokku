// Run: node tests/brain.test.js   (no dependencies)
const TokkuCharacter = require('../tokku-character.js');
const TokkuBrain = require('../tokku-brain.js');
const char = require('../assets/character.json');
let pass = 0, fail = 0; const results = [];
function check(name, cond, info = '') { (cond ? pass++ : fail++); results.push((cond ? 'PASS ' : 'FAIL ') + name + (info ? '  [' + info + ']' : '')); }
function make() {
  const ch = new TokkuCharacter(char, {}); ch.x = 1100; ch.groundY = 360;
  const said = [], hidden = [];
  const ui = { say: (text, o) => { said.push({ text, actions: (o.actions || []).map(a => a.id) }); return said.length; }, hide: id => hidden.push(id) };
  const b = new TokkuBrain(ch, ui, { homeX: 1100 });
  const run = async (sec, speed = 1) => { for (let i = 0; i < sec * 60; i++) { ch.update(1 / 60); b.tick(1000 / 60 * speed); await new Promise(r => setImmediate(r)); } };
  return { ch, b, said, run };
}
const states = b => b.log.map(e => e.ev);
(async () => {
  // 1. focus -> break -> focus
  { const { ch, b, said, run } = make();
    b.startFocus(); check('1a focus starts', b.state === 'focusing' && b.timer.kind === 'focus');
    await run(2, 60 * 13); check('1b focus end -> attention with break/extend buttons', b.state === 'attention' && said.at(-1).actions.join() === 'break,extend', said.at(-1).text);
    b.choose('break'); await run(1); check('1c break state, rest pose', b.state === 'break' && /^rest_/.test(ch.visual.name));
    await run(1, 60 * 6); check('1d break end -> attention, resume button', b.state === 'attention' && said.at(-1).actions.join() === 'resume', said.at(-1).text);
    await run(3); check('1e stretch then idle rig', ch.visual.type === 'rig');
    b.choose('resume'); check('1f back to focusing', b.state === 'focusing' && b.timer.kind === 'focus');
    const timers = b.log.filter(e => e.ev.startsWith('timer:')).length; const dues = b.log.filter(e => e.ev.startsWith('due:')).length;
    check('1g one timer at a time (no duplicates)', dues === 2 && timers === 3, `timers=${timers} dues=${dues}`);
  }
  // 2. extension
  { const { b, said, run } = make();
    b.startFocus(); await run(2, 60 * 13); b.choose('extend');
    check('2a extend -> focusing with 5 min timer', b.state === 'focusing' && b.timer.kind === 'extend' && Math.round(b.timer.endsAt - b.t) === 300000);
    await run(1, 60 * 6); check('2b extension end -> attention, only break offered', b.state === 'attention' && said.at(-1).actions.join() === 'break', said.at(-1).text);
    check('2c second extend refused', b.choose('extend') === false);
  }
  // 3. meals
  for (const meal of ['breakfast', 'lunch', 'dinner']) {
    const { ch, b, said, run } = make();
    b.startFocus(); await run(0.2); b.startMeal(meal);
    await run(4); check(`3 ${meal}: sleeping pose with curled tail`, b.state === 'meal' && /^sleep_/.test(ch.visual.name) && ch.sleeping);
    check(`3 ${meal}: phone away ping suppressed`, b.awayPingAllowed() === false);
    const n = said.length; await run(2, 60 * 25); check(`3 ${meal}: no focus reminders during meal`, said.slice(n).length === 0 && b.state === 'meal');
    await run(1, 60 * 12); await run(4); check(`3 ${meal}: wake -> stretch -> idle, welcome line`, b.state === 'idle' && ch.visual.type === 'rig' && /back|good/i.test(said.at(-1).text), said.at(-1).text);
    check(`3 ${meal}: away ping allowed again`, b.awayPingAllowed() === true);
  }
  // 5. walking both directions
  { const { ch, b, run } = make();
    b.dragged(500); await run(8); check('5a dragged left -> walks back to corner', Math.abs(ch.x - 1100) < 1 && ch.visual.type === 'rig');
    const p = b.dragged(1250); await run(10); check('5b dragged right -> walks back, annoyed on 2nd drag', Math.abs(ch.x - 1100) < 1 && b.log.some(e => e.ev === 'say:dragged_again'));
  }
  // 7. Quiet mode in every state
  { const { ch, b, said, run } = make();
    b.startFocus(); b.setQuiet(true); const n = said.length;
    await run(2, 60 * 13); check('7a focus ends during quiet: deferred, no bubble', said.length === n && b.pending.includes('focus') && b.state === 'focusing');
    check('7b timer still ran during quiet', b.log.some(e => e.ev === 'due:focus'));
    await run(1); check('7c faces away and dims', ch.yaw === 180 && ch.alphaTarget < 1);
    b.setQuiet(false); await run(2); check('7d quiet off: deferred attention delivered once', b.state === 'attention' && said.length === n + 1, said.at(-1).text);
    b.choose('break'); b.setQuiet(true); await run(1, 60 * 6); check('7e break end during quiet deferred', b.pending.includes('break') && said.length === n + 2);
    b.setQuiet(false); await run(3); check('7f break end delivered after quiet', b.state === 'attention' && /break|ready/i.test(said.at(-1).text), said.at(-1).text);
    b.startMeal('lunch'); await run(4); b.setQuiet(true); await run(1); check('7g meal + quiet: keeps sleeping, dimmed', ch.sleeping && ch.alphaTarget < 1);
    const m = said.length; await run(1, 60 * 61); await run(4); check('7h meal ends in quiet: wakes silently', said.length === m && b.state === 'idle');
    b.setQuiet(false); await run(2); check('7i welcome line after quiet', said.length === m + 1, said.at(-1).text);
    b.setQuiet(true); check('7j task done in quiet: no celebration', b.taskDone() === false);
    b.setVoice(true); b.setQuiet(true); check('7k voice never speaks in quiet', b.say('focus_start') === null);
  }
  // 4. tail moods
  { const { ch, run } = make(); const M = TokkuCharacter.MOODS;
    for (const m of ['calm', 'happy', 'annoyed', 'sleepy']) { ch.setMood(m); await run(2); check('4 tail mood ' + m + ' reached', Math.abs(ch.tailP.base - M[m].base) < 0.5 && Math.abs(ch.tailP.scale - M[m].scale) < 0.02); }
  }
  // 8. task done
  { const { ch, b, run } = make(); b.startFocus(); await run(0.5); b.taskDone(); await run(1);
    check('8 task done: celebrate pose', ['joy_excited', 'joy_jump', 'done_checkmark'].includes(ch.visual.name));
    await run(4); check('8 back to focusing after celebration', b.state === 'focusing');
  }
  // 9. hover buttons: a break I start and end myself
  { const { ch, b, said, run } = make();
    b.startFocus(); await run(0.5);
    check('9a take a break while working: break state and timer', b.startBreak() === true && b.state === 'break' && b.timer.kind === 'break');
    await run(1); check('9b break pose', /^rest_/.test(ch.visual.name));
    check('9c a second break request is refused', b.startBreak() === false);
    check('9d break over: back to focus with a fresh 25 min timer', b.breakOver() === true && b.state === 'focusing' && b.timer.kind === 'focus' && Math.round(b.timer.endsAt - b.t) === 25 * 60000, said.at(-1).text);
    await run(3); check('9e stretches, then idle rig', ch.visual.type === 'rig' && b.state === 'focusing');
    check('9f break over does nothing when not on a break', b.breakOver() === false);
    b.startMeal('lunch'); check('9g no break during a meal', b.startBreak() === false && b.state === 'meal');
  }
  // 10. distraction: video in front
  { const { ch, b, said, run } = make();
    const watch = async (sec, app = 'YouTube') => { for (let i = 0; i < sec; i++) { b.activity('video', app, 1); await run(1 / 60, 60); } };   // 1 s of sim time per step
    b.startFocus(); await run(0.3);
    await watch(40); check('10a no nudge before 45 s', !b.nudging && !b.log.some(e => e.ev.startsWith('nudge')));
    await watch(6); check('10b nudge after 45 s: really? pose, names the app, two buttons', b.nudging && ch.visual.name === 'nudge_shrug' && /YouTube/.test(said.at(-1).text) && said.at(-1).actions.join() === 'bargain', said.at(-1).text);
    b.choose('bargain'); await run(0.5); check('10c five more minutes: open palm, and he stays on watch', ch.visual.name === 'paw_stop' && b.bargaining && b.watching);
    await run(2); check('10d then he looks away', ch.visual.name === 'nudge_ignore');
    await watch(200); check('10e no nudge during the five minutes', !b.nudging);
    await watch(110); check('10f time is up: checks his watch, no buttons', b.nudging && ch.visual.name === 'nudge_watch' && said.at(-1).actions.join() === '', said.at(-1).text);
    b._actionTimeout('bargain_over'); await watch(5); check('10g still watching a minute later: angry idle, on watch', !b.nudging && b.watching && ch.visual.type === 'rig' && ch.face === 'angry');
    await watch(60); check('10i third nudge in 30 min: angry pose, firm line', b.nudging && ch.visual.name === 'annoyed_angry', said.at(-1).text);
    check('10h there is no Back to work button anywhere', !said.some(s => s.actions.includes('backtowork')));
    const n = said.length; b.activity('work', null, 3); await run(0.5);
    check('10j video closed: bubble gone, thumbs up, kind line, watch ends', !b.nudging && !b.watching && said.length === n + 1 && ch.visual.name === 'thanks_thumbs', said.at(-1).text);
    await run(3); check('10k back on the smiling idle rig, still focusing', ch.visual.type === 'rig' && ch.face === 'normal' && b.state === 'focusing');
  }
  { const { ch, b, said, run } = make();      // ignoring him: he never goes back to the smiling idle while the video is open
    const watch = async (sec) => { for (let i = 0; i < sec; i++) { b.activity('video', 'Hotstar', 1); await run(1 / 60, 60); } };
    b.startFocus(); await run(0.3); await watch(50);
    b._actionTimeout('nudge_gentle'); await watch(5);
    check('10n ignored nudge: the angry idle, not the smiling one', !b.nudging && b.watching && ch.visual.type === 'rig' && ch.face === 'angry');
    await watch(60); check('10o asks again after a minute, naming the app', b.nudging && /Hotstar/.test(said.at(-1).text) && !b.blocked, said.at(-1).text);
    b._actionTimeout('nudge_gentle'); check('10p ignored twice: he goes to the middle of the screen', b.blocked === true);
    b.activity('work', null, 3); check('10q video closed: he may go home again', b.blocked === false && b.ignored === 0);
  }
  { const { b, said, run } = make();
    const watch = async (sec) => { for (let i = 0; i < sec; i++) { b.activity('video', 'Netflix', 1); await run(1 / 60, 60); } };
    b.startFocus(); b.startMeal('dinner'); const n = said.length; await watch(120);
    check('10l no nudge during a meal', !b.nudging && said.length === n);
  }
  { const { b, said, run } = make();
    const watch = async (sec) => { for (let i = 0; i < sec; i++) { b.activity('game', 'Steam', 1); await run(1 / 60, 60); } };
    b.startFocus(); b.setQuiet(true); const n = said.length; await watch(120);
    check('10m no nudge in Quiet mode', !b.nudging && said.length === n);
  }
  console.log(results.join('\n')); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
