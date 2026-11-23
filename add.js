/* ------------------------------------------------------------------ *
 *  "+ Add": create a new panel from an image on your device (owner only).
 *  The panel appears on the globe straight away and is saved to the repo
 *  with everything else when you press "Save to GitHub".
 * ------------------------------------------------------------------ */
import { editMode, createEntry, replaceMedia, addMedia, removeMedia, makeCover, whenReady } from './store.js';
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

/** Why a file can't go in, or '' if it can. `extra`: not the first one (extras can't be shrunk). */
function problemWith(f, extra = false) {
  const video = isVideo(f);
  if (!video && !f.type.startsWith('image/')) return `${f.name || 'That'} isn’t an image or a video.`;
  if (video && R2_ON && f.size > MAX_BUCKET_MB * 1e6) return `${f.name || 'That video'} is ${mb(f.size)} MB. The most one video can be is ${MAX_BUCKET_MB} MB.`;
  if (extra && video && !R2_ON && f.size > MAX_VIDEO_MB * 1e6) return `${f.name || 'That video'} is over ${MAX_VIDEO_MB} MB. Add it first, on its own, to shrink it.`;
  return '';
}

/* ---------- more files after the first ---------- */
let extras = [];   // [{ file, url }]
const moreBox = $('add-more');
const moreList = $('add-more-list');
function renderExtras() {
  const many = mode !== 'replace';
  moreBox.hidden = !many || !file;
  moreList.innerHTML = '';
  extras.forEach((x, k) => {
    const li = document.createElement('li');
    const media = isVideo(x.file) ? document.createElement('video') : document.createElement('img');
    if (media.tagName === 'VIDEO') { media.muted = true; media.preload = 'metadata'; media.playsInline = true; }
    media.src = x.url;
    media.alt = '';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'add-more-del';
    del.setAttribute('aria-label', `Remove ${x.file.name || 'this one'}`);
    del.textContent = '×';
    del.addEventListener('click', () => { URL.revokeObjectURL(x.url); extras.splice(k, 1); renderExtras(); });
    li.append(media, del);
    moreList.append(li);
  });
  const total = (file ? 1 : 0) + extras.length;
  $('add-more-note').textContent = total > 1
    ? `${total} in this panel. The big one shows on the globe; the rest are in the card.`
    : 'Add more images or videos to this panel, or leave it as one.';
}
function addExtras(files) {
  for (const f of files) {
    const why = problemWith(f, true);
    if (why) { showErr(errFile, why); continue; }
    extras.push({ file: f, url: URL.createObjectURL(f) });
  }
  renderExtras();
}
/** Several files at once: the first one is the main (with preview / shrinking), the rest go after it. */
function setFiles(list) {
  const files = [...(list || [])].filter(Boolean);
  if (!files.length) return;
  errFile.hidden = true;
  setFile(files[0]);
  if (mode !== 'replace') addExtras(files.slice(1));
}

