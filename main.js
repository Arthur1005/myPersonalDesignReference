import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

/* ------------------------------------------------------------------ *
 *  Config
 * ------------------------------------------------------------------ */
const EARTH_R = 1.0;          // the planet
const NET_R = 1.38;           // the satellite shell
const MIN_DETAIL = 3;         // 20 * (3+1)^2 = 320 panels to start; grows automatically
const PANEL_INSET = 0.9;      // how much each lit panel shrinks inside its cell
const CAMERA_DIST = 4.2;
const FOCUS_DIST = 2.75;
const ACCENT = new THREE.Color('#6ff3ff');

/* ------------------------------------------------------------------ *
 *  Renderer / scene / camera
 * ------------------------------------------------------------------ */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    new THREE.SphereGeometry(EARTH_R, 96, 96),
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
  const n = 9000;
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
 *  Build the net once we know how many entries there are
 * ------------------------------------------------------------------ */
const state = {
  entries: [],
  faces: [],          // [{ a, b, c, centroid }]
  faceOrder: [],      // faceOrder[dayIndex] = faceId
  faceToEntry: new Map(),
  panelMeshes: [],
  hitMesh: null,
  hoverMesh: null,
  current: -1,
};

function buildNet(entryCount) {
  let detail = MIN_DETAIL;
  while (20 * (detail + 1) ** 2 < entryCount) detail++;

  const geo = new THREE.IcosahedronGeometry(NET_R, detail); // non-indexed
  const p = geo.attributes.position;
  const faceCount = p.count / 3;

  for (let f = 0; f < faceCount; f++) {
    const a = new THREE.Vector3().fromBufferAttribute(p, f * 3);
    const b = new THREE.Vector3().fromBufferAttribute(p, f * 3 + 1);
    const c = new THREE.Vector3().fromBufferAttribute(p, f * 3 + 2);
    const centroid = a.clone().add(b).add(c).divideScalar(3);
    state.faces.push({ a, b, c, centroid });
  }

  // Order the panels as a spiral growing outward from a starting point,
  // so the archive fills the sphere like a spreading patch of light.
  const start = new THREE.Vector3(0.25, 0.55, 1).normalize();
  const ref = new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(ref, start).normalize();
  const v = new THREE.Vector3().crossVectors(start, u);
  state.faceOrder = state.faces
    .map((f, id) => {
      const dir = f.centroid.clone().normalize();
      const ang = Math.acos(THREE.MathUtils.clamp(dir.dot(start), -1, 1));
      const az = Math.atan2(dir.dot(v), dir.dot(u));
      return { id, key: Math.round(ang * 40) * 10 + (az + Math.PI) };
    })
    .sort((x, y) => x.key - y.key)
    .map((o) => o.id);

  // Net lines (the "protection" mesh)
  const edges = new THREE.EdgesGeometry(geo, 0.01);
  world.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
    color: ACCENT, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false,
  })));

  // Satellite nodes at every vertex, softly twinkling
  const uniq = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    if (!uniq.has(k)) uniq.set(k, [p.getX(i), p.getY(i), p.getZ(i)]);
  }
  const verts = [...uniq.values()];
  const nodePos = new Float32Array(verts.length * 3);
  const phase = new Float32Array(verts.length);
  verts.forEach((vv, i) => { nodePos.set(vv, i * 3); phase[i] = Math.random() * Math.PI * 2; });
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
        gl_PointSize = (0.028 + 0.018 * tw) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; varying float vA;
      void main() { vec4 c = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(c.rgb, c.a * vA); }`,
  });
  const nodes = new THREE.Points(nodeGeo, nodeMat);
  world.add(nodes);
  state.nodeMat = nodeMat;

  // Invisible-ish shell used for picking + a faint shield tint
  const hitMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: ACCENT, transparent: true, opacity: 0.025, side: THREE.FrontSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  world.add(hitMesh);
  state.hitMesh = hitMesh;

  // Hover highlight triangle
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const hoverMesh = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({
    color: ACCENT, transparent: true, opacity: 0.18, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  hoverMesh.visible = false;
  world.add(hoverMesh);
  state.hoverMesh = hoverMesh;
}

function insetTriangle(face, k, lift = 1.004) {
  const c = face.centroid;
  return [face.a, face.b, face.c].map((p) => p.clone().sub(c).multiplyScalar(k).add(c).multiplyScalar(lift));
}

// Map an image onto a triangle so it stays upright relative to the globe's north,
// "cover"-fitting the triangle's bounding box (image aspect assumed ~4:3).
function uprightUVs(tri, aspect = 4 / 3) {
  const n = tri[0].clone().add(tri[1]).add(tri[2]).normalize();
  let up = new THREE.Vector3(0, 1, 0).projectOnPlane(n);
  if (up.lengthSq() < 1e-6) up = new THREE.Vector3(0, 0, -1).projectOnPlane(n);
  up.normalize();
  const right = new THREE.Vector3().crossVectors(up, n).normalize();
  const pts = tri.map((p) => [p.dot(right), p.dot(up)]);
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  let w = maxX - minX, h = maxY - minY;
  // expand the shorter side so the image isn't stretched
  if (w / h > aspect) h = w / aspect; else w = h * aspect;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return pts.flatMap(([x, y]) => [(x - cx) / w + 0.5, (y - cy) / h + 0.5]);
}

const loader = new THREE.TextureLoader();

function addPanel(entry, dayIndex) {
  const faceId = state.faceOrder[dayIndex];
  const face = state.faces[faceId];
  state.faceToEntry.set(faceId, dayIndex);

  const [a, b, c] = insetTriangle(face, PANEL_INSET);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a.toArray(), ...b.toArray(), ...c.toArray()]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uprightUVs([a, b, c])), 2));

  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.userData = { dayIndex, faceId, born: performance.now() + dayIndex * 40 };
  world.add(mesh);
  state.panelMeshes.push(mesh);

  // glowing frame
  const frame = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(insetTriangle(face, PANEL_INSET + 0.04, 1.005)),
    new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })
  );
  world.add(frame);

  loader.load(entry.image, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
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
  return hit ? hit.faceIndex : -1;
}

function setHover(faceId, x, y) {
  hoveredFace = faceId;
  if (faceId < 0) {
    state.hoverMesh.visible = false;
    tooltip.hidden = true;
    canvas.classList.remove('pointer');
    return;
  }
  const tri = insetTriangle(state.faces[faceId], 0.96, 1.003);
  const attr = state.hoverMesh.geometry.attributes.position;
  tri.forEach((p, i) => attr.setXYZ(i, p.x, p.y, p.z));
  attr.needsUpdate = true;
  state.hoverMesh.geometry.computeBoundingSphere();
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

canvas.addEventListener('pointermove', (e) => {
  if (e.buttons) { setHover(-1); return; }
  setHover(pick(e.clientX, e.clientY), e.clientX, e.clientY);
});
canvas.addEventListener('pointerleave', () => setHover(-1));
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
  el('p-tags').innerHTML = (e.tags || []).map((t) => `<li>${escapeHTML(t)}</li>`).join('');
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
}

el('close').addEventListener('click', closePanel);
el('prev').addEventListener('click', () => openEntry(state.current - 1));
el('next').addEventListener('click', () => openEntry(state.current + 1));
window.addEventListener('keydown', (e) => {
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
function tick() {
  const now = performance.now();
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
  if (state.nodeMat) state.nodeMat.uniforms.uScale.value = renderer.getPixelRatio() * window.innerHeight * 0.5;
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
