/* ------------------------------------------------------------------ *
 *  Card details: credit, links
 *  and comments. Visible to everyone; editable by the owner (PIN).
 * ------------------------------------------------------------------ */
import { editMode, patch, whenReady, esc } from './store.js';

const $ = (id) => document.getElementById(id);
let entries = [];
let current = -1;

const entry = () => entries[current];
const linksOf = (e) => e.links || (e.link ? [{ type: 'source', url: e.link }] : []);

function show(sectionId, hasContent) {
  $(sectionId).hidden = !editMode && !hasContent;
}

/* ---------- links ---------- */
const TYPE_LABEL = { website: 'Website', image: 'Image', source: 'Source' };

function normaliseUrl(raw) {
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.href;
  } catch { return null; }
}
function hostOf(url) {
  try { const u = new URL(url); return (u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname : '')).replace(/\/$/, ''); }
  catch { return url; }
}

function renderLinks() {
  const e = entry();
  const links = linksOf(e);
  $('links').innerHTML = links.length
    ? links.map((l, i) => `
      <li>
        <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" title="${esc(l.url)}">
          <span class="type ${esc(l.type)}">${esc(TYPE_LABEL[l.type] || l.type)}</span>
          <span class="host">${esc(hostOf(l.url))}</span>
        </a>
        ${editMode ? `<button type="button" class="ed" data-edit-link="${i}" aria-label="Edit link">Edit</button><button type="button" class="x" data-del-link="${i}" aria-label="Remove link">×</button>` : ''}
      </li>`).join('')
    : '';
  show('links-sec', links.length > 0);
}

$('link-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const url = normaliseUrl($('link-url').value);
  const err = $('link-error');
  if (!url) {
    err.textContent = $('link-url').value.trim() ? 'That doesn’t look like a web address.' : 'Paste a link first.';
    err.hidden = false;
    return;
  }
  const e = entry();
  const links = linksOf(e);
  if (links.some((l, i) => l.url === url && i !== editingLink)) { err.textContent = 'That link is already here.'; err.hidden = false; return; }
  const item = { type: $('link-type').value, url };
  if (editingLink >= 0) links[editingLink] = item; else links.push(item);
  patch(e, 'links', [...links]);
  resetLinkForm();
  renderLinks();
});
$('link-url').addEventListener('input', () => { $('link-error').hidden = true; });
$('links').addEventListener('click', (ev) => {
  const ed = ev.target.closest('[data-edit-link]');
  if (ed) {
    const l = linksOf(entry())[Number(ed.dataset.editLink)];
    if (!l) return;
    editingLink = Number(ed.dataset.editLink);
    $('link-type').value = l.type in TYPE_LABEL ? l.type : 'source';
    $('link-url').value = l.url;
    $('link-form').querySelector('button[type=submit]').textContent = 'Update';
    $('link-url').focus();
    return;
  }
  const b = ev.target.closest('[data-del-link]');
  if (!b) return;
  if (Number(b.dataset.delLink) === editingLink) resetLinkForm();
  const e = entry();
  const links = linksOf(e).filter((_, i) => i !== Number(b.dataset.delLink));
  patch(e, 'links', links);
  renderLinks();
});