function setFile(f) {
  if (!f) return;
  const video = isVideo(f);
  const why = problemWith(f);
  if (why) { showErr(errFile, why); return; }
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
  renderExtras();
  // suggest a title from the file name if none yet
  if (!nameInput.value.trim() && !/^pasted-/.test(f.name)) {
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
  $('add-drop-text').innerHTML = mode === 'replace'
    ? '<b>Choose an image or video</b><small>or drop it here</small>'
    : '<b>Choose images or videos</b><small>or drop them here · pick several at once · the first one shows on the globe</small>';
  extras.forEach((x) => URL.revokeObjectURL(x.url));
  extras = [];
  renderExtras();
  nameInput.value = '';
  noteInput.value = '';
  $('add-author').value = '';
  $('add-author-url').value = '';
  dateInput.value = localISO();
  dateInput.max = localISO();
  errFile.hidden = errName.hidden = true;
  nameInput.removeAttribute('aria-invalid');
  submit.disabled = false;
  submit.textContent = SUBMIT[mode];
}

function authorUrl() {
  let raw = $('add-author-url').value.trim();
  if (!raw) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = 'https://' + raw;
  try { const u = new URL(raw); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : ''; } catch { return ''; }
}

// one-click paste: read an image straight from the clipboard
/** Everything image- or video-like on the clipboard, as files. Throws if the browser won't allow reading it. */
async function clipboardFiles() {
  const items = await navigator.clipboard.read();
  const files = [];
  for (const it of items) {
    const type = it.types.find((t) => t.startsWith('image/') || t.startsWith('video/'));
    if (!type) continue;
    const blob = await it.getType(type);
    files.push(new File([blob], `pasted-${localISO()}-${files.length + 1}.${type.split('/')[1].replace('svg+xml', 'svg')}`, { type }));
  }
  return files;
}
const NOTHING = 'There’s no image on the clipboard. Copy an image first (right-click or long-press → Copy image).';
const BLOCKED = 'This browser didn’t allow reading the clipboard. Press ⌘V / Ctrl+V in this dialog instead.';

/** Paste: the first image becomes the main one if there isn't one yet; anything else is added after it. */
async function pasteIn() {
  try {
    const got = await clipboardFiles();
    if (!got.length) { showErr(errFile, NOTHING); return; }
    errFile.hidden = true;
    if (mode === 'replace') setFile(got[0]);
    else if (!file) setFiles(got);
    else addExtras(got);
  } catch {
    showErr(errFile, BLOCKED);
  }
}
$('add-paste').addEventListener('click', pasteIn);
$('add-more-paste').addEventListener('click', pasteIn);

for (const id of ['add-author', 'add-author-url']) $(id).addEventListener('input', () => { errName.hidden = true; });

let replacing = null;     // the panel being changed, or null when adding a new one
let mode = 'new';         // 'new' panel · 'replace' one image/video · 'append' more to a panel
let slot = 0;             // which image/video is being replaced (0 = the cover)
const SUBMIT = { new: 'Light up a panel', replace: 'Replace', append: 'Add to this panel' };

function open(entry = null, how = entry ? 'replace' : 'new', index = 0) {
  mode = how;
  slot = index;
  reset();
  replacing = entry;
  dialog.classList.toggle('replacing', !!entry);
  fileInput.multiple = mode !== 'replace';
  $('add-title').textContent = { new: 'Add today’s inspiration', replace: 'Replace image or video', append: 'Add images or videos' }[mode];
  submit.textContent = SUBMIT[mode];
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
  if (st.current >= 0) open(st.entries[st.current], 'replace', st.media || 0);
});
$('p-add-media').addEventListener('click', () => {
  const st = window.orbit.state;
  if (st.current >= 0) open(st.entries[st.current], 'append');
});

/* ---------- in the card: make another one the cover, or take one out ---------- */
const coverBtn = $('p-cover');
const removeBtn = $('p-remove');
window.addEventListener('orbit:media', (ev) => {
  const { index } = ev.detail;
  coverBtn.hidden = removeBtn.hidden = index < 1;    // the cover can be replaced, not removed
  removeBtn.textContent = 'Remove from panel';
  removeBtn.classList.remove('confirm');
  $('p-replace').textContent = ev.detail.count > 1 ? 'Replace this one' : 'Replace image or video';
});
$('p-paste').addEventListener('click', async () => {
  const st = window.orbit.state;
  const e = st.entries[st.current];
  const b = $('p-paste');
  const say = (t) => { b.textContent = t; clearTimeout(b._t); b._t = setTimeout(() => { b.textContent = 'Paste from clipboard'; }, 2200); };
  if (!e) return;
  let got;
  try { got = await clipboardFiles(); } catch { say('Clipboard not allowed here'); return; }
  got = got.filter((f) => !isVideo(f) && !problemWith(f, true));   // clipboards carry images; videos go through Add
  if (!got.length) { say('No image on the clipboard'); return; }
  say('Adding…');
  try {
    const before = window.orbit.mediaOf(e).length;
    await addMedia(e, got.map((f) => ({ file: f })));
    window.orbit.showMedia(before);
    say(got.length > 1 ? `Added ${got.length} ✓` : 'Added ✓');
  } catch (err) {
    say('Couldn’t add it');
  }
});
coverBtn.addEventListener('click', () => {
  const st = window.orbit.state;
  const e = st.entries[st.current];
  if (!e || st.media < 1) return;
  makeCover(e, st.media);
  window.orbit.showMedia(0);
});
// two taps, so a slip doesn't take one away (and nothing's gone until you save)
removeBtn.addEventListener('click', () => {
  const st = window.orbit.state;
  const e = st.entries[st.current];
  if (!e || st.media < 1) return;
  if (!removeBtn.classList.contains('confirm')) {
    removeBtn.classList.add('confirm');
    removeBtn.textContent = 'Tap again to remove';
    clearTimeout(removeBtn._t);
    removeBtn._t = setTimeout(() => { removeBtn.classList.remove('confirm'); removeBtn.textContent = 'Remove from panel'; }, 3000);
    return;
  }
  const at = st.media;
  removeMedia(e, at);
  window.orbit.showMedia(Math.min(at, window.orbit.mediaOf(e).length - 1));
});
$('add-close').addEventListener('click', close);
$('add-cancel').addEventListener('click', close);
scrim.addEventListener('click', close);
dialog.addEventListener('keydown', (e) => {
  e.stopPropagation();                       // keep keys away from the globe / calendar
  if (e.key === 'Escape') close();
});

