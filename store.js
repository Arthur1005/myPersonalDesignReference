/* ------------------------------------------------------------------ *
 *  Shared editing store
 *  - edit mode (unlocked with the owner PIN, see gate.js)
 *  - drafts: per-panel field changes kept in this browser until saved
 *  - pending image uploads (kept in IndexedDB so a reload doesn't lose them)
 *  - "Save to GitHub" and "Download" for everything at once
 * ------------------------------------------------------------------ */

const FALLBACK_REPO = { owner: 'Arthur1005', repo: 'myPersonalDesignReference', branch: 'main' };
const ENTRIES_PATH = 'data/entries.json';
export const UPLOAD_DIR = 'entries/similar';

const LS_DRAFTS = 'designOrbit.drafts.v2';
const LS_DRAFTS_V1 = 'designOrbit.drafts';
import { R2_ON, R2_BASE, isR2, r2Upload, R2AuthError } from './r2.js';

const LS_TOKEN = 'designOrbit.githubToken';
const LS_R2 = 'designOrbit.r2Keys';
const LS_ADDED = 'designOrbit.added.v1';
export const ENTRY_DIR = 'entries';

/* ---------- localStorage (can throw in private modes) ---------- */
export const ls = {
  get(k, fallback = null) { try { const v = localStorage.getItem(k); return v === null ? fallback : v; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/* ---------- edit mode: owner (PIN) edits, guests only view ---------- */
import { access } from './gate.js';
export const editMode = access === 'owner';
document.body.classList.toggle('editing', editMode);

/* ---------- helpers ---------- */
export const entryKey = (e) => `${e.date}|${e.title}`;
export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- drafts: { entryKey: { field: value } } ---------- */
let drafts = {};
try { drafts = JSON.parse(ls.get(LS_DRAFTS, '{}')) || {}; } catch { drafts = {}; }
// brand-new panels not yet saved to the repo
let added = [];
try { added = JSON.parse(ls.get(LS_ADDED, '[]')) || []; } catch { added = []; }
const saveAdded = () => { if (added.length) ls.set(LS_ADDED, JSON.stringify(added)); else ls.del(LS_ADDED); };
// migrate keyword-only drafts from the first version
try {
  const v1 = JSON.parse(ls.get(LS_DRAFTS_V1, 'null'));
  if (v1) {
    for (const [k, words] of Object.entries(v1)) drafts[k] = { ...(drafts[k] || {}), keywords: words };
    ls.del(LS_DRAFTS_V1);
    ls.set(LS_DRAFTS, JSON.stringify(drafts));
  }
} catch { /* ignore */ }

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); }
function emit() { listeners.forEach((fn) => fn()); updateSavebar(); }

/** Set a field on an entry and remember it as an unsaved draft. */
export function patch(entry, field, value) {
  entry[field] = value;
  if (field === 'keywords') delete entry.tags;
  if (field === 'links') delete entry.link;
  const k = entryKey(entry);
  drafts[k] = { ...(drafts[k] || {}), [field]: value };
  ls.set(LS_DRAFTS, JSON.stringify(drafts));
  emit();
}

function applyPatch(entry, p) {
  for (const [f, v] of Object.entries(p)) {
    entry[f] = v;
    if (f === 'keywords') delete entry.tags;
    if (f === 'links') delete entry.link;
  }
}

/* ---------- pending uploads (IndexedDB) ---------- */
const pending = new Map();   // path -> { blob, url }  (not yet in the repo)
const previews = new Map();  // path -> object URL     (local copy to show until the site redeploys)
let dbp = null;
function db() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('no indexedDB'));
  dbp = dbp || new Promise((res, rej) => {
    const r = indexedDB.open('designOrbit', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('uploads');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function idb(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction('uploads', mode);
    const req = fn(tx.objectStore('uploads'));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
  });
}

/** Image src for a path: a local preview if it hasn't been uploaded yet. */
export function srcFor(path) { return previews.get(path) || path; }
export function isPending(path) { return pending.has(path); }

const slug = (s) => s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';

/** Shrink big photos before they go into the repo. */
async function prepareImage(file) {
  if (/svg|gif/.test(file.type)) return { blob: file, ext: file.type.includes('svg') ? 'svg' : 'gif' };
  // videos (and anything that isn't an image) are stored as they are
  if (!file.type.startsWith('image/')) return { blob: file, ext: (file.name.split('.').pop() || 'bin').toLowerCase() };
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    let blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.86));
    let ext = 'webp';
    if (!blob || blob.type !== 'image/webp') { blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88)); ext = 'jpg'; }
    if (blob.size > file.size && scale === 1) return { blob: file, ext: (file.name.split('.').pop() || 'jpg').toLowerCase() };
    return { blob, ext };
  } catch {
    return { blob: file, ext: (file.name.split('.').pop() || 'jpg').toLowerCase() };
  }
}

