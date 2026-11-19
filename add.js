/* ------------------------------------------------------------------ *
 *  "+ Add": create a new panel from an image on your device (owner only).
 *  The panel appears on the globe straight away and is saved to the repo
 *  with everything else when you press "Save to GitHub".
 * ------------------------------------------------------------------ */
import { editMode, createEntry, replaceMedia, whenReady } from './store.js';
import { R2_ON } from './r2.js';

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
let original = null;      // the full-size video, kept for sharp stills after shrinking
let needsShrink = false;
let previewUrl = null;

const localISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const shrinkBox = $('add-shrink');
const shrinkText = $('shrink-text');
const shrinkBar = $('shrink-bar');
const shrinkFill = $('shrink-fill');
const shrinkGo = $('shrink-go');
let shrinking = null;
const mb = (bytes) => (bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0);
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const TARGET_MB = 20;            // aim a little under the limit
const MAX_SHRINK_SECONDS = 300;  // longer than this would look too rough at 20 MB
const MAX_VIDEO_MB = 25;
const MAX_BUCKET_MB = 1000;      // per video, when a video bucket is set up   // videos live in the GitHub repo, so keep them short and light
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

function probeDuration(f) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(f);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); res(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); rej(new Error('unreadable')); };
    v.src = url;
  });
}

/**
 * Re-record a video smaller, in the browser: it plays through once onto a canvas (max 1280px)
 * and is recorded at a bitrate chosen so the result lands around TARGET_MB.
 */
function shrinkVideo(f, onProgress, { fit = true } = {}) {
  let cancelled = false;
  let cleanup = () => {};
  const done = (async () => {
    if (!window.MediaRecorder) throw new Error('this browser can’t shrink videos. Try Chrome, or export the video smaller.');
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      .find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) throw new Error('this browser can’t shrink videos. Try Chrome, or export the video smaller.');
    const url = URL.createObjectURL(f);
    const v = document.createElement('video');
    v.playsInline = true; v.preload = 'auto'; v.src = url;
    await new Promise((res, rej) => {
      v.onloadeddata = res;
      v.onerror = () => rej(new Error('this video can’t be played in the browser. Try an MP4 (H.264) or WebM.'));
    });
    const d = v.duration;
    const scale = Math.min(1, (fit ? 1280 : 1920) / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round((v.videoWidth * scale) / 2) * 2;
    c.height = Math.round((v.videoHeight * scale) / 2) * 2;
    const ctx = c.getContext('2d');
    const stream = c.captureStream(30);
    const AUDIO = 96000;
    try {   // keep the sound if the browser lets us tap it
      const src = (v.captureStream || v.mozCaptureStream)?.call(v);
      src?.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch { /* silent video is fine */ }
    const hasAudio = stream.getAudioTracks().length > 0;
    // "fit": aim for TARGET_MB. Otherwise: good quality, at most about half the original's data rate.
    const videoBits = fit
      ? Math.max(350000, Math.min(4000000, (TARGET_MB * 8e6 * 0.92) / d - (hasAudio ? AUDIO : 0)))
      : Math.max(800000, Math.min(6000000, ((f.size * 8) / d) * 0.5));
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: videoBits, audioBitsPerSecond: AUDIO });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((res) => { rec.onstop = res; });
    let raf = 0;
    const draw = () => {
      ctx.drawImage(v, 0, 0, c.width, c.height);
      onProgress?.(Math.min(1, v.currentTime / d));
      if (!v.ended && !cancelled) raf = requestAnimationFrame(draw);
    };
    cleanup = () => { cancelAnimationFrame(raf); v.pause(); if (rec.state !== 'inactive') rec.stop(); URL.revokeObjectURL(url); };
    v.muted = !hasAudio;
    rec.start(1000);
    try { await v.play(); } catch { v.muted = true; await v.play(); }
    draw();
    await new Promise((res) => { v.onended = res; const t = setInterval(() => { if (cancelled) { clearInterval(t); res(); } }, 200); });
    ctx.drawImage(v, 0, 0, c.width, c.height);
    cleanup();
    await stopped;
    if (cancelled) throw new Error('cancelled');
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    return new File(chunks, f.name.replace(/\.[^.]+$/, '') + `.${ext}`, { type: mime.split(';')[0] });
  })();
  return { done, cancel: () => { cancelled = true; cleanup(); } };
}