fileInput.addEventListener('change', () => { setFiles(fileInput.files); fileInput.value = ''; });
$('add-more-file').addEventListener('change', (e) => { addExtras([...e.target.files]); e.target.value = ''; });
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('over')));
drop.addEventListener('drop', (e) => { e.preventDefault(); setFiles(e.dataTransfer.files); });
// paste an image straight from the clipboard
dialog.addEventListener('paste', (e) => {
  const got = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith('image/') || i.type.startsWith('video/')).map((i) => i.getAsFile());
  if (!got.length) return;
  e.preventDefault();
  if (!file && mode !== 'replace') setFiles(got);
  else if (mode === 'replace') setFile(got[0]);
  else addExtras(got);
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
  /** An image as it is; a video with a still and a few frames picked from it. */
  const prep = async (f, full = f) => {
    if (!isVideo(f)) return { file: f };
    const stills = await stillsFrom(full);
    return { file: stills.poster, video: f, frames: stills.frames };
  };
  try {
    if (isVideo(file)) submit.textContent = 'Picking frames from the video…';
    const media = await prep(file, original || file);
    const more = [];
    for (let k = 0; k < extras.length; k++) {
      submit.textContent = `Preparing ${k + 2} of ${extras.length + 1}…`;
      more.push(await prep(extras[k].file));
    }
    let index;
    let show = 0;
    if (mode === 'replace') {
      index = await replaceMedia(replacing, media, slot);
      show = slot;
    } else if (mode === 'append') {
      show = window.orbit.mediaOf(replacing).length;          // open on the first new one
      index = await addMedia(replacing, [media, ...more]);
    } else {
      index = await createEntry({
        ...media,
        title: nameInput.value,
        date: dateInput.value || localISO(),
        note: noteInput.value,
        author: $('add-author').value,
        authorUrl: authorUrl(),
      });
      if (more.length) await addMedia(window.orbit.state.entries[index], more);
    }
    close();
    // open the panel so keywords / links can be added right away
    setTimeout(() => { window.orbit.openEntry(index); if (show) window.orbit.showMedia(show); }, 250);
  } catch (err) {
    showErr(errFile, `Couldn’t ${mode === 'replace' ? 'replace' : 'add'} it: ${err.message}`);
    submit.disabled = false;
    submit.textContent = SUBMIT[mode];
  }
});

whenReady(() => { openBtn.hidden = !editMode; });

/* ---------- the Edit menu on the card's picture ---------- */
{
  const btn = $('m-menu-btn');
  const menu = $('m-menu');
  const set = (open) => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', () => set(menu.hidden));
  // close after choosing (Remove and Copy show their result first)
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.id === 'p-remove' && b.classList.contains('confirm')) return;
    if (b.id === 'p-copy' || b.id === 'p-paste') { setTimeout(() => set(false), 1400); return; }
    set(false);
  });
  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('.media-actions')) set(false); });
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); set(false); btn.focus(); } });
  window.addEventListener('orbit:media', () => set(false));
  window.addEventListener('orbit:close', () => set(false));
}
