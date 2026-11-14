/* ------------------------------------------------------------------ *
 *  Keywords: chips on each panel + a search box with spelling help.
 *
 *  Everyone sees the keywords saved in data/entries.json.
 *  Editing is only shown to the owner (unlocked with the PIN).
 * ------------------------------------------------------------------ */

import { editMode, patch, whenReady } from './store.js';

const $ = (id) => document.getElementById(id);
const chipsEl = $('kw-chips');
const searchEl = $('kw-search');
const input = $('kw-input');
const list = $('kw-list');
searchEl.hidden = !editMode;

/* ---------- state ---------- */
let entries = [];
let current = -1;
let vocab = [];          // built-in design vocabulary

const norm = (s) => s.toLowerCase().trim().replace(/\s+/g, ' ');
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

/* ---------- chips: floating inside a container ---------- */
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const PAD = 8;           // keep chips this far from the container walls
const GAP = 6;           // minimum space between chips
const SPEED = 12;        // cruising speed, px per second
let bodies = [];         // { el, word, x, y, w, h, vx, vy, hover }
let raf = 0;
let lastT = 0;

function makeChip(w) {
  const li = document.createElement('li');
  const label = document.createElement('span');
  label.textContent = w;
  li.appendChild(label);
  if (editMode) {
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.setAttribute('aria-label', `Remove ${w}`);
    x.addEventListener('click', () => removeKeyword(w));
    li.appendChild(x);
  }
  return li;
}

function overlaps(a, b, gap = GAP) {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

// Grow the box when there are many keywords, so they always have room to drift.
function fitHeight() {
  const W = chipsEl.clientWidth || 300;
  const area = bodies.reduce((s, b) => s + (b.w + GAP * 2) * (b.h + GAP * 2), 0);
  const H = Math.max(bodies.length ? 132 : 64, Math.ceil((area * 2.1) / W) + PAD * 2);
  chipsEl.style.height = `${H}px`;
  return { W, H };
}

function placeBody(b, W, H, others, near) {
  for (let tries = 0; tries < 80; tries++) {
    b.x = near ? near.x + (Math.random() - 0.5) * 60 : PAD + Math.random() * Math.max(1, W - b.w - PAD * 2);
    b.y = near ? near.y + (Math.random() - 0.5) * 30 : PAD + Math.random() * Math.max(1, H - b.h - PAD * 2);
    b.x = Math.min(Math.max(b.x, PAD), Math.max(PAD, W - b.w - PAD));
    b.y = Math.min(Math.max(b.y, PAD), Math.max(PAD, H - b.h - PAD));
    if (!others.some((o) => overlaps(b, o))) return;
  }
}

function renderChips({ added } = {}) {
  const e = entries[current];
  const words = e ? keywordsOf(e) : [];
  const old = new Map(bodies.map((b) => [b.word, b]));
  bodies = [];
  chipsEl.innerHTML = '';
  for (const w of words) {
    const prev = old.get(w);
    const el = prev ? prev.el : makeChip(w);
    if (prev) el.classList.remove('pop');
    chipsEl.appendChild(el);
    const angle = Math.random() * Math.PI * 2;
    const b = prev || { el, word: w, vx: Math.cos(angle) * SPEED, vy: Math.sin(angle) * SPEED, hover: false, fresh: true };
    b.w = el.offsetWidth;
    b.h = el.offsetHeight;
    bodies.push(b);
    if (!prev) {
      el.addEventListener('pointerenter', () => { b.hover = true; el.classList.add('held'); });
      el.addEventListener('pointerleave', () => { b.hover = false; el.classList.remove('held'); });
    }
  }
  const { W, H } = fitHeight();
  const placed = [];
  for (const b of bodies) {
    if (b.fresh) {
      placeBody(b, W, H, placed, b.word === added ? { x: W / 2 - b.w / 2, y: H / 2 - b.h / 2 } : null);
      if (b.word === added) b.el.classList.add('pop');
      b.fresh = false;
    }
    placed.push(b);
    b.el.style.transform = `translate3d(${b.x}px, ${b.y}px, 0)`;
  }
  startFloating();
}

function step(dt) {
  const W = chipsEl.clientWidth;
  const H = chipsEl.clientHeight;
  for (const b of bodies) {
    if (b.hover) continue;
    // gentle wander, then ease back to cruising speed
    b.vx += (Math.random() - 0.5) * 30 * dt;
    b.vy += (Math.random() - 0.5) * 30 * dt;
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const k = 1 + (SPEED / sp - 1) * Math.min(1, dt * 1.5);
    b.vx *= k; b.vy *= k;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < PAD) { b.x = PAD; b.vx = Math.abs(b.vx); }
    if (b.y < PAD) { b.y = PAD; b.vy = Math.abs(b.vy); }
    if (b.x + b.w > W - PAD) { b.x = Math.max(PAD, W - PAD - b.w); b.vx = -Math.abs(b.vx); }
    if (b.y + b.h > H - PAD) { b.y = Math.max(PAD, H - PAD - b.h); b.vy = -Math.abs(b.vy); }
  }
  // soft collisions: push apart along the shallower axis and trade velocity
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], c = bodies[j];
      if (!overlaps(a, c)) continue;
      const ox = Math.min(a.x + a.w + GAP - c.x, c.x + c.w + GAP - a.x);
      const oy = Math.min(a.y + a.h + GAP - c.y, c.y + c.h + GAP - a.y);
      const sa = a.hover ? 0 : c.hover ? 1 : 0.5;   // a held chip doesn't get pushed
      const sc = 1 - sa;
      if (ox < oy) {
        const dir = a.x < c.x ? -1 : 1;
        a.x += dir * ox * sa; c.x -= dir * ox * sc;
        if ((c.vx - a.vx) * dir > 0) { const t = a.vx; a.vx = c.vx; c.vx = t; }
      } else {
        const dir = a.y < c.y ? -1 : 1;
        a.y += dir * oy * sa; c.y -= dir * oy * sc;
        if ((c.vy - a.vy) * dir > 0) { const t = a.vy; a.vy = c.vy; c.vy = t; }
      }
    }
  }
  for (const b of bodies) b.el.style.transform = `translate3d(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px, 0)`;
}

