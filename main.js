import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

/* ------------------------------------------------------------------ *
 *  Config
 * ------------------------------------------------------------------ */
const EARTH_R = 1.0;          // the planet
const NET_R = 1.38;           // the satellite shell
const MIN_BANDS = 18;         // 10° latitude bands → ~300 panels; adds bands automatically when full
const PANEL_ASPECT = 4 / 3;   // target width:height of each window
const PANEL_GAP = 0.07;       // gap between a lit panel and its frame (fraction of band height)
const CAMERA_DIST = 4.2;
const FOCUS_DIST = 2.75;
const ACCENT = new THREE.Color('#6ff3ff');

/* ------------------------------------------------------------------ *
 *  Renderer / scene / camera
 * ------------------------------------------------------------------ */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
// Retina screens at full 2x cost 4x the pixels; 1.5x looks the same here and is far lighter.
// The loop below lowers it further if frames start taking too long.
const MAX_PR = Math.min(window.devicePixelRatio, 1.5);
let pixelRatio = MAX_PR;
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 100);
camera.position.set(0, 0.6, CAMERA_DIST);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 1.9;
controls.maxDistance = 8;
controls.rotateSpeed = 0.6;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;

const world = new THREE.Group();
scene.add(world);

/* ------------------------------------------------------------------ *
 *  Background stars
 * ------------------------------------------------------------------ */
{
  const n = 1800;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(18 + Math.random() * 30);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({
    color: 0x8fa6c8, size: 0.06, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false,
  })));
}

/* ------------------------------------------------------------------ *
 *  Earth: dark body + dotted surface + atmosphere
 * ------------------------------------------------------------------ */
{
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: { uRim: { value: new THREE.Color('#2a6bff') } },
      vertexShader: /* glsl */`
        varying vec3 vN; varying vec3 vView;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uRim; varying vec3 vN; varying vec3 vView;
        void main() {
          float f = pow(1.0 - max(dot(vN, vView), 0.0), 3.0);
          vec3 base = vec3(0.015, 0.03, 0.07);
          gl_FragColor = vec4(base + uRim * f * 0.9, 1.0);
        }`,
    })
  );
  world.add(body);

  // Fibonacci dot sphere — a "data globe" surface
  const n = 7000;
  const pos = new Float32Array(n * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const t = golden * i;
    pos.set([Math.cos(t) * r * 1.003, y * 1.003, Math.sin(t) * r * 1.003], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  world.add(new THREE.Points(g, new THREE.PointsMaterial({
    color: 0x3c7bd9, size: 0.012, transparent: true, opacity: 0.6, depthWrite: false,
  })));

  // Atmosphere halo
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R * 1.18, 64, 64),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexShader: /* glsl */`
        varying vec3 vN; varying vec3 vView;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vN; varying vec3 vView;
        void main() {
          float f = pow(max(dot(vN, vView), 0.0), 2.5);
          gl_FragColor = vec4(vec3(0.2, 0.5, 1.0) * f, f * 0.6);
        }`,
    })
  );
  world.add(halo);
}

