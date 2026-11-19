import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

/* ------------------------------------------------------------------ *
 *  Config
 * ------------------------------------------------------------------ */
const EARTH_R = 1.22;         // the core (the "earth"); the net sits just outside at NET_R
const NET_R = 1.38;           // the satellite shell
const MIN_BANDS = 18;         // 10° latitude bands → ~300 panels; adds bands automatically when full
const PANEL_ASPECT = 4 / 3;   // target width:height of each window
const PANEL_GAP = 0.07;       // gap between a lit panel and its frame (fraction of band height)
const CAMERA_DIST = 4.2;
const FOCUS_DIST = 2.75;
// Palette: white / grey, with blue as the only highlight colour
const ACCENT = new THREE.Color('#2a6bff');   // lit panel frames, hover, twinkling satellites
const NET = new THREE.Color('#77776f');      // the net lines
const NODE = new THREE.Color('#4a4a45');     // satellites at rest

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
controls.autoRotate = true;      // always spinning, except while dragging or with a panel open (see tick)
controls.autoRotateSpeed = 0.35;
let dragging = false;

const world = new THREE.Group();
scene.add(world);
const netGroup = new THREE.Group();     // net lines, satellites, picking shell (rebuilt if the net grows)
const panelGroup = new THREE.Group();   // lit panels + their frames (rebuilt when entries change)
world.add(netGroup, panelGroup);

// Image paths can point at files not uploaded yet; the editing store swaps in a local preview.
const resolveImage = (p) => (window.orbit?.resolveImage ? window.orbit.resolveImage(p) : p);

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
    color: 0xb9b9b3, size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.5, depthWrite: false,
  })));
}

/* ------------------------------------------------------------------ *
 *  The core (the "earth" inside the net). Two looks to compare:
 *   planet  – solid grey globe with a dotted surface (hides the back of the net)
 *   frosted – milky, see-through glass; the back of the net shows faintly through it
 * ------------------------------------------------------------------ */
const CORE_MODES = ['planet', 'frosted'];
const BACK_FADE = { planet: 1, frosted: 0.3 };   // how visible the far side of the net is
const uBackFade = { value: 1 };

const core = {};
{
  const sphereVS = /* glsl */`
    varying vec3 vN; varying vec3 vView;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`;
  const geo = new THREE.SphereGeometry(EARTH_R, 64, 64);

  core.solid = new THREE.ShaderMaterial({
    uniforms: { uRim: { value: new THREE.Color('#c9c9c4') } },
    vertexShader: sphereVS,
    fragmentShader: /* glsl */`
      uniform vec3 uRim; varying vec3 vN; varying vec3 vView;
      void main() {
        float f = pow(1.0 - max(dot(vN, vView), 0.0), 2.2);
        gl_FragColor = vec4(mix(vec3(0.975, 0.975, 0.968), uRim, f), 1.0);
      }`,
  });
  core.frost = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: sphereVS,
    fragmentShader: /* glsl */`
      varying vec3 vN; varying vec3 vView;
      void main() {
        float f = pow(1.0 - max(dot(vN, vView), 0.0), 1.8);
        vec3 col = mix(vec3(1.0), vec3(0.80, 0.80, 0.78), f * 0.7);
        gl_FragColor = vec4(col, 0.58 + 0.34 * f);
      }`,
  });
  core.body = new THREE.Mesh(geo, core.solid);
  core.body.renderOrder = -1;          // draw the core first; the net draws over it
  world.add(core.body);

  // Fibonacci dot sphere — a "data globe" surface (planet look only)
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
  core.dots = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0x9a9a94, size: 0.011, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  world.add(core.dots);

  // Soft shadow ring around the core
  core.halo = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R * 1.12, 64, 64),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      vertexShader: sphereVS,
      fragmentShader: /* glsl */`
        varying vec3 vN; varying vec3 vView;
        void main() {
          float f = pow(max(dot(vN, vView), 0.0), 2.5);
          gl_FragColor = vec4(vec3(0.55, 0.55, 0.52), f * 0.12);
        }`,
    })
  );
  world.add(core.halo);
}

