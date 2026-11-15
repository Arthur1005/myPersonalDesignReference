/* ------------------------------------------------------------------ *
 *  Progress calendar
 *  - a day with 1 entry is "done", 2+ is "multi" (shows the count)
 *  - a past day with none, on or after your first entry, is "missed"
 *  - today without an entry yet is still open, not missed
 *  Picking a day lights up its panels on the globe and lists them.
 * ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const cal = $('calendar');
const toggle = $('cal-toggle');
const grid = $('cal-grid');
const dayBox = $('cal-day');

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

let entries = [];
let byDate = new Map();     // 'YYYY-MM-DD' -> [entry indices]
let firstDate = null;       // the day tracking starts
let view = null;            // { y, m } month being shown
let selected = null;        // selected 'YYYY-MM-DD'

/* ---------- local dates (never UTC, so days match where you are) ---------- */
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const todayISO = () => iso(new Date());

function statusOf(day) {
  const n = (byDate.get(day) || []).length;
  if (n > 1) return 'multi';
  if (n === 1) return 'done';
  const t = todayISO();
  if (day === t) return 'today';
  if (day > t) return 'future';
  if (!firstDate || day < firstDate) return 'before';
  return 'missed';
}

/* ---------- streaks ---------- */
function stats() {
  const t = todayISO();
  let done = 0, tracked = 0, best = 0, run = 0;
  if (firstDate) {
    for (let d = parse(firstDate); iso(d) <= t; d = addDays(d, 1)) {
      const k = iso(d);
      const has = byDate.has(k);
      if (k !== t || has) tracked++;          // today only counts once it's done
      if (has) { done++; run++; best = Math.max(best, run); } else if (k !== t) run = 0;
    }
  }
  // current streak: back from today (or yesterday, if today isn't done yet)
  let streak = 0;
  let d = byDate.has(t) ? new Date() : addDays(new Date(), -1);
  while (byDate.has(iso(d))) { streak++; d = addDays(d, -1); }
  return { streak, best, done, tracked, total: entries.length };
}

/* ---------- render ---------- */
function render() {
  const { y, m } = view;
  $('cal-title').textContent = new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const s = stats();
  $('st-streak').textContent = s.streak;
  $('st-best').textContent = s.best;
  $('st-done').textContent = `${s.done}/${s.tracked}`;
  $('st-total').textContent = s.total;
  $('cal-streak').textContent = s.streak;

  // trail: one dot per day for the last two weeks
  let trail = '';
  for (let i = 13; i >= 0; i--) {
    const key = iso(addDays(new Date(), -i));
    const st0 = statusOf(key);
    const n0 = (byDate.get(key) || []).length;
    const what = { done: '1 entry', multi: `${n0} entries`, missed: 'missed', today: 'nothing yet', before: 'before you started', future: '' }[st0];
    trail += `<button type="button" class="dot ${st0}${key === selected ? ' sel' : ''}" data-day="${key}" title="${parse(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${what}" aria-label="${parse(key).toDateString()}, ${what}"></button>`;
  }
  $('cal-trail').innerHTML = trail;

  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7;                 // Monday-first weeks
  const days = new Date(y, m + 1, 0).getDate();
  const t = todayISO();

  let html = WEEKDAYS.map((w) => `<span class="wd" role="columnheader">${w}</span>`).join('');
  for (let i = 0; i < lead; i++) html += '<span class="blank"></span>';
  for (let d = 1; d <= days; d++) {
    const key = `${y}-${pad(m + 1)}-${pad(d)}`;
    const st = statusOf(key);
    const n = (byDate.get(key) || []).length;
    const label = { done: '1 entry', multi: `${n} entries`, missed: 'missed', today: 'today, no entry yet', future: '', before: '' }[st];
    html += `<button type="button" role="gridcell" class="day ${st}${key === t ? ' is-today' : ''}${key === selected ? ' sel' : ''}"
      data-day="${key}" ${st === 'future' ? 'disabled' : ''} aria-label="${parse(key).toDateString()}${label ? ', ' + label : ''}">
      <span class="num">${d}</span>${n > 1 ? `<span class="count">${n}</span>` : ''}
    </button>`;
  }
  grid.innerHTML = html;

  const now = new Date();
  $('cal-next').disabled = y > now.getFullYear() || (y === now.getFullYear() && m >= now.getMonth());
  const fd = firstDate ? parse(firstDate) : now;
  $('cal-prev').disabled = y < fd.getFullYear() || (y === fd.getFullYear() && m <= fd.getMonth());

  renderDay();
}

