/* ------------------------------------------------------------------ *
 *  The "Design Orbit" logo: each letter you pass over turns into a small
 *  design element (shape, crosshair, bezier node…) and eases back after.
 *  On touch screens, tapping the logo ripples through every letter.
 * ------------------------------------------------------------------ */
const h1 = document.querySelector('.masthead h1');

// drawn on a 24×24 grid, stroked in the letter's colour so they sit like type
const SHAPES = [
  '<circle cx="12" cy="12" r="8.5"/>',                                                         // circle
  '<rect x="4" y="4" width="16" height="16"/>',                                                // square
  '<path d="M12 3.5L21 20H3z"/>',                                                             // triangle
  '<circle cx="12" cy="12" r="6"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5"/>',          // crosshair
  '<ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-25 12 12)"/><circle cx="12" cy="12" r="3" class="f"/>', // orbit
  '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',                            // grid
  '<path d="M3 19C7 5 17 19 21 5"/><rect x="1.5" y="17.5" width="3" height="3" class="f"/><rect x="19.5" y="3.5" width="3" height="3" class="f"/>', // bezier
  '<path d="M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z"/>',                   // sparkle
  '<path d="M4 20A8 8 0 0 1 20 20zM12 4v8"/>',                                               // half circle
  '<path d="M3 12c3-6 6 6 9 0s6 6 9 0"/>',                                                    // wave
  '<path d="M12 2.5l8.5 4.75v9.5L12 21.5 3.5 16.75v-9.5z"/>',                                 // hexagon
  '<circle cx="12" cy="12" r="2.5" class="f"/><circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>', // dashed ring
];

// tall, slim ones for narrow letters like I, so they fill the letter's own space and no more
const NARROW = [
  '<rect x="2" y="2" width="6" height="20" rx="3"/>',                                          // capsule
  '<path d="M5 2v20"/><circle cx="5" cy="12" r="2.6" class="f"/>',                              // slider
  '<path d="M5 2v4M5 10v4M5 18v4"/>',                                                         // dashed rule
  '<path d="M5 2v14"/><circle cx="5" cy="19.5" r="2.5"/>',                                     // pin
  '<path d="M2 2h6M5 2v20M2 22h6"/>',                                                         // I-beam
  '<path d="M5 2l3 5-3 5-3-5zM5 12l3 5-3 5-3-5z"/>',                                         // stacked diamonds
],
  SLIM_EM = 0.5;   // letters narrower than this (in em) get a slim shape

if (h1) {
  const text = h1.textContent.trim();
  h1.setAttribute('aria-label', text);
  h1.textContent = '';
  const cells = [...text].map((ch) => {
    const s = document.createElement('span');
    s.className = ch === ' ' ? 'lg-gap' : 'lg-ch';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = ch === ' ' ? ' ' : ch;
    s.dataset.ch = ch;
    h1.append(s);
    return s;
  }).filter((s) => s.className === 'lg-ch');

  let last = -1;
  const pick = () => { let k; do { k = Math.floor(Math.random() * SHAPES.length); } while (k === last); last = k; return k; };

  function morph(s) {
    clearTimeout(s._back);
    if (!s.classList.contains('shape')) {
      // keep the letter's width so nothing around it shifts
      const w = s.getBoundingClientRect().width;
      s.style.width = `${w}px`;
      const em = parseFloat(getComputedStyle(s).fontSize) || 30;
      const slim = (w - em * 0.12) / em < SLIM_EM;
      s.innerHTML = slim
        ? `<svg class="slim" viewBox="0 0 10 24" aria-hidden="true">${NARROW[Math.floor(Math.random() * NARROW.length)]}</svg>`
        : `<svg viewBox="0 0 24 24" aria-hidden="true">${SHAPES[pick()]}</svg>`;
      s.classList.add('shape');
      s.classList.toggle('blue', Math.random() < 0.45);
    }
  }
  function restore(s, delay = 650) {
    clearTimeout(s._back);
    s._back = setTimeout(() => {
      s.classList.add('out');
      setTimeout(() => {
        s.classList.remove('shape', 'blue', 'out');
        s.textContent = s.dataset.ch;
        s.style.width = '';
      }, 160);
    }, delay);
  }

  for (const s of cells) {
    s.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') morph(s); });
    s.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') restore(s); });
  }
  // touch: a tap sends a ripple through the whole word
  h1.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') return;
    cells.forEach((s, i) => setTimeout(() => { morph(s); restore(s, 700); }, i * 55));
  });
}
