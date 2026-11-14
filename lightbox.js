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