/** Make a built-in material fade where the net faces away from the camera (the far side). */
function fadeBackside(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBackFade = uBackFade;
    shader.vertexShader = 'varying vec3 vWPos;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = 'uniform float uBackFade;\nvarying vec3 vWPos;\n' + shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      {
        float facing = smoothstep(-0.12, 0.12, dot(normalize(vWPos), normalize(cameraPosition - vWPos)));
        gl_FragColor.a *= mix(uBackFade, 1.0, facing);
      }`);
  };
  return material;
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
  grad.addColorStop(0.45, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0)');
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
  palettes: new Map(),  // entry -> 3 main colours as [L, a, b] (for "related" suggestions)
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
  netGroup.add(new THREE.LineSegments(lineGeo, fadeBackside(new THREE.LineBasicMaterial({
    color: NET, transparent: true, opacity: 0.45, depthWrite: false,
  }))));

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
    uniforms: {
      uTime: { value: 0 },
      uMap: { value: makeDotTexture() },
      uColor: { value: NODE },
      uGlow: { value: ACCENT },
      uBackFade,
      uScale: { value: renderer.getPixelRatio() * window.innerHeight * 0.5 },
    },
    vertexShader: /* glsl */`
      attribute float phase; uniform float uTime; uniform float uScale; varying float vA; varying float vFacing;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
        vFacing = smoothstep(-0.12, 0.12, dot(normalize(wp), normalize(cameraPosition - wp)));
        float tw = 0.55 + 0.45 * sin(uTime * 1.6 + phase);
        vA = tw;
        gl_PointSize = (0.026 + 0.016 * tw) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform vec3 uColor; uniform vec3 uGlow; uniform float uBackFade;
      varying float vA; varying float vFacing;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a;
        vec3 col = mix(uColor, uGlow, smoothstep(0.85, 1.0, vA));   // satellites blink blue at their peak
        gl_FragColor = vec4(col, a * (0.55 + 0.45 * vA) * mix(uBackFade, 1.0, vFacing));
      }`,
  });
  netGroup.add(new THREE.Points(nodeGeo, nodeMat));
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
  const hitMesh = new THREE.Mesh(shell, fadeBackside(new THREE.MeshBasicMaterial({
    color: 0x8a8a85, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false,
  })));
  hitMesh.userData.triCell = triCell;
  netGroup.add(hitMesh);
  state.hitMesh = hitMesh;

  const hoverMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    color: ACCENT, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false,
  }));
  hoverMesh.visible = false;
  netGroup.add(hoverMesh);
  state.hoverMesh = hoverMesh;
}

const loader = new THREE.TextureLoader();

/**
 * SVGs (e.g. logos exported from Illustrator) often have no width/height, only a viewBox.
 * Browsers can show those in a page but can't size them for WebGL, so draw them onto a
 * canvas first: up to 1024px on the long side, on white so dark logos stay visible.
 */
async function svgTexture(url) {
  const text = await (await fetch(url)).text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  let w = parseFloat(svg.getAttribute('width')) || vb[2] || 300;
  let h = parseFloat(svg.getAttribute('height')) || vb[3] || 150;
  const k = 1024 / Math.max(w, h);
  w = Math.round(w * k); h = Math.round(h * k);
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  const blobUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = blobUrl;
    await img.decode();
    const c = document.createElement('canvas');
    // a little white margin around the logo so it doesn't touch the panel edges
    const pad = Math.round(Math.max(w, h) * 0.08);
    c.width = w + pad * 2; c.height = h + pad * 2;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, pad, pad, w, h);
    return new THREE.CanvasTexture(c);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/** Load any panel image as a texture (SVGs via svgTexture). */
function loadTexture(path, onLoad, onError) {
  const url = resolveImage(path);
  if (/\.svg(\?|$)/i.test(path)) svgTexture(url).then(onLoad, onError);
  else loader.load(url, onLoad, undefined, onError);
}
const FRAME_MS = 900;        // how long each still of a video panel shows on the globe

/* ---------- main colours of an image (tiny k-means in Lab space) ---------- */
function toLab([r, g, b]) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
function palette(img, k = 3) {
  const N = 20;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, N, N);
  const d = ctx.getImageData(0, 0, N, N).data;
  const px = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) px.push(toLab([d[i], d[i + 1], d[i + 2]]));
  if (!px.length) return null;
  let cent = Array.from({ length: k }, (_, i) => px[Math.floor(((i + 0.5) / k) * px.length)].slice());
  let groups = [];
  for (let it = 0; it < 8; it++) {
    groups = cent.map(() => []);
    for (const p of px) {
      let best = 0, bd = Infinity;
      cent.forEach((q, j) => { const dd = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (dd < bd) { bd = dd; best = j; } });
      groups[best].push(p);
    }
    cent = groups.map((g, j) => (g.length ? [0, 1, 2].map((n) => g.reduce((s, p) => s + p[n], 0) / g.length) : cent[j]));
  }
  // biggest colour first, with its share of the image
  return cent.map((q, j) => ({ lab: q, share: groups[j].length / px.length })).sort((a, b) => b.share - a.share);
}

function addPanel(entry, dayIndex, { stagger = true } = {}) {
  const cellId = state.faceOrder[dayIndex];
  const cell = state.faces[cellId];
  state.faceToEntry.set(cellId, dayIndex);

  const mat = fadeBackside(new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
  }));
  const mesh = new THREE.Mesh(cellPatch(cell, { gap: PANEL_GAP, r: NET_R * 1.003 }), mat);
  mesh.userData = { dayIndex, cellId, born: performance.now() + (stagger ? dayIndex * 40 : 0) };
  panelGroup.add(mesh);
  state.panelMeshes.push(mesh);

  const frame = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(cellOutline(cell, PANEL_GAP * 0.6, NET_R * 1.004)),
    fadeBackside(new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9 }))
  );
  panelGroup.add(frame);
  mesh.userData.frame = frame;

  // "cover" fit: crop the image to the panel's proportions, centred
  const fit = (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const ia = tex.image.width / tex.image.height;
    const pa = cell.aspect * (1 - 2 * PANEL_GAP);
    if (ia > pa) { tex.repeat.set(pa / ia, 1); tex.offset.set((1 - pa / ia) / 2, 0); }
    else { tex.repeat.set(1, ia / pa); tex.offset.set(0, (1 - ia / pa) / 2); }
    return tex;
  };

  // video panels: the globe flips through a few small stills; the clip itself only loads in the card
  if (entry.frames?.length) {
    const frames = (mesh.userData.frames = []);
    entry.frames.forEach((path, i) => {
      loadTexture(path, (tex) => { frames[i] = fit(tex); });
    });
    mesh.userData.frameOffset = Math.random() * FRAME_MS;   // so video panels don't all flip together
  }

  loadTexture(entry.image, (tex) => {
    fit(tex);
    mesh.userData.still = tex;
    mat.map = tex;
    try {
      const pal = palette(tex.image);
      if (pal) { state.palettes.set(entry, pal); window.dispatchEvent(new CustomEvent('orbit:palette')); }
    } catch { /* cross-origin or odd format */ }
    mat.needsUpdate = true;
  }, () => {
    mat.color.set(ACCENT); // no image: show a solid lit cell
  });
}

/* ------------------------------------------------------------------ *
 *  Adding panels after load
 * ------------------------------------------------------------------ */
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

function disposeGroup(group) {
  for (const o of [...group.children]) {
    group.remove(o);
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) { m?.map?.dispose(); m?.dispose(); }
    o.userData?.still?.dispose();
    for (const f of o.userData?.frames || []) f?.dispose();
  }
}

/** Re-sort entries and redraw every panel (and grow the net if it's full). */
function rebuildPanels({ fresh = null } = {}) {
  state.entries.sort(byDate);                 // in place: other modules hold this same array
  if (state.entries.length > state.faces.length) {
    disposeGroup(netGroup);
    state.faces = [];
    buildNet(state.entries.length);
  }
  disposeGroup(panelGroup);
  state.panelMeshes = [];
  state.faceToEntry.clear();
  state.entries.forEach((e, i) => addPanel(e, i, { stagger: false }));
  // only the new panel fades in; the rest appear at once
  for (const m of state.panelMeshes) if (state.entries[m.userData.dayIndex] !== fresh) m.material.opacity = 0.95;
  document.getElementById('filled').textContent = state.entries.length;
  window.dispatchEvent(new CustomEvent('orbit:entries'));
}

/** Add a new entry to the globe; returns its index. */
function addEntry(entry) {
  state.entries.push(entry);
  rebuildPanels({ fresh: entry });
  return state.entries.indexOf(entry);
}

/* ------------------------------------------------------------------ *
 *  Core style switch
 * ------------------------------------------------------------------ */
const coreSwitch = document.getElementById('core-switch');
let coreMode = 'frosted';
try {
  const q = new URLSearchParams(location.search).get('core');
  const saved = localStorage.getItem('designOrbit.core');
  coreMode = CORE_MODES.includes(q) ? q : CORE_MODES.includes(saved) ? saved : 'frosted';
} catch { /* keep default */ }

function setCoreMode(mode) {
  coreMode = mode;
  core.body.material = mode === 'planet' ? core.solid : core.frost;
  core.dots.visible = mode === 'planet';
  coreSwitch.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.core === mode)));
  try { localStorage.setItem('designOrbit.core', mode); } catch { /* ignore */ }
}
coreSwitch.addEventListener('click', (e) => {
  const b = e.target.closest('[data-core]');
  if (b) setCoreMode(b.dataset.core);
});

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

// Two ways to turn the globe with a mouse:
//   normal – drag to turn
//   follow – click once (not on a lit panel) and the globe turns with the cursor; click again to release
let following = false;
let lastMove = null;
let hintKey = '';

function setFollowing(on) {
  following = on;
  lastMove = null;
  hintKey = '';
  canvas.classList.toggle('following', on);
  document.body.classList.toggle('following', on);
  controls._sphericalDelta?.set(0, 0, 0);
}

function setHover(faceId, x, y, mouse = true) {
  if (faceId !== hoveredFace) {
    hoveredFace = faceId;
    if (faceId < 0) state.hoverMesh.visible = false;
    else {
      state.hoverMesh.geometry.dispose();
      state.hoverMesh.geometry = cellPatch(state.faces[faceId], { gap: 0.02, r: NET_R * 1.002, segs: 4 });
      state.hoverMesh.visible = true;
    }
  }
  if (x === undefined) { tooltip.hidden = true; canvas.classList.remove('pointer'); hintKey = ''; return; }

  // the label that travels with the cursor: what's here + what a click does
  const dayIndex = faceId >= 0 ? state.faceToEntry.get(faceId) : undefined;
  const key = `${dayIndex ?? 'x'}|${following}|${mouse}`;
  if (key !== hintKey) {
    hintKey = key;
    let html = '';
    if (dayIndex !== undefined) {
      const e = state.entries[dayIndex];
      html = `<span class="d">${String(dayIndex + 1).padStart(3, '0')}</span>${escapeHTML(e.title)}<small>${e.video ? '▶ Video · click to play' : 'Click to open'}</small>`;
    } else if (mouse) {
      html = following
        ? '<span class="dot"></span>Following your cursor<small>Click to release</small>'
        : 'Drag to turn<small><b class="hl">Click once</b> and the globe follows your cursor</small>';
    }
    tooltip.innerHTML = html;
    tooltip.hidden = !html;
    canvas.classList.toggle('pointer', dayIndex !== undefined);
  }
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function escapeHTML(s = '') {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Hover picking runs at most once per frame, and never while dragging.
let pendingHover = null;
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons) { setHover(-1); pendingHover = null; lastMove = null; return; }
  if (following && e.pointerType === 'mouse') {
    if (lastMove) {
      const k = (2 * Math.PI * controls.rotateSpeed) / canvas.clientHeight;
      controls._rotateLeft(k * (e.clientX - lastMove.x));
      controls._rotateUp(k * (e.clientY - lastMove.y));
    }
    lastMove = { x: e.clientX, y: e.clientY };
  }
  pendingHover = { x: e.clientX, y: e.clientY, mouse: e.pointerType === 'mouse' };
});
function processHover() {
  if (!pendingHover) return;
  const { x, y, mouse } = pendingHover;
  pendingHover = null;
  setHover(pick(x, y), x, y, mouse);
}
canvas.addEventListener('pointerleave', () => { pendingHover = null; lastMove = null; setHover(-1); });
let panelClosedAt = 0;
const panelBusy = () => state.current >= 0 || document.body.classList.contains('panel-open') || performance.now() - panelClosedAt < 600;
canvas.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY, panel: panelBusy() };
  dragging = true;
  controls._sphericalDelta?.set(0, 0, 0);   // drop the spin's leftover momentum: the globe stops the instant you grab it
});
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointercancel', () => { dragging = false; });
window.addEventListener('blur', () => { dragging = false; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  const startedWithPanel = downAt.panel;
  downAt = null;
  if (startedWithPanel) return;
  if (moved > 5) return;
  const faceId = pick(e.clientX, e.clientY);
  const dayIndex = state.faceToEntry.get(faceId);
  if (dayIndex !== undefined) { setFollowing(false); openEntry(dayIndex); }
  // follow mode only from a clean click on the globe while no panel is open (not the click that closed one)
  else if (e.pointerType === 'mouse' && !panelBusy()) {
    setFollowing(!following);
    pendingHover = { x: e.clientX, y: e.clientY, mouse: true };   // refresh the hint straight away
  }
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
  // a video panel plays in the card; its still frame is what the globe shows
  const vid = el('p-video');
  el('p-image').hidden = !!e.video;
  vid.hidden = !e.video;
  el('vid-ui').hidden = !e.video;
  if (e.video) {
    const src = resolveImage(e.video);
    if (vid.dataset.src !== src) {
      vid.dataset.src = src;
      vid.poster = resolveImage(e.image);
      // videos in the bucket are on another address: ask for them in a way that lets Magnify read a frame
      const remote = /^https?:/.test(src) && !src.startsWith(location.origin);
      if (remote) vid.crossOrigin = 'anonymous'; else vid.removeAttribute('crossorigin');
      vid.onerror = remote ? () => { vid.onerror = null; vid.removeAttribute('crossorigin'); vid.src = src; vid.play().catch(() => {}); } : null;
      vid.src = src;
    }
    vid.muted = true;
    vid.play().catch(() => {});
  } else if (vid.dataset.src) {
    vid.pause(); vid.removeAttribute('src'); vid.removeAttribute('poster'); delete vid.dataset.src; vid.load();
  }
  el('p-image').src = resolveImage(e.image);
  el('p-image').alt = e.title;
  el('p-day').textContent = `Day ${String(dayIndex + 1).padStart(3, '0')} · ${formatDate(e.date)}`;
  el('p-title').textContent = e.title;
  el('p-note').textContent = e.note || '';
  el('prev').disabled = dayIndex === 0;
  el('next').disabled = dayIndex === state.entries.length - 1;

  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('panel-open');
  history.replaceState(null, '', `#day-${dayIndex + 1}`);

  state.panelMeshes.forEach((m) => { m.userData.focus = m.userData.dayIndex === dayIndex; });
  if (fly) flyTo(state.faces[state.faceOrder[dayIndex]].centroid, FOCUS_DIST);
  window.dispatchEvent(new CustomEvent('orbit:open', { detail: { dayIndex } }));
}

