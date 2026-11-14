/* ------------------------------------------------------------------ *
 *  Entry gate: owner PIN or guest (view only).
 *
 *  NOTE: this is a static site, so this is a lock on the editing UI,
 *  not real security. The PIN is stored only as a slow PBKDF2 hash.
 *  What actually protects your repo is the GitHub token, which lives
 *  only in your own browser; without it nothing can be saved.
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

const KEY = 'designOrbit.access';
const get = (s, k) => { try { return s.getItem(k); } catch { return null; } };
const set = (s, k, v) => { try { s.setItem(k, v); } catch { /* ignore */ } };
const del = (s, k) => { try { s.removeItem(k); } catch { /* ignore */ } };

async function hashPin(pin) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(PIN_SALT), iterations: PIN_ITER }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Forget the choice and show the gate again. */
export function lock() {
  del(sessionStorage, KEY);
  del(localStorage, KEY);
  location.reload();
}

function remembered() {
  return get(sessionStorage, KEY) || (get(localStorage, KEY) === 'owner' ? 'owner' : null);
}

function showGate() {
  return new Promise((resolve) => {
    const gate = document.getElementById('gate');
    const boxes = [...gate.querySelectorAll('.pin input')];
    const err = document.getElementById('gate-error');
    const remember = document.getElementById('gate-remember');
    let fails = 0;
    let lockedUntil = 0;
    let busy = false;

    const stepGuest = document.getElementById('gate-step-guest');
    const stepPin = document.getElementById('gate-step-pin');
    const showStep = (pin) => {
      stepGuest.hidden = pin;
      stepPin.hidden = !pin;
      (pin ? stepPin : stepGuest).classList.add('enter');
      requestAnimationFrame(() => (pin ? boxes[0] : document.getElementById('gate-guest')).focus());
    };

    gate.hidden = false;
    document.body.classList.add('gated');
    showStep(false);
    document.getElementById('gate-owner').addEventListener('click', () => showStep(true));
    document.getElementById('gate-back').addEventListener('click', () => {
      err.hidden = true;
      boxes.forEach((b) => { b.value = ''; });
      showStep(false);
    });

    const finish = (mode) => {
      set(sessionStorage, KEY, mode);
      if (mode === 'owner' && remember.checked) set(localStorage, KEY, 'owner');
      gate.classList.add('leaving');
      document.body.classList.remove('gated');
      setTimeout(() => { gate.hidden = true; }, 400);
      resolve(mode);
    };

    const pinValue = () => boxes.map((b) => b.value).join('');
    const clear = () => { boxes.forEach((b) => { b.value = ''; }); boxes[0].focus(); };

    async function tryUnlock() {
      const pin = pinValue();
      if (pin.length < PIN_LEN || busy) return;
      const wait = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (wait > 0) { err.textContent = `Too many tries — wait ${wait}s`; err.hidden = false; return; }
      busy = true;
      gate.classList.add('checking');
      let ok = false;
      try { ok = (await hashPin(pin)) === PIN_HASH; } catch { err.textContent = 'This browser can’t check the PIN here (needs https).'; err.hidden = false; }
      gate.classList.remove('checking');
      busy = false;
      if (ok) return finish('owner');
      fails++;
      if (fails >= 5) { lockedUntil = Date.now() + 30000; fails = 0; }
      err.textContent = lockedUntil > Date.now() ? 'Too many tries — wait 30s' : 'Wrong PIN';
      err.hidden = false;
      gate.classList.remove('shake');
      void gate.offsetWidth;
      gate.classList.add('shake');
      clear();
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
        e.stopPropagation();
        if (e.key === 'Backspace' && !box.value && i > 0) { boxes[i - 1].value = ''; boxes[i - 1].focus(); e.preventDefault(); }
        else if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
        else if (e.key === 'ArrowRight' && i < PIN_LEN - 1) boxes[i + 1].focus();
        else if (e.key === 'Enter') tryUnlock();
        else if (e.key === 'Escape') document.getElementById('gate-back').click();
      });
      box.addEventListener('focus', () => box.select());
    });
    document.getElementById('gate-guest').addEventListener('click', () => finish('guest'));
  });
}

/** Resolves to 'owner' or 'guest' once the visitor has chosen. */
export const access = remembered() || await showGate();

// Masthead: who you are + lock / unlock
const role = document.getElementById('role');
if (role) {
  role.hidden = false;
  role.textContent = access === 'owner' ? 'Owner · Lock' : 'Guest · Unlock';
  role.classList.toggle('owner', access === 'owner');
  role.addEventListener('click', lock);
}
