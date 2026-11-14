/* ------------------------------------------------------------------ *
 *  "Related on your globe": suggests other panels like the open one.
 *
 *  Score =  shared keywords   (rarer keywords count for more)
 *        +  same website      (links to the same domain)
 *        +  similar colours   (main colours read from each image)
 *        +  a tiny nudge for panels added around the same time (tie-breaker only)
 *  Each suggestion shows why it was picked.
 * ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const MAX = 4;

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const keywordsOf = (e) => e.keywords || e.tags || [];
const linksOf = (e) => e.links || (e.link ? [{ url: e.link }] : []);
function domainsOf(e) {
  const out = new Set();
  for (const l of linksOf(e)) { try { out.add(new URL(l.url).hostname.replace(/^www\./, '')); } catch { /* skip */ } }
  return out;
}

const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const labToCss = ([L, A, B]) => {
  // Lab -> sRGB for the little colour swatches
  const fy = (L + 16) / 116, fx = fy + A / 500, fz = fy - B / 200;
  const inv = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const x = inv(fx) * 0.95047, y = inv(fy), z = inv(fz) * 1.08883;
  const lin = [x * 3.2406 + y * -1.5372 + z * -0.4986, x * -0.9689 + y * 1.8758 + z * 0.0415, x * 0.0557 + y * -0.204 + z * 1.057];
  const g = lin.map((c) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055))));
  return `rgb(${g.join(',')})`;
};

/** 0..1: how alike two palettes are (each main colour matched to its closest, weighted by area). */
function paletteMatch(p, q) {
  if (!p || !q) return { sim: 0 };
  let total = 0, wsum = 0, best = null;
  for (const c of p) {
    let m = Infinity, partner = null;
    for (const d of q) { const e = deltaE(c.lab, d.lab); if (e < m) { m = e; partner = d; } }
    total += c.share * m;
    wsum += c.share;
    if (!best || c.share * (1 / (1 + m)) > best.w) best = { w: c.share * (1 / (1 + m)), a: c.lab, b: partner.lab };
  }
  const avg = total / (wsum || 1);
  return { sim: Math.max(0, 1 - avg / 30), pair: best };   // deltaE ~30 = clearly different
}

function score(base, other, df, n, palettes) {
  let s = 0;
  const reasons = [];
  // keywords
  const mine = new Set(keywordsOf(base));
  const shared = keywordsOf(other).filter((k) => mine.has(k));
  for (const k of shared) s += 1 + Math.log(n / (df.get(k) || 1));
  if (shared.length) reasons.push({ type: 'kw', words: shared });
  // same website
  const dom = [...domainsOf(base)].filter((d) => domainsOf(other).has(d));
  if (dom.length) { s += 1.5 * dom.length; reasons.push({ type: 'site', domains: dom }); }
  // colours
  const pm = paletteMatch(palettes.get(base), palettes.get(other));
  if (pm.sim > 0.45) { s += pm.sim * 2; reasons.push({ type: 'colour', pair: pm.pair }); }
  // close in time: tie-breaker only
  const days = Math.abs((Date.parse(base.date) - Date.parse(other.date)) / 864e5);
  const time = Number.isFinite(days) ? Math.max(0, 0.3 - days * 0.02) : 0;
  return { s, reasons, total: s + time };
}

function render() {
  const st = window.orbit?.state;
  if (!st || st.current < 0) return;
  const list = st.entries;
  const base = list[st.current];
  if (!base) return;

  const df = new Map();
  for (const e of list) for (const k of new Set(keywordsOf(e))) df.set(k, (df.get(k) || 0) + 1);

  const ranked = list
    .map((e, i) => ({ e, i, ...score(base, e, df, list.length, st.palettes) }))
    .filter((r) => r.e !== base && r.s > 0.5)
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX);

  const sec = $('related-sec');
  const editing = document.body.classList.contains('editing');
  if (!ranked.length) {
    sec.hidden = !editing;
    $('related').innerHTML = `<li class="empty-note">${keywordsOf(base).length
      ? 'Nothing related yet — it’ll fill in as more panels share keywords, sites or colours.'
      : 'Add keywords to find related panels.'}</li>`;
    return;
  }
  sec.hidden = false;
  const img = (p) => (window.orbit.resolveImage ? window.orbit.resolveImage(p) : p);
  $('related').innerHTML = ranked.map((r) => {
    const why = r.reasons.map((x) => {
      if (x.type === 'kw') return x.words.map((w) => `<span class="why kw">${esc(w)}</span>`).join('');
      if (x.type === 'site') return `<span class="why site">${esc(x.domains[0])}</span>`;
      return `<span class="why colour"><i style="background:${labToCss(x.pair.a)}"></i><i style="background:${labToCss(x.pair.b)}"></i>colours</span>`;
    }).join('');
    return `<li><button type="button" data-open="${r.i}">
        <img src="${esc(img(r.e.image))}" alt="" loading="lazy" />
        <span class="rel-text"><b>${esc(r.e.title)}</b><span class="rel-why">${why}</span></span>
      </button></li>`;
  }).join('');
}

$('related').addEventListener('click', (e) => {
  const b = e.target.closest('[data-open]');
  if (b) window.orbit.openEntry(Number(b.dataset.open));
});
window.addEventListener('orbit:open', () => requestAnimationFrame(render));
// colours are read as images load; refresh suggestions (at most once per frame) when new ones arrive
let pending = 0;
window.addEventListener('orbit:palette', () => {
  if (pending || !(window.orbit?.state.current >= 0)) return;
  pending = requestAnimationFrame(() => { pending = 0; render(); });
});
// keywords/links edited while the card is open → refresh
for (const id of ['kw-chips', 'links']) {
  new MutationObserver(() => { if (window.orbit?.state.current >= 0) render(); }).observe($(id), { childList: true });
}
