/* ------------------------------------------------------------------ *
 *  Visitor comments (Supabase). Off until config.js is filled in.
 *  - Anyone can leave a comment, with a name if they like.
 *  - A comment only shows once the owner approves it.
 *  - The owner approves / deletes from "Comments" in the top bar,
 *    using a moderation passphrase kept in their own browser.
 * ------------------------------------------------------------------ */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { access } from './gate.js';
import { askSecret } from './ask.js';

const ON = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const owner = access === 'owner';
const $ = (id) => document.getElementById(id);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
const LS_KEY = 'designOrbit.modKey';
const LS_NAME = 'designOrbit.commentName';
const LS_LAST = 'designOrbit.commentAt';
const LS_SENT = 'designOrbit.commentsSent';   // this visitor's comments still waiting for approval

/* quick replies: one tap starts a comment (people can still change it) */
const CHIPS = ['Love the colours', 'Great type', 'Clever layout', 'So clean', 'Saving this', 'Where is this from?'];

const sentList = () => { try { return JSON.parse(ls.get(LS_SENT) || '[]'); } catch { return []; } };
const keepSent = (list) => ls.set(LS_SENT, JSON.stringify(list.filter((c) => Date.now() - Date.parse(c.at) < 14 * 864e5).slice(-30)));

const keyOf = (e) => e.id || `${e.date}|${e.title}`;   // permanent id: survives title/date edits
const current = () => { const st = window.orbit?.state; return st && st.current >= 0 ? st.entries[st.current] : null; };
const when = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

async function api(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `error ${res.status}`;
    try { msg = (await res.json()).message || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.status === 204 || method === 'POST' && prefer === 'return=minimal' ? null : res.json().catch(() => null);
}

/* ---------- comments on the open panel ---------- */
const listEl = $('vcomments');
const form = $('v-form');
const note = $('v-note');
let loadId = 0;

const row = (c, { mine = false } = {}) => `
      <li class="${mine ? 'pending' : ''}">
        <time datetime="${esc(c.created_at)}"><b>${esc(c.name || 'Anonymous')}</b>${mine ? '<span class="wait-tag">Waiting for approval</span>' : ''} · ${esc(when(c.created_at))}</time>
        <p>${esc(c.body)}</p>
        ${owner && !mine ? `<button type="button" class="x" data-del="${esc(c.id)}" aria-label="Delete comment">×</button>` : ''}
      </li>`;

function updateCount() {
  const n = $('comments').children.length + listEl.querySelectorAll('li:not(.pending)').length;
  $('c-count').textContent = n ? String(n) : '';
  $('v-invite').textContent = n ? 'Join the conversation.' : 'Be the first to comment on this one.';
}

async function load() {
  const e = current();
  if (!ON || !e) return;
  const id = ++loadId;
  $('comments-sec').hidden = false;
  form.hidden = owner;
  note.hidden = true;
  listEl.innerHTML = '';
  setChips();
  let rows = [];
  try {
    rows = await api(`comments?entry=eq.${encodeURIComponent(keyOf(e))}&approved=is.true&select=id,name,body,created_at&order=created_at.asc`) || [];
  } catch { /* comments are a nicety: stay quiet if the service is unreachable */ }
  if (id !== loadId) return;
  // this visitor's own comments that haven't been approved yet: shown only to them, marked as waiting
  const approved = new Set(rows.map((r) => r.body));
  const all = sentList();
  const mine = owner ? [] : all.filter((c) => c.entry === keyOf(e) && !approved.has(c.body));
  keepSent(all.filter((c) => !(c.entry === keyOf(e) && approved.has(c.body))));
  listEl.innerHTML = rows.map((c) => row(c)).join('') + mine.map((c) => row({ ...c, created_at: c.at }, { mine: true })).join('');
  updateCount();
  $('comments-sec').hidden = false;
}

/* ---------- the comment box: small until you use it ---------- */
const textEl = $('v-text');
const postBtn = $('v-post');
const nameEl = $('v-name');
function grow() { textEl.style.height = 'auto'; textEl.style.height = `${Math.min(textEl.scrollHeight, 180)}px`; }
function sync() {
  postBtn.disabled = !textEl.value.trim();
  form.classList.toggle('open', form.classList.contains('open') || document.activeElement === textEl || !!textEl.value);
  const n = nameEl.value.trim();
  $('v-avatar').classList.toggle('named', !!n);
  if (n) $('v-avatar').textContent = n[0].toUpperCase();
  else if (!$('v-avatar').querySelector('svg')) $('v-avatar').innerHTML = AVATAR;
}
const AVATAR = $('v-avatar')?.innerHTML || '';
function setChips() {
  const e = current();
  // a keyword of this panel makes one chip feel specific to it
  const kw = (e?.keywords || e?.tags || [])[0];
  const chips = [...CHIPS];
  if (kw) chips.splice(2, 0, `Nice ${String(kw).toLowerCase()}`);
  $('v-chips').innerHTML = chips.slice(0, 6).map((t) => `<button type="button" class="v-chip">${esc(t)}</button>`).join('');
}
$('v-chips')?.addEventListener('click', (ev) => {
  const b = ev.target.closest('.v-chip');
  if (!b) return;
  const t = b.textContent;
  textEl.value = textEl.value.trim() ? `${textEl.value.trim()} ${t}` : t;
  form.classList.add('open');
  textEl.focus();
  textEl.setSelectionRange(textEl.value.length, textEl.value.length);
  grow(); sync();
});
textEl?.addEventListener('focus', () => { form.classList.add('open'); sync(); });
textEl?.addEventListener('input', () => { grow(); sync(); note.hidden = true; });
nameEl?.addEventListener('input', sync);
textEl?.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); form.requestSubmit(); }
});
window.addEventListener('orbit:close', () => { form.classList.remove('open'); });

