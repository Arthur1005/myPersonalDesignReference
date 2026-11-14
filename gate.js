/* ------------------------------------------------------------------ *
 *  Welcome panel + owner login.
 *
 *  Everyone lands on a welcome panel and views the site read-only.
 *  The owner unlocks editing from the lock icon in the bottom-left corner.
 *
 *  NOTE: this is a static site, so the PIN locks the editing *interface*,
 *  not the data. It is stored only as a slow PBKDF2 hash. What actually
 *  protects the repo is the GitHub token, which lives only in your own
 *  browser; without it nothing can be saved.
 *
 *  To change the PIN, run (Python):
 *    import hashlib; print(hashlib.pbkdf2_hmac('sha256', b'NEWPIN',
 *          b'design-orbit/pin/v1', 150000).hex())
 *  and paste the result into PIN_HASH.
 * ------------------------------------------------------------------ */

const PIN_HASH = '9033a1f6c0505c9af53b8769f8473f8a3cc23a74c9d1ca3723353d5eb6939ab5';
const PIN_SALT = 'design-orbit/pin/v1';
const PIN_ITER = 150000;
const PIN_LEN = 6;

const KEY = 'designOrbit.access';          // 'owner' when unlocked
const WELCOMED = 'designOrbit.welcomed';   // welcome panel seen this session
const get = (s, k) => { try { return s.getItem(k); } catch { return null; } };
const set = (s, k, v) => { try { s.setItem(k, v); } catch { /* ignore */ } };
const del = (s, k) => { try { s.removeItem(k); } catch { /* ignore */ } };

/** 'owner' or 'guest'. Changing it reloads the page so every part picks it up. */
export const access =
  get(sessionStorage, KEY) === 'owner' || get(localStorage, KEY) === 'owner' ? 'owner' : 'guest';

async function hashPin(pin) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(PIN_SALT), iterations: PIN_ITER }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Lock editing again. */
export function lock() {
  del(sessionStorage, KEY);
  del(localStorage, KEY);
  location.reload();
}

/* ---------- welcome panel (once per session, never for the owner) ---------- */
const gate = document.getElementById('gate');
if (access !== 'owner' && !get(sessionStorage, WELCOMED)) {
  gate.hidden = false;
  document.body.classList.add('gated');
  const enter = document.getElementById('gate-enter');
  requestAnimationFrame(() => enter.focus());
  const go = () => {
    set(sessionStorage, WELCOMED, '1');
    gate.classList.add('leaving');
    document.body.classList.remove('gated');
    setTimeout(() => { gate.hidden = true; }, 400);
  };
  enter.addEventListener('click', go);
  gate.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') go(); });
}

/* ---------- lock icon + PIN pop-up (bottom left) ---------- */
const btn = document.getElementById('lock-btn');
const pop = document.getElementById('lock-pop');
const boxes = [...pop.querySelectorAll('.pin input')];
const err = document.getElementById('gate-error');
const remember = document.getElementById('gate-remember');

btn.classList.toggle('unlocked', access === 'owner');
btn.title = access === 'owner' ? 'Editing unlocked · click to lock' : 'Owner login';
btn.setAttribute('aria-label', access === 'owner' ? 'Lock editing' : 'Owner login');

function openPop() {
  pop.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  err.hidden = true;
  boxes.forEach((b) => { b.value = ''; });
  requestAnimationFrame(() => boxes[0].focus());
}
function closePop() {
  pop.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
}
btn.addEventListener('click', () => {
  if (access === 'owner') { lock(); return; }   // unlocked: one click locks straight away
  if (pop.hidden) openPop(); else closePop();
});
document.addEventListener('pointerdown', (e) => {
  if (!pop.hidden && !e.target.closest('#owner')) closePop();
});
pop.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') { closePop(); btn.focus(); }
});

let fails = 0;
let lockedUntil = 0;
let busy = false;
const pinValue = () => boxes.map((b) => b.value).join('');

async function tryUnlock() {
  const pin = pinValue();
  if (pin.length < PIN_LEN || busy) return;
  const wait = Math.ceil((lockedUntil - Date.now()) / 1000);
  if (wait > 0) { err.textContent = `Too many tries — wait ${wait}s`; err.hidden = false; return; }
  busy = true;
  pop.classList.add('checking');
  let ok = false;
  try { ok = (await hashPin(pin)) === PIN_HASH; } catch { err.textContent = 'This browser can’t check the PIN here (needs https).'; err.hidden = false; }
  pop.classList.remove('checking');
  busy = false;
  if (ok) {
    set(sessionStorage, KEY, 'owner');
    set(sessionStorage, WELCOMED, '1');
    if (remember.checked) set(localStorage, KEY, 'owner');
    location.reload();               // every part of the site re-reads who you are
    return;
  }
  fails++;
  if (fails >= 5) { lockedUntil = Date.now() + 30000; fails = 0; }
  err.textContent = lockedUntil > Date.now() ? 'Too many tries — wait 30s' : 'Wrong PIN';
  err.hidden = false;
  pop.classList.remove('shake');
  void pop.offsetWidth;
  pop.classList.add('shake');
  boxes.forEach((b) => { b.value = ''; });
  boxes[0].focus();
}

boxes.forEach((box, i) => {
  box.addEventListener('input', () => {
    err.hidden = true;
    const digits = box.value.replace(/\D/g, '');
    if (digits.length > 1) {                      // pasted the whole PIN
      digits.slice(0, PIN_LEN - i).split('').forEach((d, j) => { boxes[i + j].value = d; });
      boxes[Math.min(i + digits.length, PIN_LEN - 1)].focus();
    } else {
      box.value = digits;
      if (digits && i < PIN_LEN - 1) boxes[i + 1].focus();
    }
    if (pinValue().length === PIN_LEN) tryUnlock();
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !box.value && i > 0) { boxes[i - 1].value = ''; boxes[i - 1].focus(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
    else if (e.key === 'ArrowRight' && i < PIN_LEN - 1) boxes[i + 1].focus();
    else if (e.key === 'Enter') tryUnlock();
  });
  box.addEventListener('focus', () => box.select());
});
