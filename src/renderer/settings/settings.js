/* Settings window: which page to show comes from the address (#notion, #pin, #quit). */
(async function () {
  const $ = (id) => document.getElementById(id), api = window.settings;
  const page = (location.hash || '#notion').slice(1);
  $('page-' + page).hidden = false;
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => api.close()));
  const say = (el, text, good) => { el.textContent = text; el.className = 'msg ' + (good ? 'good' : 'bad'); };
  const digits = (el) => el.addEventListener('input', () => { el.value = el.value.replace(/\D/g, ''); });

  if (page === 'notion') {
    const msg = $('notion-msg');
    const show = (s) => {
      $('notion-off').hidden = !s.connected;
      if (s.connected && s.error) say(msg, 'Saved, but the last check failed: ' + s.error, false);
      else if (s.connected) say(msg, 'Connected' + (s.dbName ? ' to "' + s.dbName + '"' : '') + '. ' + s.count + ' open tasks' + (s.top ? '. Most urgent: ' + s.top : '.'), true);
    };
    show(await api.notionStatus());
    $('notion-save').addEventListener('click', async () => {
      $('notion-save').disabled = true; say(msg, 'Checking with Notion...', true);
      const r = await api.notionSave($('notion-token').value.trim(), $('notion-db').value.trim());
      $('notion-save').disabled = false;
      if (!r.ok) return say(msg, r.error, false);
      $('notion-token').value = ''; show(r);
    });
    $('notion-off').addEventListener('click', async () => { await api.notionDisconnect(); $('notion-off').hidden = true; say(msg, 'Disconnected. The token was deleted from this PC.', true); });
  }

  if (page === 'pin') {
    const msg = $('pin-msg'), st = await api.pinStatus();
    $('pin-current-row').hidden = !st.set;
    ['pin-current', 'pin-new', 'pin-again'].forEach(id => digits($(id)));
    const showPartner = (t) => { $('partner-none').hidden = !!t; $('partner-has').hidden = !t; if (t) $('partner-topic').value = t; };
    showPartner((await api.partnerTopic(false)).topic);
    $('partner-make').addEventListener('click', async () => showPartner((await api.partnerTopic(true)).topic));
    $('partner-topic').addEventListener('focus', (e) => e.target.select());
    $('pin-save').addEventListener('click', async () => {
      const a = $('pin-new').value, b = $('pin-again').value;
      if (!/^\d{4,6}$/.test(a)) return say(msg, 'The PIN must be 4 to 6 digits.', false);
      if (a !== b) return say(msg, 'The two PINs are not the same.', false);
      const r = await api.pinSet(a, $('pin-current').value);
      if (!r.ok) return say(msg, r.error, false);
      ['pin-current', 'pin-new', 'pin-again'].forEach(id => { $(id).value = ''; });
      say(msg, 'PIN saved. Tokku now asks for it before he can be turned off.', true);
    });
  }

  if (page === 'quit') {
    const msg = $('quit-msg');
    digits($('quit-pin'));
    const go = async () => { const r = await api.quit($('quit-pin').value); if (!r.ok) { $('quit-pin').value = ''; say(msg, r.error, false); } };
    $('quit-go').addEventListener('click', go);
    $('quit-ask').hidden = !(await api.canAsk()).can;
    $('quit-ask').addEventListener('click', async () => {
      $('quit-ask').disabled = true;
      const r = await api.askUnlock();
      say(msg, r.ok ? 'Your partner has been asked. Wait for the PIN.' : r.error, r.ok);
      if (!r.ok) $('quit-ask').disabled = false;
    });
    $('quit-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });

    // emergency exit: hold for 30 seconds (Guard measures the time too), then a reason
    const HOLD_MS = 30000; let t0 = 0, raf = 0;
    const stop = () => { if (!t0) return; t0 = 0; cancelAnimationFrame(raf); api.emergencyStop(); $('hold-fill').style.width = '0'; $('hold-text').textContent = 'Hold for 30 seconds'; };
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / HOLD_MS);
      $('hold-fill').style.width = (k * 100) + '%'; $('hold-text').textContent = 'Keep holding: ' + Math.ceil((1 - k) * 30) + ' s';
      if (k >= 1) { t0 = 0; $('hold').hidden = true; $('reason-box').hidden = false; $('reason').focus(); return; }
      raf = requestAnimationFrame(tick);
    };
    $('hold').addEventListener('mousedown', () => { t0 = performance.now(); api.emergencyStart(); tick(); });
    ['mouseup', 'mouseleave', 'blur'].forEach(ev => $('hold').addEventListener(ev, stop));
    $('reason-go').addEventListener('click', async () => {
      const r = await api.emergencyQuit($('reason').value.trim());
      if (!r.ok) say(msg, r.error, false);
    });
  }
})();