function say(msg, bad = false) {
  note.textContent = msg;
  note.classList.toggle('bad', bad);
  note.hidden = false;
}

form?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const e = current();
  const text = $('v-text').value.trim();
  const name = $('v-name').value.trim().slice(0, 40);
  if (!e) return;
  if (!text) { say('Write a comment first.', true); $('v-text').focus(); return; }
  if (Date.now() - Number(ls.get(LS_LAST) || 0) < 20000) { say('Give it a few seconds before posting again.', true); return; }
  const btn = postBtn;
  btn.disabled = true;
  btn.textContent = 'Posting…';
  try {
    // "website" is a trap for bots: people never see it, so if it's filled we quietly drop the comment
    if (!$('v-website').value) {
      await api('comments', { method: 'POST', prefer: 'return=minimal', body: { entry: keyOf(e), name: name || null, body: text.slice(0, 1000) } });
    }
    ls.set(LS_LAST, String(Date.now()));
    if (name) ls.set(LS_NAME, name); else ls.del(LS_NAME);
    const at = new Date().toISOString();
    keepSent([...sentList(), { entry: keyOf(e), name: name || null, body: text.slice(0, 1000), at }]);
    // show it straight away, marked as waiting, so it doesn't feel like it disappeared
    listEl.insertAdjacentHTML('beforeend', row({ name, body: text, created_at: at }, { mine: true }));
    textEl.value = '';
    form.classList.remove('open');
    grow();
    say(`Thanks${name ? `, ${name}` : ''}! Your comment is in. Everyone will see it once Arthur approves it.`);
  } catch (err) {
    say(`Couldn’t post that: ${err.message}`, true);
  } finally {
    btn.textContent = 'Post';
    sync();
  }
});
for (const id of ['v-text', 'v-name']) $(id)?.addEventListener('keydown', (ev) => ev.stopPropagation());

listEl?.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-del]');
  if (!b || !window.confirm('Delete this visitor comment?')) return;
  if (await moderate(b.dataset.del, 'delete')) load();
});

/* ---------- owner: approve / delete ---------- */
const modBtn = $('mod-open');
const mod = $('mod');
const modList = $('mod-list');
let pending = [];

async function getKey(ask) {
  let k = ls.get(LS_KEY);
  if (!k && ask) {
    const v = await askSecret({
      title: 'Approve comments',
      help: 'Enter the moderation passphrase you set in the Supabase setup.',
      fields: [{ label: 'Passphrase' }],
      submit: 'Continue',
    });
    k = v ? v[0] : '';
    if (k) ls.set(LS_KEY, k);
  }
  return k;
}

async function rpc(fn, args, ask = true) {
  const secret = await getKey(ask);
  if (!secret) return null;
  try {
    return (await api(`rpc/${fn}`, { method: 'POST', body: { secret, ...args } })) ?? true;
  } catch (err) {
    if (/passphrase/i.test(err.message)) { ls.del(LS_KEY); $('mod-status').textContent = 'That passphrase was wrong. Click Comments to try again.'; }
    else $('mod-status').textContent = `Couldn’t reach comments: ${err.message}`;
    return null;
  }
}

async function refreshPending(ask = false) {
  const rows = await rpc('pending_comments', {}, ask);
  if (!Array.isArray(rows)) { modBtn.textContent = 'Comments'; return; }
  pending = rows;
  modBtn.innerHTML = rows.length ? `Comments <b>${rows.length}</b>` : 'Comments';
  $('mod-status').textContent = rows.length ? '' : 'No comments waiting.';
  modList.innerHTML = rows.map((c) => `
    <li>
      <p class="mod-where">${esc(c.entry.split('|').slice(1).join('|'))}</p>
      <time><b>${esc(c.name || 'Anonymous')}</b> · ${esc(when(c.created_at))}</time>
      <p>${esc(c.body)}</p>
      <div class="mod-actions">
        <button type="button" class="primary" data-act="approve" data-id="${esc(c.id)}">Approve</button>
        <button type="button" data-act="delete" data-id="${esc(c.id)}">Delete</button>
      </div>
    </li>`).join('');
}

async function moderate(id, action) {
  const ok = await rpc('moderate_comment', { comment_id: id, action });
  return !!ok;
}

if (ON && owner) {
  modBtn.hidden = false;
  modBtn.addEventListener('click', async () => {
    mod.hidden = !mod.hidden;
    if (!mod.hidden) await refreshPending(true);
  });
  $('mod-close').addEventListener('click', () => { mod.hidden = true; });
  modList.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    b.disabled = true;
    if (await moderate(b.dataset.id, b.dataset.act)) { await refreshPending(); if (current()) load(); }
    else b.disabled = false;
  });
  refreshPending(false);   // quiet count on load, only if the passphrase is already saved
}

if (ON) {
  if ($('v-name') && ls.get(LS_NAME)) $('v-name').value = ls.get(LS_NAME);
  sync();
  window.addEventListener('orbit:open', () => requestAnimationFrame(load));
}
