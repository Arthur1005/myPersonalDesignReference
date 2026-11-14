/* ------------------------------------------------------------------ *
 *  Enlarge images: click the card image or a similar-project image.
 *  Click the image to zoom to full size (drag or scroll to look around),
 *  ← → to step through this panel's images, Esc to close.
 * ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const box = $('lightbox');
const stage = $('lb-stage');
const img = $('lb-img');
const caption = $('lb-caption');

let items = [];
let index = 0;
let zoomed = false;
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
  setZoom(false);
  img.src = it.src;
  img.alt = it.caption || '';
  caption.textContent = items.length > 1 ? `${it.caption || ''}  ·  ${index + 1} / ${items.length}` : (it.caption || '');
  $('lb-prev').hidden = $('lb-next').hidden = items.length < 2;
}

function setZoom(on, at) {
  zoomed = on && (img.naturalWidth > stage.clientWidth || img.naturalHeight > stage.clientHeight);
  box.classList.toggle('zoomed', zoomed);
  if (zoomed && at) {
    // keep the clicked spot under the cursor
    requestAnimationFrame(() => {
      stage.scrollLeft = at.fx * img.naturalWidth - at.x;
      stage.scrollTop = at.fy * img.naturalHeight - at.y;
    });
  }
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
  lastFocus?.focus?.();
}
const step = (d) => { index = (index + d + items.length) % items.length; show(); };

$('lb-close').addEventListener('click', close);
$('lb-prev').addEventListener('click', () => step(-1));
$('lb-next').addEventListener('click', () => step(1));
box.addEventListener('click', (e) => { if (e.target === box || e.target === stage) close(); });

// click to zoom / unzoom; drag to pan when zoomed
let drag = null;
img.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, sl: stage.scrollLeft, st: stage.scrollTop, moved: false };
  if (zoomed) img.setPointerCapture(e.pointerId);
});
img.addEventListener('pointermove', (e) => {
  if (!drag || !zoomed) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
  stage.scrollLeft = drag.sl - dx;
  stage.scrollTop = drag.st - dy;
});
img.addEventListener('pointerup', (e) => {
  const d = drag;
  drag = null;
  if (d?.moved) return;
  if (zoomed) { setZoom(false); return; }
  const r = img.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  setZoom(true, { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, x: e.clientX - sr.left, y: e.clientY - sr.top });
});

// keys: handled first, so Esc closes only the viewer (not the card behind it)
window.addEventListener('keydown', (e) => {
  if (box.hidden) return;
  e.stopPropagation();
  if (e.key === 'Escape') { e.preventDefault(); close(); }
  else if (e.key === 'ArrowLeft' && items.length > 1) step(-1);
  else if (e.key === 'ArrowRight' && items.length > 1) step(1);
  else if (e.key === ' ' || e.key === 'z') { e.preventDefault(); setZoom(!zoomed); }
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
