/* ------------------------------------------------------------------ *
 *  Enlarge images: click the card image or a similar-project image.
 *  In the viewer the cursor becomes a magnifying glass that enlarges only
 *  the spot under it (scroll to change how strong it is).
 *  ← → to step through this panel's images, Esc to close.
 * ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const box = $('lightbox');
const stage = $('lb-stage');
const img = $('lb-img');
const caption = $('lb-caption');

let items = [];
let index = 0;
const loupe = $('lb-loupe');
let power = 2.5;          // magnification (scroll wheel changes it)
let lastFocus = null;

const resolve = (p) => (window.orbit?.resolveImage ? window.orbit.resolveImage(p) : p);

/** Images of the open panel: the main image, then its similar projects. */
function panelItems() {
  const st = window.orbit?.state;
  const e = st && st.entries[st.current];
  if (!e) return [];
  return [
    { src: resolve(e.image), caption: e.title },
    ...(e.similar || []).map((s) => ({ src: resolve(s.image), caption: s.caption || 'Similar project' })),
  ];
}

function show() {
  const it = items[index];
  if (!it) return;
  loupe.hidden = true;
  img.src = it.src;
  img.alt = it.caption || '';
  caption.textContent = items.length > 1 ? `${it.caption || ''}  ·  ${index + 1} / ${items.length}` : (it.caption || '');
  $('lb-prev').hidden = $('lb-next').hidden = items.length < 2;
}

export function openLightbox(list, start = 0) {
  items = list;
  index = start;
  lastFocus = document.activeElement;
  box.hidden = false;
  document.body.classList.add('lightbox-open');
  show();
  $('lb-close').focus();
}
function close() {
  box.hidden = true;
  document.body.classList.remove('lightbox-open');
  img.removeAttribute('src');
  loupe.hidden = true;
  lastFocus?.focus?.();
}
const step = (d) => { index = (index + d + items.length) % items.length; show(); };

$('lb-close').addEventListener('click', close);
$('lb-prev').addEventListener('click', () => step(-1));
$('lb-next').addEventListener('click', () => step(1));
box.addEventListener('click', (e) => { if (e.target === box || e.target === stage) close(); });

// magnifying glass: follows the pointer and enlarges only the spot under it
const LENS = 220;   // lens diameter in px
function moveLoupe(e) {
  const r = img.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  if (x < 0 || y < 0 || x > r.width || y > r.height || !img.naturalWidth) { loupe.hidden = true; return; }
  // never blurrier than the real pixels: go at least to the image's full resolution
  const k = Math.max(power, Math.min(8, img.naturalWidth / r.width));
  loupe.hidden = false;
  loupe.style.transform = `translate(${e.clientX - LENS / 2}px, ${e.clientY - LENS / 2}px)`;
  loupe.style.backgroundImage = `url("${img.src}")`;
  loupe.style.backgroundSize = `${r.width * k}px ${r.height * k}px`;
  loupe.style.backgroundPosition = `${LENS / 2 - x * k}px ${LENS / 2 - y * k}px`;
}
img.addEventListener('pointermove', moveLoupe);
img.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') { img.setPointerCapture(e.pointerId); moveLoupe(e); } });
img.addEventListener('pointerleave', () => { loupe.hidden = true; });
img.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') loupe.hidden = true; });
img.addEventListener('wheel', (e) => {
  e.preventDefault();
  power = Math.min(8, Math.max(1.5, power * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
  moveLoupe(e);
}, { passive: false });

// keys: handled first, so Esc closes only the viewer (not the card behind it)
window.addEventListener('keydown', (e) => {
  if (box.hidden) return;
  e.stopPropagation();
  if (e.key === 'Escape') { e.preventDefault(); close(); }
  else if (e.key === 'ArrowLeft' && items.length > 1) step(-1);
  else if (e.key === 'ArrowRight' && items.length > 1) step(1);
}, { capture: true });

/* ---------- hooks into the card ---------- */
const cardImg = $('p-image');
cardImg.addEventListener('click', () => openLightbox(panelItems(), 0));
cardImg.title = 'Click to enlarge';

$('similar').addEventListener('click', (e) => {
  const a = e.target.closest('[data-view]');
  if (!a) return;
  e.preventDefault();
  openLightbox(panelItems(), Number(a.dataset.view) + 1);
});

// video: pause and magnify the frame that's showing
$('vid-magnify').addEventListener('click', () => {
  const v = $('p-video');
  if (!v.videoWidth) return;
  v.pause();
  const c = document.createElement('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  try { c.toBlob(done, 'image/jpeg', 0.92); } catch { /* the bucket's CORS setting doesn't allow reading frames */ }
  function done(blob) {
    if (!blob) return;
    const st = window.orbit.state;
    const t = Math.floor(v.currentTime);
    openLightbox([{ src: URL.createObjectURL(blob), caption: `${st.entries[st.current]?.title || ''}  ·  frame at ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` }], 0);
  }
});

/* ---------- one-click copy of the card's image (or the video's current frame) ---------- */
/** Load an SVG at 1600px on its long side (many SVGs carry a tiny or missing size). */
async function sizedSvg(url) {
  const doc = new DOMParser().parseFromString(await (await fetch(url)).text(), 'image/svg+xml');
  const svg = doc.documentElement;
  const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  const w0 = parseFloat(svg.getAttribute('width')) || vb[2] || 300;
  const h0 = parseFloat(svg.getAttribute('height')) || vb[3] || 150;
  const k = 1600 / Math.max(w0, h0);
  svg.setAttribute('width', Math.round(w0 * k));
  svg.setAttribute('height', Math.round(h0 * k));
  const blobUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  const img = new Image();
  img.src = blobUrl;
  await img.decode();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  return img;
}

async function pngOf(source) {
  const w = source.videoWidth || source.naturalWidth;
  const h = source.videoHeight || source.naturalHeight;
  const k = Math.min(1, 2400 / Math.max(w, h)) || 1;   // never bigger than 2400px
  const c = document.createElement('canvas');
  c.width = Math.round((w || 1200) * k);
  c.height = Math.round((h || 900) * k);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('blank'))), 'image/png'));
}
$('p-copy').addEventListener('click', async () => {
  const b = $('p-copy');
  const v = $('p-video');
  const say = (t) => { b.textContent = t; clearTimeout(b._t); b._t = setTimeout(() => { b.textContent = 'Copy image'; }, 1800); };
  b.textContent = 'Copying…';
  try {
    let src = v.hidden ? $('p-image') : v;
    const url = src.currentSrc || src.src || '';
    if (src === $('p-image') && /\.svg(\?|$)/i.test(url)) src = await sizedSvg(url);   // logos: copy sharp, not tiny
    // Safari only allows the write if it starts straight away, so it gets the image as a promise;
    // other browsers get the finished image (some never settle when handed a promise)
    const safari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
    const png = safari ? pngOf(src) : await pngOf(src);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    say('Copied ✓');
  } catch (err) {
    console.warn('copy failed', err);
    say('Couldn’t copy');
  }
});
