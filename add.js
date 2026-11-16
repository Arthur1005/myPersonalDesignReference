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
const vpreview = $('add-vpreview');
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

const MAX_VIDEO_MB = 25;   // videos live in the GitHub repo, so keep them short and light
const isVideo = (f) => f.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(f.name);

/** From a video: one still for lists and cards, plus a few small frames for the globe to flip through. */
const FRAME_COUNT = 4;
async function stillsFrom(f) {
  const url = URL.createObjectURL(f);
  try {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    await new Promise((res, rej) => {
      v.onloadeddata = res;
      v.onerror = () => rej(new Error('this video can’t be played in the browser. Try an MP4 (H.264) or WebM.'));
    });
    const base = f.name.replace(/\.[^.]+$/, '');
    const grab = async (at, maxSide, name) => {
      v.currentTime = Math.min(Math.max(0, (v.duration || 0) - 0.05), at);
      await new Promise((res) => { v.onseeked = res; setTimeout(res, 2000); });
      const scale = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(v.videoWidth * scale);
      c.height = Math.round(v.videoHeight * scale);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
      return new File([blob], `${base}-${name}.jpg`, { type: 'image/jpeg' });
    };
    const d = v.duration || 0;
    const poster = await grab(Math.min(1, d * 0.1), 1280, 'poster');
    const frames = [];
    for (let i = 0; i < FRAME_COUNT; i++) frames.push(await grab(d * ((i + 0.5) / FRAME_COUNT), 640, `frame${i + 1}`));
    return { poster, frames };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function setFile(f) {
  if (!f) return;
  const video = isVideo(f);
  if (!video && !f.type.startsWith('image/')) { showErr(errFile, 'That isn’t an image or a video.'); return; }
  if (video && f.size > MAX_VIDEO_MB * 1e6) {
    showErr(errFile, `That video is ${(f.size / 1e6).toFixed(0)} MB. Keep videos under ${MAX_VIDEO_MB} MB (a short clip, or export it smaller).`);
    return;
  }
  file = f;
  errFile.hidden = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(f);
  preview.hidden = video;
  vpreview.hidden = !video;
  if (video) { preview.removeAttribute('src'); vpreview.src = previewUrl; vpreview.play?.().catch(() => {}); }
  else { vpreview.removeAttribute('src'); vpreview.load?.(); preview.src = previewUrl; }
  drop.classList.add('has-image');
  $('add-drop-text').innerHTML = video ? '<b>Change video</b>' : '<b>Change image</b>';
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
  vpreview.hidden = true;
  vpreview.removeAttribute('src');
  vpreview.load?.();
  drop.classList.remove('has-image');
  $('add-drop-text').innerHTML = '<b>Choose an image or video</b><small>or drop it here · images, or MP4 / WebM up to 25 MB</small>';
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
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/') || i.type.startsWith('video/'));
  if (item) { e.preventDefault(); setFile(item.getAsFile()); }
});
nameInput.addEventListener('input', () => { errName.hidden = true; nameInput.removeAttribute('aria-invalid'); });

dialog.addEventListener('submit', async (e) => {
  e.preventDefault();
  let ok = true;
  if (!file) { showErr(errFile, 'Choose an image or video first.'); ok = false; }
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
    const video = isVideo(file) ? file : null;
    if (video) submit.textContent = 'Picking frames from the video…';
    const stills = video ? await stillsFrom(video) : null;
    const index = await createEntry({
      file: stills ? stills.poster : file,
      video,
      frames: stills?.frames,
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