function esc(s = '') {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderDay() {
  if (!selected) { dayBox.innerHTML = ''; return; }
  const idx = byDate.get(selected) || [];
  const when = parse(selected).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const st = statusOf(selected);
  let body;
  if (idx.length) {
    body = `<ul class="cal-entries">${idx.map((i) => `
      <li><button type="button" data-entry="${i}">
        <img src="${esc((window.orbit.resolveImage || ((x) => x))(entries[i].image))}" alt="" loading="lazy" />
        <span><b>${esc(entries[i].title)}</b><small>Panel ${String(i + 1).padStart(3, '0')}</small></span>
      </button></li>`).join('')}</ul>`;
  } else if (st === 'today') {
    body = '<p class="cal-empty">Nothing yet today — still time.</p>';
  } else if (st === 'missed') {
    body = '<p class="cal-empty">No entry this day.</p>';
  } else {
    body = '<p class="cal-empty">Before you started.</p>';
  }
  dayBox.innerHTML = `<h3>${when}${idx.length > 1 ? ` <em>· ${idx.length} entries</em>` : ''}</h3>${body}`;
}

/* ---------- interaction ---------- */
function selectDay(key, { fly = true } = {}) {
  selected = key;
  const idx = byDate.get(key) || [];
  window.orbit.highlightEntries(idx);
  if (fly && idx.length) window.orbit.focusEntry(idx[0]);
  render();
}

grid.addEventListener('click', (e) => {
  const b = e.target.closest('.day');
  if (b && !b.disabled) selectDay(b.dataset.day);
});
// hovering a day previews its panels on the globe
grid.addEventListener('pointerover', (e) => {
  const b = e.target.closest('.day');
  if (b) window.orbit.highlightEntries(byDate.get(b.dataset.day) || []);
});
grid.addEventListener('pointerleave', () => {
  window.orbit.highlightEntries(selected ? byDate.get(selected) || [] : []);
});
dayBox.addEventListener('click', (e) => {
  const b = e.target.closest('[data-entry]');
  if (b) window.orbit.openEntry(Number(b.dataset.entry));
});

$('cal-trail').addEventListener('click', (e) => {
  const b = e.target.closest('.dot');
  if (!b) return;
  const d = parse(b.dataset.day);
  view = { y: d.getFullYear(), m: d.getMonth() };
  selectDay(b.dataset.day);
});
$('cal-prev').addEventListener('click', () => { view = view.m === 0 ? { y: view.y - 1, m: 11 } : { y: view.y, m: view.m - 1 }; render(); });
$('cal-next').addEventListener('click', () => { view = view.m === 11 ? { y: view.y + 1, m: 0 } : { y: view.y, m: view.m + 1 }; render(); });

function open() {
  cal.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
  document.body.classList.add('cal-open');
  if (!selected) selectDay(todayISO(), { fly: true }); else selectDay(selected, { fly: false });
}
function close() {
  cal.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('cal-open');
  window.orbit.highlightEntries([]);
}
toggle.addEventListener('click', () => (cal.hidden ? open() : close()));
$('cal-close').addEventListener('click', close);
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || cal.hidden) return;
  if (document.body.classList.contains('panel-open')) return; // Esc closes the card first
  if (document.body.classList.contains('adding')) return;      // ...or the Add dialog
  if (e.target.closest?.('input, textarea')) return;
  close();
}, { capture: true }); // runs before the globe's handler closes the card, so one Esc = one layer
// after closing an entry card, keep the selected day lit
window.addEventListener('orbit:close', () => {
  if (!cal.hidden && selected) window.orbit.highlightEntries(byDate.get(selected) || []);
});

/* ---------- boot ---------- */
function index() {
  entries = window.orbit.state.entries;
  byDate = new Map();
  entries.forEach((e, i) => {
    if (!e.date) return;
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(i);
  });
  firstDate = [...byDate.keys()].sort()[0] || null;
}

function onReady() {
  index();
  const now = new Date();
  view = { y: now.getFullYear(), m: now.getMonth() };
  render();
  if (new URLSearchParams(location.search).has('calendar')) open();
}
if (window.orbit?.ready) onReady(); else window.addEventListener('orbit:ready', onReady, { once: true });
// a panel was added: recount days and redraw
window.addEventListener('orbit:entries', () => {
  index();
  if (!view) return;
  render();
  if (!cal.hidden && selected) window.orbit.highlightEntries(byDate.get(selected) || []);
});