/* ---------- comments ---------- */
function fmtTime(isoStr) {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function renderComments() {
  const e = entry();
  const list = e.comments || [];
  $('comments').innerHTML = list.length
    ? list.map((c, i) => `
      <li>
        <time datetime="${esc(c.at)}"><b>Arthur</b><span class="owner-tag">Owner</span> · ${esc(fmtTime(c.at))}</time>
        <p>${esc(c.text)}</p>
        ${editMode ? `<button type="button" class="ed" data-edit-comment="${i}" aria-label="Edit comment">Edit</button><button type="button" class="x" data-del-comment="${i}" aria-label="Delete comment">×</button>` : ''}
      </li>`).join('')
    : '';
  show('comments-sec', list.length > 0);
}

function postComment() {
  const text = $('comment-text').value.trim();
  if (!text) { $('comment-text').focus(); return; }
  const e = entry();
  const list = [...(e.comments || [])];
  if (editingComment >= 0 && list[editingComment]) list[editingComment] = { ...list[editingComment], text, edited: new Date().toISOString() };
  else list.push({ at: new Date().toISOString(), text });
  patch(e, 'comments', list);
  resetCommentForm();
  renderComments();
}
$('comment-form').addEventListener('submit', (ev) => { ev.preventDefault(); postComment(); });
$('comment-text').addEventListener('keydown', (ev) => {
  ev.stopPropagation(); // keep arrows/Esc from driving the globe
  if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); postComment(); }
});
$('comments').addEventListener('click', (ev) => {
  const ed = ev.target.closest('[data-edit-comment]');
  if (ed) {
    const c = (entry().comments || [])[Number(ed.dataset.editComment)];
    if (!c) return;
    editingComment = Number(ed.dataset.editComment);
    $('comment-text').value = c.text;
    $('comment-form').querySelector('button[type=submit]').textContent = 'Update';
    $('comment-text').focus();
    return;
  }
  const b = ev.target.closest('[data-del-comment]');
  if (!b) return;
  if (Number(b.dataset.delComment) === editingComment) resetCommentForm();
  if (!window.confirm('Delete this comment?')) return;
  const e = entry();
  patch(e, 'comments', e.comments.filter((_, i) => i !== Number(b.dataset.delComment)));
  renderComments();
});