/** Stage an image from the device; returns the repo path it will be saved to. */
export async function stageUpload(file, entry, dir = UPLOAD_DIR, { toBucket = false } = {}) {
  const { blob, ext } = await prepareImage(file);
  const rand = Math.random().toString(36).slice(2, 7);
  const name = `${entry.date}-${slug(file.name)}-${rand}.${ext}`;
  // big videos go to the R2 bucket (their "path" is the public address); everything else into this repo
  const path = toBucket ? `${R2_BASE}/videos/${name}` : `${dir}/${name}`;
  const url = URL.createObjectURL(blob);
  pending.set(path, { blob, url });
  previews.set(path, url);
  idb('readwrite', (s) => s.put(blob, path)).catch(() => {});
  updateSavebar();
  return path;
}

export function unstageUpload(path) {
  const p = pending.get(path);
  if (!p) return;
  URL.revokeObjectURL(p.url);
  pending.delete(path);
  previews.delete(path);
  idb('readwrite', (s) => s.delete(path)).catch(() => {});
  updateSavebar();
}

async function restorePending() {
  try {
    const d = await db();
    await new Promise((res) => {
      const tx = d.transaction('uploads', 'readonly');
      const req = tx.objectStore('uploads').openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return res();
        const url = URL.createObjectURL(cur.value);
        pending.set(cur.key, { blob: cur.value, url });
        previews.set(cur.key, url);
        cur.continue();
      };
      req.onerror = () => res();
    });
  } catch { /* no IndexedDB: uploads only live until reload */ }
}

/* ---------- new panels ---------- */
/** Create a new entry from an image on the device. Returns its index on the globe. */
export async function createEntry({ file, video, frames, title, date, note }) {
  let t = title.trim();
  const taken = (x) => entries.some((e) => entryKey(e) === `${date}|${x}`);
  for (let n = 2; taken(t); n++) t = `${title.trim()} (${n})`;
  const image = await stageUpload(file, { date }, ENTRY_DIR);
  const entry = { date, title: t, image };
  if (video) {
    entry.video = await stageUpload(video, { date }, ENTRY_DIR, { toBucket: R2_ON });            // `image` is the video's still frame
    entry.frames = [];
    for (const f of frames || []) entry.frames.push(await stageUpload(f, { date }, `${ENTRY_DIR}/frames`));
  }
  if (note && note.trim()) entry.note = note.trim();
  added.push({ ...entry });
  saveAdded();
  const index = window.orbit.addEntry(entry);
  updateSavebar();
  emit();
  return index;
}

/* ---------- ready: apply drafts before anyone renders ---------- */
let entries = [];
let ready = false;
const readyQueue = [];
export function whenReady(fn) { if (ready) fn(entries); else readyQueue.push(fn); }
export function getEntries() { return entries; }

