/* ------------------------------------------------------------------ *
 *  An in-page box for pasting a key, token or passphrase.
 *  (The browser's own prompt() is blocked or cramped on some phones.)
 *
 *    const v = await askSecret({ title, help, link, fields: [{ label, placeholder }] })
 *    → array of trimmed values, or null if cancelled
 * ------------------------------------------------------------------ */
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function askSecret({ title, help = '', link = null, fields, submit = 'Save' }) {
  return new Promise((resolve) => {
    const scrim = document.createElement('div');
    scrim.className = 'ask-scrim';
    const box = document.createElement('form');
    box.className = 'ask';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.noValidate = true;
    box.innerHTML = `
      <h2>${esc(title)}</h2>
      ${help ? `<p class="ask-help">${esc(help)}</p>` : ''}
      ${link ? `<a class="ask-link" href="${esc(link.href)}" target="_blank" rel="noopener">${esc(link.text)} ↗</a>` : ''}
      ${fields.map((f, i) => `
        <label class="ask-field">
          <span>${esc(f.label)}</span>
          <span class="ask-row">
            <input type="password" data-i="${i}" placeholder="${esc(f.placeholder || '')}"
                   autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
            <button type="button" class="ask-paste" data-i="${i}">Paste</button>
            <button type="button" class="ask-eye" data-i="${i}" aria-label="Show">Show</button>
          </span>
        </label>`).join('')}
      <p class="ask-note">Kept in this browser only.</p>
      <p class="form-error" hidden></p>
      <div class="ask-actions">
        <button type="button" class="ghost">Cancel</button>
        <button type="submit" class="primary">${esc(submit)}</button>
      </div>`;
    document.body.append(scrim, box);
    document.body.classList.add('asking');
    const inputs = [...box.querySelectorAll('input')];
    const err = box.querySelector('.form-error');
    setTimeout(() => inputs[0].focus(), 50);

    const done = (val) => {
      scrim.remove();
      box.remove();
      document.body.classList.remove('asking');
      resolve(val);
    };
    box.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') done(null); });
    box.querySelector('.ghost').addEventListener('click', () => done(null));
    scrim.addEventListener('click', () => done(null));
    box.addEventListener('click', async (e) => {
      const p = e.target.closest('.ask-paste');
      const eye = e.target.closest('.ask-eye');
      if (p) {
        try {
          inputs[p.dataset.i].value = (await navigator.clipboard.readText()).trim();
          err.hidden = true;
        } catch {
          err.textContent = 'Couldn’t read the clipboard here. Tap the box and paste instead.';
          err.hidden = false;
          inputs[p.dataset.i].focus();
        }
      }
      if (eye) {
        const inp = inputs[eye.dataset.i];
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        eye.textContent = show ? 'Hide' : 'Show';
      }
    });
    box.addEventListener('submit', (e) => {
      e.preventDefault();
      const vals = inputs.map((i) => i.value.trim());
      const empty = vals.findIndex((v) => !v);
      if (empty >= 0) {
        err.textContent = `Paste the ${fields[empty].label.toLowerCase()} first.`;
        err.hidden = false;
        inputs[empty].focus();
        return;
      }
      done(vals);
    });
  });
}