function frame(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
  lastT = t;
  step(dt);
  raf = requestAnimationFrame(frame);
}
function startFloating() {
  if (reduceMotion || raf || current < 0 || !bodies.length) return;
  lastT = performance.now();
  raf = requestAnimationFrame(frame);
}
function stopFloating() { cancelAnimationFrame(raf); raf = 0; }

if (window.ResizeObserver) {
  new ResizeObserver(() => { if (bodies.length) fitHeight(); }).observe(chipsEl);
}

function setKeywords(e, words) {
  patch(e, 'keywords', words);
  renderChips({ added: setKeywords.added });
  setKeywords.added = null;
}

function addKeyword(word) {
  const e = entries[current];
  const w = norm(word);
  if (!e || !w || keywordsOf(e).includes(w)) return;
  setKeywords.added = w;
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

/* ---------- wiring to the globe ---------- */
whenReady((list_) => {
  entries = list_;
  if (window.orbit.state.current >= 0) { current = window.orbit.state.current; renderChips(); }
});
window.addEventListener('orbit:open', (ev) => {
  const changed = current !== ev.detail.dayIndex;
  current = ev.detail.dayIndex;
  input.value = '';
  list.hidden = true;
  if (changed) bodies = [];      // new panel: scatter its keywords afresh
  // wait a frame so the panel is laid out before measuring chips
  requestAnimationFrame(() => renderChips());
});
window.addEventListener('orbit:close', () => { current = -1; list.hidden = true; stopFloating(); });

fetch('data/keywords.json', { cache: 'no-cache' })
  .then((r) => r.json())
  .then((j) => { vocab = (j.keywords || j).map(norm); })
  .catch(() => { vocab = []; });