async function boot() {
  if (editMode) await restorePending();
  window.orbit.resolveImage = srcFor;   // show local previews for images not uploaded yet
  entries = window.orbit.state.entries;
  if (editMode) {
    // put back panels added in this browser but not saved yet
    const keys = new Set(entries.map(entryKey));
    added = added.filter((a) => !keys.has(entryKey(a)));   // already in the repo? then it's saved
    saveAdded();
    for (const a of added) window.orbit.addEntry({ ...a });
    for (const e of entries) { const p = drafts[entryKey(e)]; if (p) applyPatch(e, p); }
  } else {
    added = [];
  }
  ready = true;
  updateSavebar();
  readyQueue.splice(0).forEach((fn) => fn(entries));
}

/* ---------- save bar ---------- */
const savebar = document.getElementById('savebar');
const statusEl = document.getElementById('save-status');

function updateSavebar(message) {
  const addedKeys = new Set(added.map(entryKey));
  const n = Object.keys(drafts).filter((k) => !addedKeys.has(k)).length;
  const a = added.length;
  const u = pending.size;
  savebar.hidden = !editMode || (n === 0 && u === 0 && a === 0 && !message);
  if (message) { statusEl.textContent = message; return; }
  const parts = [];
  if (a) parts.push(`${a} new panel${a === 1 ? '' : 's'}`);
  if (n) parts.push(`${n} panel${n === 1 ? '' : 's'} changed`);
  if (u) parts.push(`${u} file${u === 1 ? '' : 's'} to upload`);
  statusEl.textContent = `Unsaved: ${parts.join(', ')}`;
}

/* ---------- export ---------- */
const FIELD_ORDER = ['date', 'title', 'image', 'video', 'frames', 'note', 'link', 'links', 'keywords', 'similar', 'comments'];
function cleanEntry(e) {
  const out = {};
  const src = { ...e };
  if (src.tags && !src.keywords) src.keywords = src.tags;
  delete src.tags;
  if (src.links?.length) delete src.link;
  for (const k of [...FIELD_ORDER, ...Object.keys(src).filter((k) => !FIELD_ORDER.includes(k))]) {
    const v = src[k];
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
    out[k] = v;
  }
  return out;
}
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
export function exportJSON(list) {
  return JSON.stringify({ entries: [...list].sort(byDate).map(cleanEntry) }, null, 2) + '\n';
}

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

document.getElementById('save-download').addEventListener('click', () => {
  download('entries.json', new Blob([exportJSON(entries)], { type: 'application/json' }));
  for (const [path, { blob }] of pending) download(path.split('/').pop(), blob);
  updateSavebar(pending.size
    ? `Downloaded — replace data/entries.json and put the images in ${UPLOAD_DIR}/`
    : 'Downloaded — replace data/entries.json with it');
});

/* ---------- GitHub ---------- */
function repoInfo() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const seg = location.pathname.split('/').filter(Boolean)[0];
  if (m && seg) return { owner: m[1], repo: seg, branch: FALLBACK_REPO.branch };
  return FALLBACK_REPO;
}
function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

class AuthError extends Error {}

async function gh(url, opts, headers) {
  const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts?.headers || {}) }, cache: 'no-store' });
  if (res.status === 401 || res.status === 403) throw new AuthError('auth');
  if (!res.ok) throw new Error(`GitHub said ${res.status}`);
  return res.json();
}

