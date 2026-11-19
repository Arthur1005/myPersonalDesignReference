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
        ${editMode ? `<button type="button" class="x" data-del-link="${i}" aria-label="Remove link">×</button>` : ''}
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
  if (links.some((l) => l.url === url)) { err.textContent = 'That link is already here.'; err.hidden = false; return; }
  patch(e, 'links', [...links, { type: $('link-type').value, url }]);
  $('link-url').value = '';
  renderLinks();
});
$('link-url').addEventListener('input', () => { $('link-error').hidden = true; });
$('links').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-del-link]');
  if (!b) return;
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
        <time datetime="${esc(c.at)}"><b>Arthur</b> · ${esc(fmtTime(c.at))}</time>
        <p>${esc(c.text)}</p>
        ${editMode ? `<button type="button" class="x" data-del-comment="${i}" aria-label="Delete comment">×</button>` : ''}
      </li>`).join('')
    : '';
  show('comments-sec', list.length > 0);
}

function postComment() {
  const text = $('comment-text').value.trim();
  if (!text) { $('comment-text').focus(); return; }
  const e = entry();
  patch(e, 'comments', [...(e.comments || []), { at: new Date().toISOString(), text }]);
  $('comment-text').value = '';
  renderComments();
}
$('comment-form').addEventListener('submit', (ev) => { ev.preventDefault(); postComment(); });
$('comment-text').addEventListener('keydown', (ev) => {
  ev.stopPropagation(); // keep arrows/Esc from driving the globe
  if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); postComment(); }
});
$('comments').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-del-comment]');
  if (!b) return;
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

/* ---------- wiring ---------- */
for (const id of ['link-url', 'link-type']) $(id).addEventListener('keydown', (ev) => ev.stopPropagation());

function renderAll() {
  if (!entry()) return;
  $('link-error').hidden = true;
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