/* ------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------ */
function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(180,250,255,0.9)');
  grad.addColorStop(1, 'rgba(111,243,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ------------------------------------------------------------------ *
 *  The net: bands of quad "windows" wrapped around the globe
 * ------------------------------------------------------------------ */
const state = {
  entries: [],
  faces: [],          // cells: { lat0, lat1, lon0, lon1, centroid, aspect }
  faceOrder: [],      // faceOrder[dayIndex] = cellId
  faceToEntry: new Map(),
  panelMeshes: [],
  hitMesh: null,
  hoverMesh: null,
  current: -1,
};

const DEG = Math.PI / 180;

function sph(lat, lon, r = NET_R) {
  const c = Math.cos(lat);
  return new THREE.Vector3(r * c * Math.sin(lon), r * Math.sin(lat), r * c * Math.cos(lon));
}

// Lay out latitude bands; each band holds as many ~4:3 windows as fit,
// so panels stay roughly the same size from equator to pole.
function layoutCells(bands) {
  const dLat = Math.PI / bands;
  const cells = [];
  for (let b = 1; b < bands - 1; b++) {            // skip the two polar caps
    const lat0 = -Math.PI / 2 + b * dLat;
    const lat1 = lat0 + dLat;
    const latC = (lat0 + lat1) / 2;
    const cols = Math.max(3, Math.round((2 * Math.PI * Math.cos(latC)) / (dLat * PANEL_ASPECT)));
    const dLon = (2 * Math.PI) / cols;
    const shift = ((b * 0.382) % 1) * dLon;          // brick-like stagger between bands
    for (let c = 0; c < cols; c++) {
      const lon0 = shift + c * dLon - Math.PI;
      const lon1 = lon0 + dLon;
      cells.push({
        band: b, lat0, lat1, lon0, lon1,
        centroid: sph(latC, (lon0 + lon1) / 2),
        aspect: (Math.cos(latC) * dLon) / dLat,
      });
    }
  }
  return { cells, dLat };
}

// A curved patch of sphere covering one cell (optionally inset), with upright UVs.
function cellPatch(cell, { gap = 0, r = NET_R, segs = 6 } = {}) {
  const latC = (cell.lat0 + cell.lat1) / 2;
  const gLat = (cell.lat1 - cell.lat0) * gap;
  const gLon = gLat / Math.max(Math.cos(latC), 0.2);
  const la0 = cell.lat0 + gLat, la1 = cell.lat1 - gLat;
  const lo0 = cell.lon0 + gLon, lo1 = cell.lon1 - gLon;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= segs; j++) {
    for (let i = 0; i <= segs; i++) {
      const u = i / segs, v = j / segs;
      const p = sph(THREE.MathUtils.lerp(la0, la1, v), THREE.MathUtils.lerp(lo0, lo1, u), r);
      pos.push(p.x, p.y, p.z);
      uv.push(u, v);
    }
  }
  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i, b = a + 1, c = a + segs + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function cellOutline(cell, gap, r, n = 8) {
  const latC = (cell.lat0 + cell.lat1) / 2;
  const gLat = (cell.lat1 - cell.lat0) * gap;
  const gLon = gLat / Math.max(Math.cos(latC), 0.2);
  const la0 = cell.lat0 + gLat, la1 = cell.lat1 - gLat;
  const lo0 = cell.lon0 + gLon, lo1 = cell.lon1 - gLon;
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(sph(la0, THREE.MathUtils.lerp(lo0, lo1, i / n), r));
  for (let i = 0; i < n; i++) pts.push(sph(THREE.MathUtils.lerp(la0, la1, i / n), lo1, r));
  for (let i = 0; i < n; i++) pts.push(sph(la1, THREE.MathUtils.lerp(lo1, lo0, i / n), r));
  for (let i = 0; i < n; i++) pts.push(sph(THREE.MathUtils.lerp(la1, la0, i / n), lo0, r));
  return pts;
}

function buildNet(entryCount) {
  let bands = MIN_BANDS;
  let layout = layoutCells(bands);
  while (layout.cells.length < entryCount) layout = layoutCells((bands += 2));
  const { cells, dLat } = layout;
  state.faces = cells;

  // Fill order: a patch spreading outward from a point just above the equator.
  const start = sph(8 * DEG, 0, 1);
  const ref = new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(ref, start).normalize();
  const v = new THREE.Vector3().crossVectors(start, u);
  state.faceOrder = cells
    .map((c, id) => {
      const dir = c.centroid.clone().normalize();
      const ang = Math.acos(THREE.MathUtils.clamp(dir.dot(start), -1, 1));
      const az = Math.atan2(dir.dot(v), dir.dot(u));
      return { id, key: Math.round(ang * 30) * 10 + (az + Math.PI) };
    })
    .sort((x, y) => x.key - y.key)
    .map((o) => o.id);

  // Net lines: latitude rings + the vertical struts between windows
  const seg = [];
  const pushArc = (pts) => { for (let i = 0; i < pts.length - 1; i++) seg.push(...pts[i].toArray(), ...pts[i + 1].toArray()); };
  const bands0 = Math.round(Math.PI / dLat);
  for (let b = 1; b < bands0; b++) {
    const lat = -Math.PI / 2 + b * dLat;
    const ring = [];
    for (let i = 0; i <= 160; i++) ring.push(sph(lat, (i / 160) * Math.PI * 2));
    pushArc(ring);
  }
  const nodeMap = new Map();
  const addNode = (p) => { const k = p.toArray().map((x) => x.toFixed(3)).join(); if (!nodeMap.has(k)) nodeMap.set(k, p); };
  for (const c of cells) {
    const arc = [];
    for (let i = 0; i <= 4; i++) arc.push(sph(THREE.MathUtils.lerp(c.lat0, c.lat1, i / 4), c.lon0));
    pushArc(arc);
    addNode(arc[0]);
    addNode(arc[4]);
  }
  // Poles: a satellite at each, with spokes to the nearest ring
  for (const s of [1, -1]) {
    const pole = new THREE.Vector3(0, s * NET_R, 0);
    addNode(pole);
    const lat = s * (Math.PI / 2 - dLat);
    for (let k = 0; k < 8; k++) {
      const lon = (k / 8) * Math.PI * 2;
      const arc = [];
      for (let i = 0; i <= 4; i++) arc.push(sph(THREE.MathUtils.lerp(lat, s * Math.PI / 2, i / 4), lon));
      pushArc(arc);
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  world.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
    color: ACCENT, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false,
  })));

  // Satellite nodes, softly twinkling
  const verts = [...nodeMap.values()];
  const nodePos = new Float32Array(verts.length * 3);
  const phase = new Float32Array(verts.length);
  verts.forEach((vv, i) => { nodePos.set(vv.toArray(), i * 3); phase[i] = Math.random() * Math.PI * 2; });
  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePos, 3));
  nodeGeo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const nodeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uMap: { value: makeDotTexture() },
      uScale: { value: renderer.getPixelRatio() * window.innerHeight * 0.5 },
    },
    vertexShader: /* glsl */`
      attribute float phase; uniform float uTime; uniform float uScale; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = 0.55 + 0.45 * sin(uTime * 1.6 + phase);
        vA = tw;
        gl_PointSize = (0.026 + 0.016 * tw) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; varying float vA;
      void main() { vec4 c = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(c.rgb, c.a * vA); }`,
  });
  world.add(new THREE.Points(nodeGeo, nodeMat));
  state.nodeMat = nodeMat;

  // One combined shell for picking (+ a faint shield tint); triangle -> cell lookup
  const pos = [], idx = [], triCell = [];
  cells.forEach((c, id) => {
    const g = cellPatch(c, { segs: 3 });
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array);
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + base);
    for (let t = 0; t < ix.length / 3; t++) triCell.push(id);
    g.dispose();
  });
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  shell.setIndex(idx);
  const hitMesh = new THREE.Mesh(shell, new THREE.MeshBasicMaterial({
    color: ACCENT, transparent: true, opacity: 0.02, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  hitMesh.userData.triCell = triCell;
  world.add(hitMesh);
  state.hitMesh = hitMesh;

  const hoverMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    color: ACCENT, transparent: true, opacity: 0.16, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  hoverMesh.visible = false;
  world.add(hoverMesh);
  state.hoverMesh = hoverMesh;
}

const loader = new THREE.TextureLoader();

function addPanel(entry, dayIndex) {
  const cellId = state.faceOrder[dayIndex];
  const cell = state.faces[cellId];
  state.faceToEntry.set(cellId, dayIndex);

  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
  });
  const mesh = new THREE.Mesh(cellPatch(cell, { gap: PANEL_GAP, r: NET_R * 1.003 }), mat);
  mesh.userData = { dayIndex, cellId, born: performance.now() + dayIndex * 40 };
  world.add(mesh);
  state.panelMeshes.push(mesh);

  const frame = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(cellOutline(cell, PANEL_GAP * 0.6, NET_R * 1.004)),
    new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })
  );
  world.add(frame);

  loader.load(entry.image, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    // "cover" fit: crop the image to the panel's proportions, centred
    const ia = tex.image.width / tex.image.height;
    const pa = cell.aspect * (1 - 2 * PANEL_GAP);
    if (ia > pa) { tex.repeat.set(pa / ia, 1); tex.offset.set((1 - pa / ia) / 2, 0); }
    else { tex.repeat.set(1, ia / pa); tex.offset.set(0, (1 - ia / pa) / 2); }
    mat.map = tex;
    mat.needsUpdate = true;
  }, undefined, () => {
    mat.color.set(ACCENT); // no image: show a solid lit cell
  });
}

