/* ------------------------------------------------------------------ *
 *  Keywords: chips on each panel + a search box with spelling help.
 *
 *  Everyone sees the keywords saved in data/entries.json.
 *  Editing is only shown in edit mode: open the site with ?edit
 *  (it's remembered in this browser; ?edit=off turns it off).
 * ------------------------------------------------------------------ */

// Where "Save to GitHub" writes. Detected automatically on *.github.io.
const FALLBACK_REPO = { owner: 'Arthur1005', repo: 'myPersonalDesignReference', branch: 'main' };
const ENTRIES_PATH = 'data/entries.json';

const LS_EDIT = 'designOrbit.edit';
const LS_DRAFTS = 'designOrbit.drafts';
const LS_TOKEN = 'designOrbit.githubToken';

const $ = (id) => document.getElementById(id);
const chipsEl = $('kw-chips');
const searchEl = $('kw-search');
const input = $('kw-input');
const list = $('kw-list');
const savebar = $('savebar');
const saveStatus = $('save-status');

/* ---------- storage (localStorage can throw in private modes) ---------- */
const store = {
  get(k, fallback = null) { try { const v = localStorage.getItem(k); return v === null ? fallback : v; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/* ---------- edit mode ---------- */
const params = new URLSearchParams(location.search);
if (params.has('edit')) {
  if (params.get('edit') === 'off') store.del(LS_EDIT); else store.set(LS_EDIT, '1');
}
const editMode = store.get(LS_EDIT) === '1';
$('edit-badge').hidden = !editMode;
searchEl.hidden = !editMode;

/* ---------- state ---------- */
let entries = [];
let current = -1;
let vocab = [];          // built-in design vocabulary
let drafts = {};         // { entryKey: [keywords] } — unsaved edits in this browser
try { drafts = JSON.parse(store.get(LS_DRAFTS, '{}')) || {}; } catch { drafts = {}; }

const norm = (s) => s.toLowerCase().trim().replace(/\s+/g, ' ');
const entryKey = (e) => `${e.date}|${e.title}`;
const keywordsOf = (e) => e.keywords || e.tags || [];

function usedKeywords() {
  const counts = new Map();
  for (const e of entries) for (const k of keywordsOf(e)) counts.set(k, (counts.get(k) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

/* ---------- spelling: Damerau–Levenshtein (optimal string alignment) ---------- */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

/* ---------- suggestions ---------- */
function suggest(raw) {
  const q = norm(raw);
  const have = new Set(current >= 0 ? keywordsOf(entries[current]) : []);
  const pool = [...new Set([...usedKeywords(), ...vocab])].filter((w) => !have.has(w));

  if (!q) {
    return usedKeywords().filter((w) => !have.has(w)).slice(0, 8)
      .map((w) => ({ word: w, kind: 'used', label: 'used before' }));
  }

  const out = [];
  const seen = new Set();
  const push = (o) => { if (!seen.has(o.word)) { seen.add(o.word); out.push(o); } };

  // 1. exact, then word-starts-with, then contains
  const scored = [];
  for (const w of pool) {
    if (w === q) scored.push([0, w]);
    else if (w.startsWith(q)) scored.push([1, w]);
    else if (w.split(/[\s-]/).some((part) => part.startsWith(q))) scored.push([2, w]);
    else if (q.length >= 3 && w.includes(q)) scored.push([3, w]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length || a[1].localeCompare(b[1]));
  const matches = scored.slice(0, 8).map(([, w]) => ({ word: w, kind: 'match' }));

  // 2. spelling corrections, when nothing (or little) matches directly
  let fixes = [];
  if (q.length >= 3 && scored.filter(([s]) => s <= 1).length < 2) {
    const max = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
    fixes = pool
      .map((w) => {
        // compare to the whole word, and to its opening (for half-typed words)
        let d = editDistance(q, w, max);
        for (let n = q.length - 1; n <= q.length + 1; n++) {
          if (n > 0 && n < w.length) d = Math.min(d, editDistance(q, w.slice(0, n), max) + 0.5);
        }
        return [d, w];
      })
      .filter(([d]) => d <= max && d > 0)
      .sort((a, b) => a[0] - b[0] || a[1].length - b[1].length)
      .slice(0, 4)
      .map(([, w]) => ({ word: w, kind: 'fix', label: 'did you mean?' }));
  }

  // Corrections go first when there are no direct prefix matches, so Enter picks the right spelling.
  const directHit = scored.some(([s]) => s <= 1);
  (directHit ? [...matches, ...fixes] : [...fixes, ...matches]).forEach(push);

  if (!pool.includes(q) && !have.has(q)) push({ word: q, kind: 'new', label: 'add as new' });
  else if (have.has(q)) push({ word: q, kind: 'have', label: 'already added' });
  return out.slice(0, 9);
}

let options = [];
let active = 0;

function highlight(word, q) {
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const i = q ? word.indexOf(q) : -1;
  if (i < 0) return esc(word);
  return esc(word.slice(0, i)) + '<mark>' + esc(word.slice(i, i + q.length)) + '</mark>' + esc(word.slice(i + q.length));
}

function renderList() {
  const q = norm(input.value);
  options = suggest(input.value);
  active = Math.min(active, Math.max(0, options.length - 1));
  if (!options.length || document.activeElement !== input) {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    return;
  }
  list.innerHTML = options.map((o, i) => `
    <li role="option" id="kw-opt-${i}" class="${o.kind}" aria-selected="${i === active}" data-i="${i}">
      ${o.kind === 'new' ? `Add “${highlight(o.word, '')}”` : highlight(o.word, q)}
      ${o.label && o.kind !== 'new' ? `<span class="hint-label">${o.label}</span>` : ''}
    </li>`).join('');
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-activedescendant', `kw-opt-${active}`);
  list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

/* ---------- chips ---------- */
function renderChips() {
  const e = entries[current];
  const words = e ? keywordsOf(e) : [];
  chipsEl.innerHTML = '';
  for (const w of words) {
    const li = document.createElement('li');
    li.textContent = w;
    if (editMode) {
      const x = document.createElement('button');
      x.type = 'button';
      x.textContent = '×';
      x.setAttribute('aria-label', `Remove ${w}`);
      x.addEventListener('click', () => removeKeyword(w));
      li.appendChild(x);
    }
    chipsEl.appendChild(li);
  }
}

function setKeywords(e, words) {
  e.keywords = words;
  delete e.tags;
  drafts[entryKey(e)] = words;
  store.set(LS_DRAFTS, JSON.stringify(drafts));
  renderChips();
  updateSavebar();
}

function addKeyword(word) {
  const e = entries[current];
  const w = norm(word);
  if (!e || !w || keywordsOf(e).includes(w)) return;
  setKeywords(e, [...keywordsOf(e), w]);
  input.value = '';
  active = 0;
  renderList();
}

function removeKeyword(word) {
  const e = entries[current];
  if (!e) return;
  setKeywords(e, keywordsOf(e).filter((k) => k !== word));
}

/* ---------- input events ---------- */
input.addEventListener('input', () => { active = 0; renderList(); });
input.addEventListener('focus', renderList);
input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); }, 120));
input.addEventListener('keydown', (ev) => {
  ev.stopPropagation(); // keep arrows/Esc from driving the globe
  if (ev.key === 'ArrowDown') { ev.preventDefault(); active = (active + 1) % Math.max(options.length, 1); renderList(); }
  else if (ev.key === 'ArrowUp') { ev.preventDefault(); active = (active - 1 + options.length) % Math.max(options.length, 1); renderList(); }
  else if (ev.key === 'Enter') {
    ev.preventDefault();
    const o = options[active];
    if (o && o.kind !== 'have') addKeyword(o.word);
  } else if (ev.key === 'Escape') {
    if (!list.hidden) { list.hidden = true; } else { input.blur(); }
  } else if (ev.key === 'Backspace' && !input.value) {
    const e = entries[current];
    const ks = e ? keywordsOf(e) : [];
    if (ks.length) removeKeyword(ks[ks.length - 1]);
  }
});
list.addEventListener('mousedown', (ev) => {
  const li = ev.target.closest('li');
  if (!li) return;
  ev.preventDefault();
  const o = options[Number(li.dataset.i)];
  if (o && o.kind !== 'have') addKeyword(o.word);
});

/* ---------- saving ---------- */
function updateSavebar() {
  const n = Object.keys(drafts).length;
  savebar.hidden = !editMode || n === 0;
  saveStatus.textContent = n === 1 ? 'Unsaved keywords on 1 panel' : `Unsaved keywords on ${n} panels`;
}

function exportJSON(list_) {
  const clean = list_.map((e) => {
    const { date, title, image, note, link } = e;
    const out = { date, title, image };
    if (note) out.note = note;
    if (link) out.link = link;
    out.keywords = keywordsOf(e);
    return out;
  });
  return JSON.stringify({ entries: clean }, null, 2) + '\n';
}

$('save-download').addEventListener('click', () => {
  const blob = new Blob([exportJSON(entries)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'entries.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  saveStatus.textContent = 'Downloaded — replace data/entries.json with it';
});

function repoInfo() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const seg = location.pathname.split('/').filter(Boolean)[0];
  if (m && seg) return { owner: m[1], repo: seg, branch: FALLBACK_REPO.branch };
  return FALLBACK_REPO;
}

const b64encode = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

$('save-github').addEventListener('click', async () => {
  let token = store.get(LS_TOKEN);
  if (!token) {
    token = window.prompt(
      'Paste a GitHub fine-grained token with "Contents: Read and write" access to this repo only.\n' +
      'It is stored in this browser only, and sent only to api.github.com.'
    );
    if (!token) return;
    token = token.trim();
    store.set(LS_TOKEN, token);
  }
  const { owner, repo, branch } = repoInfo();
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${ENTRIES_PATH}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  const btn = $('save-github');
  btn.disabled = true;
  saveStatus.textContent = 'Saving…';
  try {
    const res = await fetch(`${url}?ref=${branch}`, { headers, cache: 'no-store' });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error('auth'), { auth: true });
    if (!res.ok) throw new Error(`GitHub said ${res.status}`);
    const file = await res.json();
    // Merge drafts into the latest file, so entries added since page load are kept.
    const remote = JSON.parse(b64decode(file.content));
    const remoteEntries = remote.entries || remote;
    for (const e of remoteEntries) {
      const d = drafts[entryKey(e)];
      if (d) { e.keywords = d; delete e.tags; }
    }
    remoteEntries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const put = await fetch(url, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Update keywords (${Object.keys(drafts).length} panel${Object.keys(drafts).length === 1 ? '' : 's'})`,
        content: b64encode(exportJSON(remoteEntries)),
        sha: file.sha,
        branch,
      }),
    });
    if (put.status === 401 || put.status === 403) throw Object.assign(new Error('auth'), { auth: true });
    if (!put.ok) throw new Error(`GitHub said ${put.status}`);
    drafts = {};
    store.del(LS_DRAFTS);
    updateSavebar();
    savebar.hidden = false;
    saveStatus.textContent = 'Saved — live on the site in about a minute';
    setTimeout(updateSavebar, 4000);
  } catch (err) {
    if (err.auth) {
      store.del(LS_TOKEN);
      saveStatus.textContent = 'GitHub rejected the token — try again with a new one';
    } else {
      saveStatus.textContent = `Couldn't save: ${err.message}`;
    }
  } finally {
    btn.disabled = false;
  }
});

/* ---------- wiring to the globe ---------- */
function onReady() {
  entries = window.orbit.state.entries;
  if (editMode) {
    for (const e of entries) {
      const d = drafts[entryKey(e)];
      if (d) { e.keywords = d; delete e.tags; }
    }
  }
  updateSavebar();
  if (window.orbit.state.current >= 0) { current = window.orbit.state.current; renderChips(); }
}
window.addEventListener('orbit:open', (ev) => {
  current = ev.detail.dayIndex;
  input.value = '';
  list.hidden = true;
  renderChips();
});
window.addEventListener('orbit:close', () => { current = -1; list.hidden = true; });
if (window.orbit?.ready) onReady(); else window.addEventListener('orbit:ready', onReady, { once: true });

fetch('data/keywords.json', { cache: 'no-cache' })
  .then((r) => r.json())
  .then((j) => { vocab = (j.keywords || j).map(norm); })
  .catch(() => { vocab = []; });