function closePanel() {
  if (!panel.classList.contains('open')) return;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  el('p-video').pause();
  document.body.classList.remove('panel-open');
  state.current = -1;
  state.panelMeshes.forEach((m) => { m.userData.focus = false; });
  history.replaceState(null, '', location.pathname + location.search);
  flyTo(camera.position.clone(), CAMERA_DIST);
  panelClosedAt = performance.now();
  setFollowing(false);
  window.dispatchEvent(new CustomEvent('orbit:close'));
}

el('close').addEventListener('click', closePanel);
el('scrim').addEventListener('click', closePanel);
el('prev').addEventListener('click', () => openEntry(state.current - 1));
el('next').addEventListener('click', () => openEntry(state.current + 1));
window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, [contenteditable]')) return;
  if (e.key === 'Escape') { if (state.current < 0 && following) setFollowing(false); closePanel(); }
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

let prevTick = performance.now();
function tick() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - prevTick) / 1000);   // seconds since last frame (capped after a tab switch)
  prevTick = now;
  adaptResolution(now);
  processHover();
  const t = clock.getElapsedTime();
  if (state.nodeMat) state.nodeMat.uniforms.uTime.value = t;

  for (const m of state.panelMeshes) {
    const fr = m.userData.frames;
    if (fr && m.userData.still) {
      const ready = fr.filter(Boolean);
      if (ready.length) {
        const next = ready[Math.floor((now + m.userData.frameOffset) / FRAME_MS) % ready.length];
        if (m.material.map !== next) { m.material.map = next; m.material.needsUpdate = true; }
      }
    }
    const age = Math.max(0, (now - m.userData.born) / 900);
    const hl = state.highlight;
    const lit = hl && hl.size && hl.has(m.userData.dayIndex);
    let target;
    if (state.current >= 0) target = m.userData.focus ? 0.95 : 0.45;
    else if (hl && hl.size) target = lit ? 1 : 0.22;
    else target = 0.95;
    m.material.opacity += (Math.min(age, 1) * target - m.material.opacity) * 0.12;
    const f = m.userData.frame;
    if (f) f.material.opacity = lit ? 0.55 + 0.45 * Math.sin(t * 5) : hl && hl.size ? 0.3 : 0.9;
  }

  uBackFade.value += (BACK_FADE[coreMode] - uBackFade.value) * 0.1;
  stepFlight(now);
  controls.autoRotate = !dragging && !following && state.current < 0;
  // with a panel open the globe holds perfectly still (no leftover glide), so the panel stays centred
  if (!flight && state.current < 0) controls.update(dt);   // dt keeps the spin the same speed on any screen
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
  setCoreMode(coreMode);
  window.orbit = {
    state,
    camera,
    controls,
    ready: true,
    openEntry,
    // light up a set of panels (by entry index); [] clears
    highlightEntries(indices) { state.highlight = new Set(indices); },
    addEntry,
    refreshPanels: () => rebuildPanels(),
    // turn the globe to face a panel without opening it
    focusEntry(i) {
      if (!state.entries[i]) return;
      flyTo(state.faces[state.faceOrder[i]].centroid, CAMERA_DIST * 0.82);
    },
  };
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