/* ------------------------------------------------------------------ *
 *  Interaction
 * ------------------------------------------------------------------ */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tooltip = document.getElementById('tooltip');
let hoveredFace = -1;
let downAt = null;

function pick(clientX, clientY) {
  if (!state.hitMesh) return -1;
  pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(state.hitMesh, false)[0];
  return hit ? state.hitMesh.userData.triCell[hit.faceIndex] : -1;
}

function setHover(faceId, x, y) {
  if (faceId === hoveredFace && faceId >= 0) {   // same cell: just move the tooltip
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    return;
  }
  hoveredFace = faceId;
  if (faceId < 0) {
    state.hoverMesh.visible = false;
    tooltip.hidden = true;
    canvas.classList.remove('pointer');
    return;
  }
  state.hoverMesh.geometry.dispose();
  state.hoverMesh.geometry = cellPatch(state.faces[faceId], { gap: 0.02, r: NET_R * 1.002, segs: 4 });
  state.hoverMesh.visible = true;

  const dayIndex = state.faceToEntry.get(faceId);
  if (dayIndex !== undefined) {
    const e = state.entries[dayIndex];
    tooltip.innerHTML = `<span class="d">${String(dayIndex + 1).padStart(3, '0')}</span>${escapeHTML(e.title)}`;
    canvas.classList.add('pointer');
  } else {
    tooltip.innerHTML = `<span class="d">—</span>Unlit panel`;
    canvas.classList.remove('pointer');
  }
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
  tooltip.hidden = false;
}

