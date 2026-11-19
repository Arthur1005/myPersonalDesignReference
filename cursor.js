/* ------------------------------------------------------------------ *
 *  Globe cursor (mouse only): a reticle (thin ring + blue dot) that
 *  becomes viewfinder brackets over a lit panel. Dashed and spinning in
 *  follow mode; tightens while dragging. Over buttons, cards and text
 *  the normal cursor comes back.
 *  (The satellite and plain viewfinder styles are still in style.css.)
 * ------------------------------------------------------------------ */
const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

const canvas = document.getElementById('scene');
const el = document.getElementById('cursor');
const ring = el.querySelector('.c-ring');

const style = 'combo';

let x = -100, y = -100;      // pointer
let rx = -100, ry = -100;    // ring/brackets, eased behind the pointer
let over = false;
let raf = 0;

function apply() {
  el.dataset.style = style;
  document.body.classList.toggle('custom-cursor', fine && style !== 'classic');
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
}

apply();
