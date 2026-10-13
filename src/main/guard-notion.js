/* Notion link. Runs in the main process only. Read only: it looks at the task database, it never writes.
   - The token and the cached task titles are stored encrypted with Electron safeStorage (Windows DPAPI)
     in the user's app data folder, never in the project folder and never in git.
   - The only address this file may talk to is https://api.notion.com.
   - Property names follow the brief: Task (title), Due (date), Kanban Status (select or status), Priority. */
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const HOST = 'api.notion.com';
const DONE = 'done';
const file = () => path.join(app.getPath('userData'), 'notion-link.json');

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(file(), 'utf8'));
    const open = (v) => (v ? safeStorage.decryptString(Buffer.from(v, 'base64')) : null);
    return { token: open(j.token), database: j.database || null, cache: j.cache ? JSON.parse(open(j.cache)) : null };
  } catch { return { token: null, database: null, cache: null }; }
}
function save(s) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows encryption is not available');
  const seal = (v) => (v ? safeStorage.encryptString(v).toString('base64') : null);
  fs.writeFileSync(file(), JSON.stringify({ token: seal(s.token), database: s.database, cache: s.cache ? seal(JSON.stringify(s.cache)) : null }));
}

// Accepts a database link or a bare id and returns the 32 character id, or null.
function databaseId(text) {
  const clean = String(text || '').split('?')[0].replace(/-/g, '');
  const m = clean.match(/[0-9a-f]{32}/gi);
  return m ? m[m.length - 1].toLowerCase() : null;
}

function call(token, method, pathname, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({ host: HOST, path: pathname, method, timeout: 12000,
      headers: Object.assign({ Authorization: 'Bearer ' + token, 'Notion-Version': '2022-06-28' }, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
      (res) => { let out = ''; res.setEncoding('utf8'); res.on('data', c => { out += c; }); res.on('end', () => {
        let json = null; try { json = JSON.parse(out); } catch { /* not json */ }
        resolve(res.statusCode === 200 && json ? { ok: true, json } : { ok: false, status: res.statusCode, error: plain(res.statusCode, json) });
      }); });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', (err) => resolve({ ok: false, status: 0, error: 'No connection to Notion (' + err.message + ').' }));
    req.end(data);
  });
}
function plain(status, json) {
  if (status === 401) return 'Notion did not accept the token. Copy it again from your integration page.';
  if (status === 404) return 'Notion cannot see that database. Open the database in Notion, choose Connections, and add your integration.';
  if (status === 429) return 'Notion is busy. Tokku will try again shortly.';
  return 'Notion answered with an error (' + status + (json && json.message ? ': ' + json.message : '') + ').';
}

// ---- reading a page (pure functions, tested without Notion) ----
function schemaOf(database) {
  const props = database.properties || {}, names = Object.keys(props);
  const pick = (want, types) => names.find(n => n.toLowerCase() === want && types.includes(props[n].type)) || names.find(n => types.includes(props[n].type)) || null;
  const status = pick('kanban status', ['status', 'select']);
  return { title: names.find(n => props[n].type === 'title') || null, status, statusType: status ? props[status].type : null,
    due: names.find(n => n.toLowerCase() === 'due' && props[n].type === 'date') || names.find(n => props[n].type === 'date') || null };
}
function taskOf(page, sc) {
  const p = page.properties || {};
  const title = sc.title && p[sc.title] ? (p[sc.title].title || []).map(t => t.plain_text).join('').trim() : '';
  const st = sc.status && p[sc.status] ? p[sc.status][sc.statusType] : null;
  const due = sc.due && p[sc.due] && p[sc.due].date ? p[sc.due].date.start : null;
  return { id: page.id, title, status: st ? st.name : '', due };
}
const isDone = (t) => t.status.trim().toLowerCase() === DONE;
// Open tasks, most urgent first: earliest due date, tasks without a date last.
function openTasks(pages, sc) {
  return pages.map(p => taskOf(p, sc)).filter(t => t.title && !isDone(t))
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
}

// ---- finding the tasks database when the link given was a page (for example the home page of a template) ----
// Scores every database the integration can see: a name with "task" in it, a status column and a date column.
function pickTasksDatabase(databases) {
  const scored = databases.map((d) => {
    const name = (d.title || []).map(t => t.plain_text).join('').trim(), sc = schemaOf(d), n = name.toLowerCase();
    const score = (/all tasks/.test(n) ? 6 : /task/.test(n) ? 4 : /to.?do/.test(n) ? 2 : 0) + (sc.status ? 2 : 0) + (sc.due ? 1 : 0)
      + (Object.keys(d.properties || {}).some(k => k.toLowerCase() === 'kanban status') ? 3 : 0);
    return { id: String(d.id).replace(/-/g, ''), name, score, usable: !!sc.title };
  }).filter(d => d.usable && d.score >= 4).sort((a, b) => b.score - a.score);
  return scored[0] || null;
}
async function findTasksDatabase(token) {
  const r = await call(token, 'POST', '/v1/search', { filter: { property: 'object', value: 'database' }, page_size: 100 });
  if (!r.ok) return r;
  const best = pickTasksDatabase(r.json.results || []);
  return best ? { ok: true, id: best.id, name: best.name }
    : { ok: false, error: 'That link is a page, and Tokku found no tasks database under it. Open your tasks database as a full page and copy that link.' };
}

// ---- one look at Notion ----
async function fetchTasks(token, database) {
  const db = await call(token, 'GET', '/v1/databases/' + database);
  if (!db.ok) return db;
  const sc = schemaOf(db.json);
  if (!sc.title) return { ok: false, error: 'That database has no title column.' };
  const body = { page_size: 100 };
  if (sc.status) body.filter = { property: sc.status, [sc.statusType]: { does_not_equal: 'Done' } };
  if (sc.due) body.sorts = [{ property: sc.due, direction: 'ascending' }];
  const q = await call(token, 'POST', '/v1/databases/' + database + '/query', body);
  if (!q.ok) return q;
  return { ok: true, schema: sc, tasks: openTasks(q.json.results || [], sc) };
}
async function isTaskDone(token, id, sc) {
  const r = await call(token, 'GET', '/v1/pages/' + id);
  return r.ok && !r.json.archived && isDone(taskOf(r.json, sc));
}

/* Polls Notion and reports through onUpdate({ top, next, count, doneTitle, offline }).
   A task counts as done when the task that was on top is no longer open and its page says Done. */
function start(getLink, everySec, onUpdate) {
  let top = null, timer = null, busy = false;
  async function poll() {
    const link = getLink();
    if (busy || !link.token || !link.database) return;
    busy = true;
    try {
      const r = await fetchTasks(link.token, link.database);
      if (!r.ok) { const c = link.cache; onUpdate({ top: c ? c.top : null, next: c ? c.next : null, count: c ? c.count : 0, offline: true, error: r.error }); return; }
      let doneTitle = null;
      if (top && !r.tasks.some(t => t.id === top.id) && await isTaskDone(link.token, top.id, r.schema)) doneTitle = top.title;
      top = r.tasks[0] || null;
      const info = { top: top ? top.title : null, next: r.tasks[1] ? r.tasks[1].title : null, count: r.tasks.length };
      link.cache = info; try { save(link); } catch { /* cache is optional */ }
      onUpdate(Object.assign({ doneTitle, offline: false }, info));
    } finally { busy = false; }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(async () => { await poll(); schedule(); }, everySec() * 1000); };
  poll().then(schedule);
  return { now: poll };
}

module.exports = { load, save, databaseId, fetchTasks, findTasksDatabase, pickTasksDatabase, start, schemaOf, taskOf, openTasks };