function escapeHTML(s = '') {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Hover picking runs at most once per frame, and never while dragging.
let pendingHover = null;
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons) { if (hoveredFace !== -1) setHover(-1); pendingHover = null; return; }
  pendingHover = { x: e.clientX, y: e.clientY };
});
function processHover() {
  if (!pendingHover) return;
  const { x, y } = pendingHover;
  pendingHover = null;
  setHover(pick(x, y), x, y);
}
canvas.addEventListener('pointerleave', () => { pendingHover = null; setHover(-1); });
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; controls.autoRotate = false; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 5) return;
  const faceId = pick(e.clientX, e.clientY);
  const dayIndex = state.faceToEntry.get(faceId);
  if (dayIndex !== undefined) openEntry(dayIndex);
  else if (faceId < 0) closePanel();
});

/* ------------------------------------------------------------------ *
 *  Detail panel
 * ------------------------------------------------------------------ */
const panel = document.getElementById('panel');
const el = (id) => document.getElementById(id);

function openEntry(dayIndex, { fly = true } = {}) {
  const e = state.entries[dayIndex];
  if (!e) return;
  state.current = dayIndex;
  el('p-image').src = e.image;
  el('p-image').alt = e.title;
  el('p-day').textContent = `Day ${String(dayIndex + 1).padStart(3, '0')} · ${formatDate(e.date)}`;
  el('p-title').textContent = e.title;
  el('p-note').textContent = e.note || '';
  const link = el('p-link');
  if (e.link) { link.href = e.link; link.hidden = false; } else { link.hidden = true; }
  el('prev').disabled = dayIndex === 0;
  el('next').disabled = dayIndex === state.entries.length - 1;

  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('panel-open');
  controls.autoRotate = false;
  history.replaceState(null, '', `#day-${dayIndex + 1}`);

  state.panelMeshes.forEach((m) => { m.userData.focus = m.userData.dayIndex === dayIndex; });
  if (fly) flyTo(state.faces[state.faceOrder[dayIndex]].centroid, FOCUS_DIST);
  window.dispatchEvent(new CustomEvent('orbit:open', { detail: { dayIndex } }));
}

function closePanel() {
  if (!panel.classList.contains('open')) return;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('panel-open');
  state.current = -1;
  state.panelMeshes.forEach((m) => { m.userData.focus = false; });
  history.replaceState(null, '', location.pathname + location.search);
  flyTo(camera.position.clone(), CAMERA_DIST);
  window.dispatchEvent(new CustomEvent('orbit:close'));
}