/* ------------------------------------------------------------------ *
 *  "?" help: hints live in a corner pop-up instead of over the globe
 * ------------------------------------------------------------------ */
{
  const help = document.getElementById('help');
  const btn = document.getElementById('help-btn');
  const set = (open) => { help.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', () => set(!help.classList.contains('open')));
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#help')) set(false); });
  // show once per browser on the first visit, then tuck away
  let seen = false;
  try { seen = localStorage.getItem('designOrbit.helpSeen') === '1'; } catch { /* ignore */ }
  if (!seen) {
    const show = () => {
      if (document.body.classList.contains('gated')) { setTimeout(show, 500); return; }
      set(true);
      try { localStorage.setItem('designOrbit.helpSeen', '1'); } catch { /* ignore */ }
      setTimeout(() => set(false), 6000);
    };
    setTimeout(show, 1200);
  }
}

/* ------------------------------------------------------------------ *
 *  Video in the card: loops forever; click to pause / play.
 *  While paused you can magnify the frame, or drag the bar to another moment.
 * ------------------------------------------------------------------ */
{
  const vid = document.getElementById('p-video');
  const ui = document.getElementById('vid-ui');
  const bar = document.getElementById('vid-bar');
  const fill = document.getElementById('vid-fill');
  const sound = document.getElementById('vid-sound');
  const sync = () => ui.classList.toggle('paused', vid.paused);
  vid.addEventListener('click', () => { if (vid.paused) vid.play().catch(() => {}); else vid.pause(); });
  vid.addEventListener('play', sync);
  vid.addEventListener('pause', sync);
  // videos shrunk in the browser don't carry their length; this makes the browser work it out
  vid.addEventListener('loadedmetadata', () => {
    if (vid.duration !== Infinity) return;
    const back = () => { vid.removeEventListener('durationchange', back); vid.currentTime = 0; };
    vid.addEventListener('durationchange', back);
    vid.currentTime = 1e9;
  });
  vid.addEventListener('timeupdate', () => {
    const d = Number.isFinite(vid.duration) ? vid.duration : 0;
    fill.style.width = d ? `${(vid.currentTime / d) * 100}%` : '0%';
  });
  sound.addEventListener('click', () => {
    vid.muted = !vid.muted;
    sound.textContent = vid.muted ? 'Sound off' : 'Sound on';
    sound.setAttribute('aria-pressed', String(!vid.muted));
  });
  window.addEventListener('orbit:open', () => { sound.textContent = 'Sound off'; sound.setAttribute('aria-pressed', 'false'); sync(); });
  const seek = (e) => {
    const r = bar.getBoundingClientRect();
    if (Number.isFinite(vid.duration)) vid.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * vid.duration;
  };
  bar.addEventListener('pointerdown', (e) => { bar.setPointerCapture(e.pointerId); seek(e); });
  bar.addEventListener('pointermove', (e) => { if (e.buttons) seek(e); });
  bar.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.stopPropagation();
    vid.currentTime = Math.min(vid.duration || 0, Math.max(0, vid.currentTime + (e.key === 'ArrowRight' ? 1 : -1)));
  });
}
