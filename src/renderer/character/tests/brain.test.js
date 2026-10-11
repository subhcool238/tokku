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
    b.choose('break'); await run(1); check('1c break state, rest pose', b.state === 'break' && ch.visual.name === 'calm_curled_tail');
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
    await run(4); check(`3 ${meal}: sleeping pose with curled tail`, b.state === 'meal' && ch.visual.name === 'sleep_curl' && ch.sleeping);
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
    check('8 task done: celebrate pose', ['celebrate', 'jump_happy'].includes(ch.visual.name));
    await run(4); check('8 back to focusing after celebration', b.state === 'focusing');
  }
  console.log(results.join('\n')); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