el('close').addEventListener('click', closePanel);
el('prev').addEventListener('click', () => openEntry(state.current - 1));
el('next').addEventListener('click', () => openEntry(state.current + 1));
window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, [contenteditable]')) return;
  if (e.key === 'Escape') closePanel();
  if (state.current < 0) return;
  if (e.key === 'ArrowLeft' && state.current > 0) openEntry(state.current - 1);
  if (e.key === 'ArrowRight' && state.current < state.entries.length - 1) openEntry(state.current + 1);
});

/* ------------------------------------------------------------------ *
 *  Camera flight (spherical slerp around the globe)
 * ------------------------------------------------------------------ */
let flight = null;
function flyTo(targetLocal, dist) {
  const targetWorld = targetLocal.clone().applyMatrix4(world.matrixWorld).normalize();
  flight = {
    from: camera.position.clone().normalize(),
    to: targetWorld,
    d0: camera.position.length(),
    d1: dist,
    t0: performance.now(),
    dur: 1100,
  };
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

function stepFlight(now) {
  if (!flight) return;
  const t = Math.min((now - flight.t0) / flight.dur, 1);
  const k = ease(t);
  qa.identity();
  qb.setFromUnitVectors(flight.from, flight.to);
  const q = qa.clone().slerp(qb, k);
  const dir = flight.from.clone().applyQuaternion(q);
  camera.position.copy(dir.multiplyScalar(THREE.MathUtils.lerp(flight.d0, flight.d1, k)));
  camera.lookAt(0, 0, 0);
  if (t >= 1) flight = null;
}

/* ------------------------------------------------------------------ *
 *  Loop
 * ------------------------------------------------------------------ */
const clock = new THREE.Clock();
let lastFrame = performance.now();
let slowTime = 0;
function adaptResolution(now) {
  const dt = now - lastFrame;
  lastFrame = now;
  if (document.hidden || dt > 250) return;          // tab switch, not a slow frame
  slowTime = dt > 22 ? slowTime + dt : Math.max(0, slowTime - dt * 0.5);
  if (slowTime > 1000 && pixelRatio > 1) {           // ~1s of sub-45fps frames
    pixelRatio = Math.max(1, pixelRatio - 0.25);
    renderer.setPixelRatio(pixelRatio);
    if (state.nodeMat) state.nodeMat.uniforms.uScale.value = pixelRatio * window.innerHeight * 0.5;
    slowTime = 0;
  }
}

function tick() {
  const now = performance.now();
  adaptResolution(now);
  processHover();
  const t = clock.getElapsedTime();
  if (state.nodeMat) state.nodeMat.uniforms.uTime.value = t;

  for (const m of state.panelMeshes) {
    const age = Math.max(0, (now - m.userData.born) / 900);
    const target = state.current < 0 || m.userData.focus ? 0.95 : 0.45;
    m.material.opacity += (Math.min(age, 1) * target - m.material.opacity) * 0.12;
  }

  stepFlight(now);
  if (!flight) controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (state.nodeMat) state.nodeMat.uniforms.uScale.value = pixelRatio * window.innerHeight * 0.5;
});

/* ------------------------------------------------------------------ *
 *  Boot
 * ------------------------------------------------------------------ */
async function boot() {
  let entries = [];
  try {
    const res = await fetch('data/entries.json', { cache: 'no-cache' });
    const json = await res.json();
    entries = (json.entries || json).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  } catch (err) {
    console.error('Could not load data/entries.json', err);
  }
  state.entries = entries;
  document.getElementById('filled').textContent = entries.length;

  buildNet(entries.length);
  entries.forEach(addPanel);
  window.orbit = { state, ready: true };
  window.dispatchEvent(new CustomEvent('orbit:ready'));

  // Start facing the newest panel
  world.updateMatrixWorld();
  if (entries.length) {
    const latest = state.faces[state.faceOrder[entries.length - 1]].centroid.clone().normalize();
    camera.position.copy(latest.multiplyScalar(CAMERA_DIST));
    camera.lookAt(0, 0, 0);
  }

  const m = location.hash.match(/^#day-(\d+)$/);
  if (m) {
    const i = Number(m[1]) - 1;
    if (state.entries[i]) setTimeout(() => openEntry(i), 400);
  }
  tick();
}

boot();
