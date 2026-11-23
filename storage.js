/* ------------------------------------------------------------------ *
 *  Storage meter (owner only): how full the two stores are, with a
 *  warning before you run past the free allowances.
 *   - Videos:  the Cloudflare R2 bucket (10 GB free, then paid per GB)
 *   - Images and site: this GitHub repo (keep under about 1 GB)
 *  Video sizes are added up from the sizes recorded when each was added
 *  here, so videos put in the bucket some other way aren't counted.
 * ------------------------------------------------------------------ */
import { editMode, whenReady, onChange, repoInfo, ls } from './store.js';
import { R2_ON, isR2 } from './r2.js';

const R2_FREE = 10e9;          // free allowance, bytes
const R2_PRICE = 0.015;        // USD per GB per month beyond it
const GH_LIMIT = 1e9;          // GitHub's recommended ceiling for a Pages repo
const WARN = 0.8;
const FULL = 0.95;

const $ = (id) => document.getElementById(id);
const btn = $('usage-btn');
const pop = $('usage-pop');
const gb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(b >= 1e10 ? 0 : 1)} GB` : `${Math.round(b / 1e6)} MB`);
const level = (f) => (f >= FULL ? 'full' : f >= WARN ? 'warn' : '');

let entries = [];
let ghBytes = null;

const inBucket = (m) => (m && m.video && isR2(m.video) ? m.videoBytes || 0 : 0);
const videoBytes = () => entries.reduce((s, e) => s + inBucket(e) + (Array.isArray(e.media) ? e.media.reduce((t, m) => t + inBucket(m), 0) : 0), 0);

function row(id, used, limit, note) {
  const el = $(id);
  const f = used / limit;
  el.className = `usage-row ${level(f)}`;
  el.querySelector('.usage-num').textContent = `${gb(used)} of ${gb(limit)}`;
  el.querySelector('i').style.width = `${Math.min(100, f * 100).toFixed(1)}%`;
  el.querySelector('.usage-note').textContent = note;
}

function render() {
  const v = videoBytes();
  const fv = v / R2_FREE;
  const fg = ghBytes === null ? 0 : ghBytes / GH_LIMIT;
  $('usage-r2').hidden = !R2_ON;
  if (R2_ON) {
    row('usage-r2', v, R2_FREE,
      fv >= 1 ? `Past the free 10 GB: about $${(((v - R2_FREE) / 1e9) * R2_PRICE).toFixed(2)} a month at Cloudflare's current price.`
        : fv >= WARN ? `Getting close to the free 10 GB. Room for about ${Math.floor((R2_FREE - v) / 250e6)} more 250 MB videos.`
          : `Free up to 10 GB. Room for about ${Math.floor((R2_FREE - v) / 250e6)} more 250 MB videos.`);
  }
  $('usage-gh').hidden = ghBytes === null;
  if (ghBytes !== null) {
    row('usage-gh', ghBytes, GH_LIMIT,
      fg >= WARN ? 'Close to GitHub\'s 1 GB guideline. Keep videos in the bucket and images small.' : 'GitHub suggests staying under 1 GB.');
  }
  const worst = Math.max(R2_ON ? fv : 0, fg);
  btn.className = `usage-btn ${level(worst)}`;
  btn.textContent = worst >= WARN ? `Storage ${Math.round(worst * 100)}%` : 'Storage';
  btn.title = worst >= 1 ? 'Past a free limit' : worst >= WARN ? 'Getting close to a limit' : 'Storage used';
}

async function loadRepoSize() {
  try {
    const { owner, repo } = repoInfo();
    const token = ls.get('designOrbit.githubToken');
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return;
    ghBytes = ((await res.json()).size || 0) * 1024;   // GitHub reports kilobytes
    render();
  } catch { /* offline: just show what we know */ }
}

// warn in the Add dialog before a video takes you past the free allowance
window.addEventListener('orbit:picked', (ev) => {
  const note = $('add-usage');
  note.hidden = true;
  if (!editMode || !R2_ON || !ev.detail.video) return;
  const after = videoBytes() + ev.detail.file.size;
  const f = after / R2_FREE;
  if (f < WARN) return;
  note.className = `add-usage ${level(f)}`;
  note.textContent = f >= 1
    ? `Heads up: with this video you'll be at ${gb(after)}, past the free 10 GB. Cloudflare will charge about $${(((after - R2_FREE) / 1e9) * R2_PRICE).toFixed(2)} a month.`
    : `Heads up: with this video you'll be at ${gb(after)} of the free 10 GB (${Math.round(f * 100)}%).`;
  note.hidden = false;
});

whenReady((list) => {
  entries = list;
  if (!editMode) return;
  btn.hidden = false;
  render();
  loadRepoSize();
  onChange(render);
  window.addEventListener('orbit:entries', render);
  btn.addEventListener('click', () => {
    pop.hidden = !pop.hidden;
    btn.setAttribute('aria-expanded', String(!pop.hidden));
    if (!pop.hidden) { render(); loadRepoSize(); }
  });
  document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !e.target.closest('#usage-btn, #usage-pop')) { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
});