shrinkGo.addEventListener('click', async () => {
  const big = file;
  shrinkGo.disabled = true;
  shrinkBar.hidden = false;
  shrinkFill.style.width = '0%';
  const fit = needsShrink;
  shrinkText.textContent = fit ? 'Shrinking… keep this tab in front.' : 'Converting to WebM… keep this tab in front.';
  vpreview.pause();
  shrinking = shrinkVideo(big, (p) => { shrinkFill.style.width = `${(p * 100).toFixed(1)}%`; }, { fit });
  try {
    const small = await shrinking.done;
    if (file !== big) return;                       // a different file was chosen meanwhile
    if (fit && small.size > MAX_VIDEO_MB * 1e6) throw new Error(`it only got down to ${mb(small.size)} MB. Trim the video shorter and try again.`);
    if (!fit && small.size >= big.size * 0.95) {
      shrinkText.textContent = `This video is already compact (WebM came out at ${mb(small.size)} MB), so the original is kept.`;
      shrinkBar.hidden = true;
      shrinkGo.hidden = true;
      vpreview.play?.().catch(() => {});
      return;
    }
    original = big;
    file = small;
    needsShrink = false;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(small);
    vpreview.src = previewUrl;
    vpreview.play?.().catch(() => {});
    shrinkText.textContent = `${fit ? 'Shrunk' : 'Converted to WebM:'} from ${mb(big.size)} MB to ${mb(small.size)} MB. Check the preview, then light up the panel.`;
    shrinkBar.hidden = true;
    shrinkGo.hidden = true;
    submit.disabled = false;
  } catch (err) {
    if (err.message === 'cancelled') return;
    shrinkText.textContent = `Couldn’t shrink it: ${err.message}`;
    shrinkBar.hidden = true;
    shrinkGo.disabled = false;
  } finally {
    shrinking = null;
  }
});

function setFile(f) {
  if (!f) return;
  const video = isVideo(f);
  if (!video && !f.type.startsWith('image/')) { showErr(errFile, 'That isn’t an image or a video.'); return; }
  if (video && R2_ON && f.size > MAX_BUCKET_MB * 1e6) {
    showErr(errFile, `That video is ${mb(f.size)} MB. The most one video can be is ${MAX_BUCKET_MB} MB.`);
    return;
  }
  file = f;
  original = null;
  window.dispatchEvent(new CustomEvent('orbit:picked', { detail: { file: f, video } }));
  needsShrink = video && !R2_ON && f.size > MAX_VIDEO_MB * 1e6;   // with a video bucket, videos go up at full size
  // any other video can optionally be converted to WebM (usually much smaller); already-WebM files are left alone
  const optional = video && !needsShrink && !/webm/i.test(f.type + f.name);
  shrinkBox.hidden = !(needsShrink || optional);
  shrinkBar.hidden = true;
  shrinkGo.hidden = false;
  shrinkGo.disabled = false;
  shrinkGo.textContent = needsShrink ? 'Shrink to fit' : 'Convert to WebM';
  submit.disabled = needsShrink;
  if (optional) {
    shrinkText.textContent = `Optional: convert this ${mb(f.size)} MB video to WebM, a lighter web format.`;
    probeDuration(f).then((d) => {
      if (file !== f) return;
      shrinkText.textContent = `Optional: convert this ${mb(f.size)} MB video to WebM, a lighter web format. It plays through once, so it takes about ${clock(d)}; keep this tab in front.`;
    }).catch(() => {});
  }
  if (needsShrink) {
    shrinkText.textContent = `This video is ${mb(f.size)} MB, over the ${MAX_VIDEO_MB} MB limit. Shrink it to fit?`;
    probeDuration(f).then((d) => {
      if (file !== f || !needsShrink) return;
      if (d > MAX_SHRINK_SECONDS) {
        shrinkText.textContent = `This video is ${mb(f.size)} MB and ${clock(d)} long. That's too long to shrink well; trim it to under ${clock(MAX_SHRINK_SECONDS)} first.`;
        shrinkGo.hidden = true;
      } else {
        shrinkText.textContent = `This video is ${mb(f.size)} MB, over the ${MAX_VIDEO_MB} MB limit. Shrinking plays it through once, so it takes about ${clock(d)}. Keep this tab in front while it runs.`;
      }
    }).catch(() => {});
  }
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
  $('add-usage').hidden = true;
  file = null;
  original = null;
  needsShrink = false;
  shrinking?.cancel();
  shrinkBox.hidden = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  preview.hidden = true;
  preview.removeAttribute('src');
  vpreview.hidden = true;
  vpreview.removeAttribute('src');
  vpreview.load?.();
  drop.classList.remove('has-image');
  $('add-drop-text').innerHTML = '<b>Choose an image or video</b><small>or drop it here · images or video (bigger videos can be shrunk to fit)</small>';
  nameInput.value = '';
  noteInput.value = '';
  $('add-author').value = '';
  $('add-author-url').value = '';
  dateInput.value = localISO();
  dateInput.max = localISO();
  errFile.hidden = errName.hidden = true;
  nameInput.removeAttribute('aria-invalid');
  submit.disabled = false;
  submit.textContent = 'Light up a panel';
}

