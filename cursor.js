/* ------------------------------------------------------------------ *
 *  Custom cursors for the globe (mouse only). Three styles to compare:
 *   reticle    – thin ring + blue centre dot
 *   satellite  – a dot with a small satellite circling it
 *   viewfinder – four corner brackets
 *   classic    – the normal system cursor
 *  Each reacts to: a lit panel under it, follow mode, and dragging.
 *  Over buttons, cards and text the normal cursor comes back.
 * ------------------------------------------------------------------ */
const STYLES = ['reticle', 'satellite', 'viewfinder', 'classic'];
const KEY = 'designOrbit.cursor';
const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

const canvas = document.getElementById('scene');
const el = document.getElementById('cursor');
const ring = el.querySelector('.c-ring');
const switcher = document.getElementById('cursor-switch');

let style = 'reticle';
try { const s = localStorage.getItem(KEY); if (STYLES.includes(s)) style = s; } catch { /* ignore */ }

let x = -100, y = -100;      // pointer
let rx = -100, ry = -100;    // ring/brackets, eased behind the pointer
let over = false;
let raf = 0;

function apply() {
  el.dataset.style = style;
  document.body.classList.toggle('custom-cursor', fine && style !== 'classic');
  switcher?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cursor === style)));
  try { localStorage.setItem(KEY, style); } catch { /* ignore */ }
}

function frame() {
  raf = 0;
  const k = 0.32;                                 // how tightly the ring trails the dot
  rx += (x - rx) * k;
  ry += (y - ry) * k;
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  ring.style.transform = `translate3d(${rx - x}px, ${ry - y}px, 0)`;
  if (Math.abs(x - rx) + Math.abs(y - ry) > 0.3) raf = requestAnimationFrame(frame);
}

function update(e) {
  x = e.clientX; y = e.clientY;
  over = e.target === canvas;
  const on = fine && style !== 'classic' && over && !document.body.classList.contains('panel-open');
  el.classList.toggle('show', on);
  el.classList.toggle('on-panel', canvas.classList.contains('pointer'));
  el.classList.toggle('following', document.body.classList.contains('following'));
  el.classList.toggle('pressing', e.buttons > 0);
  if (!raf) raf = requestAnimationFrame(frame);
}

if (fine) {
  window.addEventListener('pointermove', update, { passive: true });
  window.addEventListener('pointerdown', update);
  window.addEventListener('pointerup', update);
  document.addEventListener('pointerleave', () => el.classList.remove('show'));
  window.addEventListener('blur', () => el.classList.remove('show'));
  // hover state is decided once per frame in main.js; catch up right after
  const mo = new MutationObserver(() => {
    el.classList.toggle('on-panel', canvas.classList.contains('pointer'));
    el.classList.toggle('following', document.body.classList.contains('following'));
  });
  mo.observe(canvas, { attributes: true, attributeFilter: ['class'] });
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
} else if (switcher) {
  switcher.hidden = true;
}

switcher?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cursor]');
  if (!b) return;
  style = b.dataset.cursor;
  apply();
});

apply();