/* ---------- author credit ---------- */
function renderCredit() {
  const e = entry();
  const name = e.author || '';
  const url = e.authorUrl || '';
  const p = $('p-credit');
  if (!name && !url) { p.hidden = true; p.innerHTML = ''; }
  else {
    p.hidden = false;
    const label = esc(name || hostOf(url));
    p.innerHTML = 'By ' + (url
      ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label} <span aria-hidden="true">↗</span></a>`
      : `<span>${label}</span>`);
  }
  // owner edits it in place; hide the read-only line then
  if (editMode) {
    p.hidden = true;
    $('credit-name').value = name;
    $('credit-url').value = url;
    $('credit-saved').textContent = '';
  }
}
let creditTimer = 0;
function saveCredit() {
  const e = entry();
  if (!e) return;
  const name = $('credit-name').value.trim();
  const raw = $('credit-url').value.trim();
  const url = raw ? normaliseUrl(raw) : '';
  if (raw && !url) { $('credit-saved').textContent = 'That link doesn’t look right'; return; }
  if (name === (e.author || '') && url === (e.authorUrl || '')) return;
  patch(e, 'author', name || null);
  patch(e, 'authorUrl', url || null);
  if (url && $('credit-url').value !== url) $('credit-url').value = url;
  $('credit-saved').textContent = 'Saved as a draft';
}
for (const id of ['credit-name', 'credit-url']) {
  $(id).addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') { ev.preventDefault(); saveCredit(); ev.target.blur(); } });
  $(id).addEventListener('input', () => { clearTimeout(creditTimer); $('credit-saved').textContent = ''; creditTimer = setTimeout(saveCredit, 900); });
  $(id).addEventListener('blur', () => { clearTimeout(creditTimer); saveCredit(); });
}
$('credit-form').addEventListener('submit', (ev) => { ev.preventDefault(); saveCredit(); });

/* ---------- title, note and date: edited in place by the owner ---------- */
const titleEl = $('p-title');
const noteEl = $('p-note');
const plain = (() => { const t = document.createElement('div'); t.contentEditable = 'plaintext-only'; return t.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true'; })();
const textOf = (el) => el.innerText.replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
function flash(msg) { $('credit-saved').textContent = msg; clearTimeout(flash.t); flash.t = setTimeout(() => { $('credit-saved').textContent = ''; }, 2500); }

function renderText() {
  const e = entry();
  if (!editMode) return;
  for (const [el, label] of [[titleEl, 'Title'], [noteEl, 'Why it inspired you']]) {
    el.contentEditable = plain;
    el.spellcheck = true;
    el.dataset.placeholder = label + '…';
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-label', label);
  }
  titleEl.textContent = e.title || '';
  noteEl.textContent = e.note || '';
  $('edit-date').value = e.date || '';
}

function saveTitle() {
  const e = entry();
  if (!e) return;
  const t = textOf(titleEl).replace(/\s+/g, ' ').slice(0, 80);
  if (!t) { titleEl.textContent = e.title; flash('A panel needs a title'); return; }
  if (t === e.title) return;
  patch(e, 'title', t);
  flash('Title saved as a draft');
}
let noteTimer = 0;
function saveNote() {
  const e = entry();
  if (!e) return;
  const t = textOf(noteEl).slice(0, 2000);
  if (t === (e.note || '')) return;
  patch(e, 'note', t || null);
  flash('Note saved as a draft');
}

titleEl.addEventListener('keydown', (ev) => {
  if (!editMode) return;
  ev.stopPropagation();                               // typing never drives the globe or flips panels
  if (ev.key === 'Enter') { ev.preventDefault(); titleEl.blur(); }
  if (ev.key === 'Escape') { titleEl.textContent = entry()?.title || ''; titleEl.blur(); }
});
titleEl.addEventListener('blur', () => { if (editMode) saveTitle(); });
noteEl.addEventListener('keydown', (ev) => {
  if (!editMode) return;
  ev.stopPropagation();
  if (ev.key === 'Escape') { noteEl.textContent = entry()?.note || ''; noteEl.blur(); }
});
noteEl.addEventListener('input', () => { clearTimeout(noteTimer); noteTimer = setTimeout(saveNote, 900); });
noteEl.addEventListener('blur', () => { if (editMode) { clearTimeout(noteTimer); saveNote(); } });
// pasting formatted text keeps only the words
for (const el of [titleEl, noteEl]) {
  el.addEventListener('paste', (ev) => {
    if (!editMode) return;
    ev.preventDefault();
    document.execCommand('insertText', false, ev.clipboardData.getData('text/plain'));
  });
}

$('edit-date').addEventListener('change', () => {
  const e = entry();
  const v = $('edit-date').value;
  if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v === e.date) return;
  patch(e, 'date', v);
  const d = new Date(v + 'T00:00:00');
  const day = $('p-day').textContent.split(' · ')[0];
  $('p-day').textContent = `${day} · ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  window.dispatchEvent(new CustomEvent('orbit:entries'));   // calendar and streak pick up the new date
  flash('Date saved as a draft · the order on the globe updates after saving');
});
$('edit-date').addEventListener('keydown', (ev) => ev.stopPropagation());

/* ---------- edit a link or one of your comments (loads it back into its box) ---------- */
let editingLink = -1;
let editingComment = -1;
function resetLinkForm() { editingLink = -1; $('link-form').querySelector('button[type=submit]').textContent = 'Add'; $('link-url').value = ''; }
function resetCommentForm() { editingComment = -1; $('comment-form').querySelector('button[type=submit]').textContent = 'Post'; $('comment-text').value = ''; }

/* ---------- wiring ---------- */
for (const id of ['link-url', 'link-type']) $(id).addEventListener('keydown', (ev) => ev.stopPropagation());

function renderAll() {
  if (!entry()) return;
  $('link-error').hidden = true;
  if (editMode) { resetLinkForm(); resetCommentForm(); }
  renderText();
  renderCredit();
  renderLinks();
  renderComments();
}
whenReady((list) => {
  entries = list;
  if (window.orbit.state.current >= 0) { current = window.orbit.state.current; renderAll(); }
});
window.addEventListener('orbit:open', (ev) => { current = ev.detail.dayIndex; if (entries.length) renderAll(); });
window.addEventListener('orbit:close', () => { current = -1; });