function authorUrl() {
  let raw = $('add-author-url').value.trim();
  if (!raw) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = 'https://' + raw;
  try { const u = new URL(raw); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : ''; } catch { return ''; }
}

// one-click paste: read an image straight from the clipboard
$('add-paste').addEventListener('click', async () => {
  try {
    const items = await navigator.clipboard.read();
    for (const it of items) {
      const type = it.types.find((t) => t.startsWith('image/') || t.startsWith('video/'));
      if (!type) continue;
      const blob = await it.getType(type);
      setFile(new File([blob], `pasted-${localISO()}.${type.split('/')[1].replace('svg+xml', 'svg')}`, { type }));
      return;
    }
    showErr(errFile, 'There’s no image on the clipboard. Copy an image first (right-click → Copy image).');
  } catch {
    showErr(errFile, 'This browser didn’t allow reading the clipboard. Press ⌘V / Ctrl+V in this dialog instead.');
  }
});
for (const id of ['add-author', 'add-author-url']) $(id).addEventListener('input', () => { errName.hidden = true; });

let replacing = null;     // the panel whose image/video is being swapped, or null when adding a new one

function open(entry = null) {
  reset();
  replacing = entry;
  dialog.classList.toggle('replacing', !!entry);
  $('add-title').textContent = entry ? 'Replace image or video' : 'Add today’s inspiration';
  submit.textContent = entry ? 'Replace' : 'Light up a panel';
  dialog.hidden = scrim.hidden = false;
  document.body.classList.add('adding');
  requestAnimationFrame(() => drop.focus?.());
}
function close() {
  dialog.hidden = scrim.hidden = true;
  document.body.classList.remove('adding');
}

openBtn.addEventListener('click', () => open());
$('p-replace').addEventListener('click', () => {
  const st = window.orbit.state;
  if (st.current >= 0) open(st.entries[st.current]);
});
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
  if (!replacing && $('add-author-url').value.trim() && !authorUrl()) {
    showErr(errName, 'The author link doesn’t look like a web address.');
    ok = false;
  }
  if (!replacing && !nameInput.value.trim()) {
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
    const stills = video ? await stillsFrom(original || video) : null;
    const media = { file: stills ? stills.poster : file, video, frames: stills?.frames };
    const index = replacing
      ? await replaceMedia(replacing, media)
      : await createEntry({
        ...media,
        title: nameInput.value,
        date: dateInput.value || localISO(),
        note: noteInput.value,
        author: $('add-author').value,
        authorUrl: authorUrl(),
      });
    close();
    // open the new panel so keywords / links can be added right away
    setTimeout(() => window.orbit.openEntry(index), 250);
  } catch (err) {
    showErr(errFile, `Couldn’t ${replacing ? 'replace' : 'add'} it: ${err.message}`);
    submit.disabled = false;
    submit.textContent = replacing ? 'Replace' : 'Light up a panel';
  }
});

whenReady(() => { openBtn.hidden = !editMode; });
