/* ------------------------------------------------------------------ *
 *  Card details: links, similar projects (images from your device),
 *  and comments. Visible to everyone; editable by the owner (PIN).
 * ------------------------------------------------------------------ */
import { editMode, patch, whenReady, esc, srcFor, isPending, stageUpload, unstageUpload } from './store.js';

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
    : (editMode ? '<li class="empty-note">No links yet</li>' : '');
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

/* ---------- similar projects ---------- */
function renderSimilar() {
  const e = entry();
  const items = e.similar || [];
  $('similar').innerHTML = items.map((s, i) => `
    <li>
      <a href="${esc(srcFor(s.image))}" data-view="${i}" target="_blank" rel="noopener" title="${esc(s.caption || 'Enlarge')}">
        <img src="${esc(srcFor(s.image))}" alt="${esc(s.caption || 'Similar project')}" loading="lazy" />
      </a>
      ${editMode && isPending(s.image) ? '<span class="badge">not uploaded</span>' : ''}
      ${editMode
        ? `<input class="cap" data-cap="${i}" value="${esc(s.caption || '')}" placeholder="Caption" maxlength="80" />
           <button type="button" class="x" data-del-sim="${i}" aria-label="Remove image">×</button>`
        : (s.caption ? `<span class="cap">${esc(s.caption)}</span>` : '')}
    </li>`).join('');
  show('similar-sec', items.length > 0);
}

async function addFiles(files) {
  const e = entry();
  if (!e) return;
  const imgs = [...files].filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) return;
  const added = [];
  for (const f of imgs) {
    const path = await stageUpload(f, e);
    added.push({ image: path, caption: f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 80) });
  }
  patch(e, 'similar', [...(e.similar || []), ...added]);
  renderSimilar();
}

$('similar-file').addEventListener('change', (ev) => { addFiles(ev.target.files); ev.target.value = ''; });
const drop = $('similar-drop');
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('over')));
drop.addEventListener('drop', (ev) => { ev.preventDefault(); addFiles(ev.dataTransfer.files); });

$('similar').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-del-sim]');
  if (!b) return;
  const e = entry();
  const i = Number(b.dataset.delSim);
  const gone = e.similar[i];
  if (gone && isPending(gone.image)) unstageUpload(gone.image);
  patch(e, 'similar', e.similar.filter((_, j) => j !== i));
  renderSimilar();
});
$('similar').addEventListener('change', (ev) => {
  const inp = ev.target.closest('[data-cap]');
  if (!inp) return;
  const e = entry();
  const items = e.similar.map((s, j) => (j === Number(inp.dataset.cap) ? { ...s, caption: inp.value.trim() } : s));
  patch(e, 'similar', items);
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
        <time datetime="${esc(c.at)}">${esc(fmtTime(c.at))}</time>
        <p>${esc(c.text)}</p>
        ${editMode ? `<button type="button" class="x" data-del-comment="${i}" aria-label="Delete comment">×</button>` : ''}
      </li>`).join('')
    : (editMode ? '<li class="empty-note" style="border:0;background:none;padding:0">No comments yet</li>' : '');
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

/* ---------- wiring ---------- */
for (const id of ['link-url', 'link-type']) $(id).addEventListener('keydown', (ev) => ev.stopPropagation());

function renderAll() {
  if (!entry()) return;
  $('link-error').hidden = true;
  renderLinks();
  renderSimilar();
  renderComments();
}
whenReady((list) => {
  entries = list;
  if (window.orbit.state.current >= 0) { current = window.orbit.state.current; renderAll(); }
});
window.addEventListener('orbit:open', (ev) => { current = ev.detail.dayIndex; if (entries.length) renderAll(); });
window.addEventListener('orbit:close', () => { current = -1; });