const saveBtn = document.getElementById('save-github');
saveBtn.addEventListener('click', async () => {
  let token = ls.get(LS_TOKEN);
  if (!token) {
    token = window.prompt(
      'Paste a GitHub fine-grained token with "Contents: Read and write" access to this repo only.\n' +
      'It is stored in this browser only, and sent only to api.github.com.'
    );
    if (!token) return;
    token = token.trim();
    ls.set(LS_TOKEN, token);
  }
  const { owner, repo, branch } = repoInfo();
  const api = `https://api.github.com/repos/${owner}/${repo}/contents`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  saveBtn.disabled = true;
  try {
    // 1. images first, so entries.json never points at a missing file
    let i = 0;
    const total = pending.size;
    let r2Keys = null;
    if ([...pending.keys()].some(isR2)) {
      try { r2Keys = JSON.parse(ls.get(LS_R2) || 'null'); } catch { r2Keys = null; }
      if (!r2Keys) {
        const accessKeyId = (window.prompt('Videos upload to your Cloudflare R2 bucket.\nPaste the R2 token\'s Access Key ID (stored in this browser only):') || '').trim();
        const secretAccessKey = accessKeyId && (window.prompt('Now paste its Secret Access Key:') || '').trim();
        if (!accessKeyId || !secretAccessKey) { updateSavebar(); return; }
        r2Keys = { accessKeyId, secretAccessKey };
        ls.set(LS_R2, JSON.stringify(r2Keys));
      }
    }
    for (const [path, { blob }] of [...pending]) {
      i++;
      if (isR2(path)) {
        const size = `${(blob.size / 1e6).toFixed(0)} MB`;
        updateSavebar(`Uploading video (${size})… 0%`);
        await r2Upload(path, blob, r2Keys, (p) => updateSavebar(`Uploading video (${size})… ${Math.round(p * 100)}%`));
        pending.delete(path);
        idb('readwrite', (s) => s.delete(path)).catch(() => {});
        continue;
      }
      updateSavebar(`Uploading file ${i} of ${total}…${blob.size > 8e6 ? ' (large, may take a minute)' : ''}`);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await gh(`${api}/${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Add ${/\.(mp4|webm|mov|m4v)$/i.test(path) ? 'video' : 'image'} ${path.split('/').pop()}`, content: bytesToB64(bytes), branch }),
      }, headers);
      // keep showing the local copy until the site redeploys, but it's no longer "pending"
      pending.delete(path);
      idb('readwrite', (s) => s.delete(path)).catch(() => {});
    }
    // 2. entries.json: merge drafts into the latest file so nothing added elsewhere is lost
    const n = Object.keys(drafts).length;
    if (n || added.length) {
      updateSavebar('Saving panels…');
      const file = await gh(`${api}/${ENTRIES_PATH}?ref=${branch}`, {}, headers);
      const remote = JSON.parse(b64decode(file.content));
      const list = remote.entries || remote;
      const have = new Set(list.map(entryKey));
      for (const a of added) {
        if (have.has(entryKey(a))) continue;
        // take the live copy, which already carries any keywords/links/comments added since
        list.push({ ...(entries.find((e) => entryKey(e) === entryKey(a)) || a) });
      }
      for (const e of list) { const p = drafts[entryKey(e)]; if (p) applyPatch(e, p); }
      const addedN = added.length;
      const changedN = Object.keys(drafts).filter((k) => !added.some((a) => entryKey(a) === k)).length;
      const msg = [addedN && `Add ${addedN} panel${addedN === 1 ? '' : 's'}`, changedN && `update ${changedN}`]
        .filter(Boolean).join(', ');
      await gh(`${api}/${ENTRIES_PATH}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg.charAt(0).toUpperCase() + msg.slice(1),
          content: bytesToB64(new TextEncoder().encode(exportJSON(list))),
          sha: file.sha,
          branch,
        }),
      }, headers);
      drafts = {};
      ls.del(LS_DRAFTS);
      added = [];
      saveAdded();
    }
    emit();
    updateSavebar('Saved — live on the site in about a minute');
    setTimeout(() => updateSavebar(), 4000);
  } catch (err) {
    if (err instanceof AuthError) {
      ls.del(LS_TOKEN);
      updateSavebar('GitHub rejected the token — try again with a new one');
    } else if (err instanceof R2AuthError) {
      ls.del(LS_R2);
      updateSavebar('Cloudflare rejected the upload keys — press Save to enter them again');
    } else {
      updateSavebar(`Couldn't save: ${err.message}`);
    }
  } finally {
    saveBtn.disabled = false;
  }
});

// Start last, so everything above (save bar, etc.) exists even if the globe is already loaded.
if (window.orbit?.ready) boot(); else window.addEventListener('orbit:ready', boot, { once: true });
