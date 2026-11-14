/* ------------------------------------------------------------------ *
 *  "+ Add": create a new panel from an image on your device (owner only).
 *  The panel appears on the globe straight away and is saved to the repo
 *  with everything else when you press "Save to GitHub".
 * ------------------------------------------------------------------ */
import { editMode, createEntry, whenReady } from './store.js';

const $ = (id) => document.getElementById(id);
const openBtn = $('add-open');
const dialog = $('add-dialog');
const scrim = $('add-scrim');
const fileInput = $('add-file');
const drop = $('add-drop');
const preview = $('add-preview');
const nameInput = $('add-name');
const dateInput = $('add-date');
const noteInput = $('add-note');
const errFile = $('add-err-file');
const errName = $('add-err-name');
const submit = $('add-submit');

let file = null;
let previewUrl = null;

const localISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function setFile(f) {
  if (!f) return;
  if (!f.type.startsWith('image/')) { showErr(errFile, 'That isn’t an image. Try a JPG, PNG, WebP, SVG or GIF.'); return; }
  file = f;
  errFile.hidden = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(f);
  preview.src = previewUrl;
  preview.hidden = false;
  drop.classList.add('has-image');
  $('add-drop-text').innerHTML = '<b>Change image</b>';
  // suggest a title from the file name if none yet
  if (!nameInput.value.trim()) {
    nameInput.value = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    nameInput.select();
  }
}

function showErr(el, msg) { el.textContent = msg; el.hidden = false; }

function reset() {
  file = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  preview.hidden = true;
  preview.removeAttribute('src');
  drop.classList.remove('has-image');
  $('add-drop-text').innerHTML = '<b>Choose an image</b><small>or drop it here · JPG, PNG, WebP, SVG, GIF</small>';
  nameInput.value = '';
  noteInput.value = '';
  dateInput.value = localISO();
  dateInput.max = localISO();
  errFile.hidden = errName.hidden = true;
  nameInput.removeAttribute('aria-invalid');
  submit.disabled = false;
  submit.textContent = 'Light up a panel';
}

function open() {
  reset();
  dialog.hidden = scrim.hidden = false;
  document.body.classList.add('adding');
  requestAnimationFrame(() => drop.focus?.());
}
function close() {
  dialog.hidden = scrim.hidden = true;
  document.body.classList.remove('adding');
}

openBtn.addEventListener('click', open);
$('add-close').addEventListener('click', close);
$('add-cancel').addEventListener('click', close);
scrim.addEventListener('click', close);
dialog.addEventListener('keydown', (e) => {
  e.stopPropagation();                       // keep keys away from the globe / calendar
  if (e.key === 'Escape') close();
});

fileInput.addEventListener('change', () => { setFile(fileInput.files[0]); fileInput.value = ''; });
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('over')));
drop.addEventListener('drop', (e) => { e.preventDefault(); setFile(e.dataTransfer.files[0]); });
// paste an image straight from the clipboard
dialog.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (item) { e.preventDefault(); setFile(item.getAsFile()); }
});
nameInput.addEventListener('input', () => { errName.hidden = true; nameInput.removeAttribute('aria-invalid'); });

dialog.addEventListener('submit', async (e) => {
  e.preventDefault();
  let ok = true;
  if (!file) { showErr(errFile, 'Choose an image first.'); ok = false; }
  if (!nameInput.value.trim()) {
    showErr(errName, 'Give it a title.');
    nameInput.setAttribute('aria-invalid', 'true');
    if (ok) nameInput.focus();
    ok = false;
  }
  if (!ok) return;
  submit.disabled = true;
  submit.textContent = 'Adding…';
  try {
    const index = await createEntry({
      file,
      title: nameInput.value,
      date: dateInput.value || localISO(),
      note: noteInput.value,
    });
    close();
    // open the new panel so keywords / links can be added right away
    setTimeout(() => window.orbit.openEntry(index), 250);
  } catch (err) {
    showErr(errFile, `Couldn’t add it: ${err.message}`);
    submit.disabled = false;
    submit.textContent = 'Light up a panel';
  }
});

whenReady(() => { openBtn.hidden = !editMode; });
