'use strict';
// SchoolSim — 3D view (Three.js): the classroom, characters, camera + controls, sounds and effects.
// Shares globals with client.js (state, me(), send, keys, floaters, teacherTarget, …).

const S = 1 / 20; // sim pixels -> world units
const ROOM_W = W * S, ROOM_D = H * S, WALL_H = 6, IN = WALL * S;
const TALK_RANGE = 320;
const SEAT_DY = 36;

// ---- Renderer & scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fd3ff');
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 300);
camera.position.set(ROOM_W / 2, 30, ROOM_D + 20);

function resize3d() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize3d); resize3d();

scene.add(new THREE.HemisphereLight('#fff7e8', '#8a6a4a', 0.75));
const sun = new THREE.DirectionalLight('#fff3d6', 0.85);
sun.position.set(-14, 24, 12);
sun.target.position.set(ROOM_W / 2, 0, ROOM_D / 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 80 });
scene.add(sun, sun.target);

// ---- Helpers ------------------------------------------------------------------
const mat = (color, extra) => new THREE.MeshLambertMaterial({ color, ...extra });
function box(w, h, d, material, x, y, z, parent = scene) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}
function plane(w, h, material, x, y, z, ry = 0, parent = scene) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true;
  parent.add(m);
  return m;
}
const hashStr = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

// ---- Classroom ------------------------------------------------------------------
const floorTex = canvasTex(512, 512, (g, w, h) => {
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `hsl(32, ${42 + (i % 3) * 6}%, ${52 + ((i * 7) % 5) * 2}%)`;
    g.fillRect(0, i * 64, w, 64);
    g.fillStyle = 'rgba(70,40,15,.35)'; g.fillRect(0, i * 64, w, 2);
    g.fillRect(((i * 173) % 400) + 40, i * 64, 2, 64);
  }
});
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set(4, 3);
const floor = plane(ROOM_W, ROOM_D, mat('#ffffff', { map: floorTex }), ROOM_W / 2, 0, ROOM_D / 2);
floor.rotation.x = -Math.PI / 2;

const wallMat = mat('#f4ead5'), trimMat = mat('#8fb8a8'), woodMat = mat('#8b5a2b'), darkWood = mat('#5d3a1a');
box(ROOM_W, WALL_H, 0.4, wallMat, ROOM_W / 2, WALL_H / 2, IN - 0.2);
box(ROOM_W, WALL_H, 0.4, wallMat, ROOM_W / 2, WALL_H / 2, ROOM_D - IN + 0.2);
box(0.4, WALL_H, ROOM_D, wallMat, IN - 0.2, WALL_H / 2, ROOM_D / 2);
box(0.4, WALL_H, ROOM_D, wallMat, ROOM_W - IN + 0.2, WALL_H / 2, ROOM_D / 2);
// wainscot trim
box(ROOM_W, 1.1, 0.1, trimMat, ROOM_W / 2, 0.55, IN + 0.02);
box(ROOM_W, 1.1, 0.1, trimMat, ROOM_W / 2, 0.55, ROOM_D - IN - 0.02);
box(0.1, 1.1, ROOM_D, trimMat, IN + 0.02, 0.55, ROOM_D / 2);
box(0.1, 1.1, ROOM_D, trimMat, ROOM_W - IN - 0.02, 0.55, ROOM_D / 2);

// windows (left wall), glowing sky
const skyMat = new THREE.MeshBasicMaterial({ color: '#cdeeff' });
for (const y of [120, 260, 400]) {
  const z = (y + 40) * S;
  plane(4, 2.6, skyMat, IN + 0.06, 3.3, z, Math.PI / 2);
  box(0.12, 0.15, 4.2, mat('#ffffff'), IN + 0.08, 2, z);
  box(0.12, 0.15, 4.2, mat('#ffffff'), IN + 0.08, 4.6, z);
  box(0.12, 2.6, 0.12, mat('#ffffff'), IN + 0.08, 3.3, z);
}
// door (right wall)
box(0.15, 4.2, 3.6, woodMat, ROOM_W - IN - 0.05, 2.1, 570 * S);
box(0.2, 0.2, 0.2, mat('#ffd43b'), ROOM_W - IN - 0.2, 2.1, 570 * S - 1.3);
// exit sign
plane(1.4, 0.45, new THREE.MeshBasicMaterial({ map: canvasTex(256, 80, (g) => { g.fillStyle = '#2b8a3e'; g.fillRect(0, 0, 256, 80); g.fillStyle = '#fff'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.fillText('EXIT', 128, 60); }) }), ROOM_W - IN - 0.06, 4.6, 570 * S, -Math.PI / 2);

// blackboard with a live canvas texture
const boardCanvas = document.createElement('canvas'); boardCanvas.width = 1024; boardCanvas.height = 180;
const boardTex = new THREE.CanvasTexture(boardCanvas); boardTex.encoding = THREE.sRGBEncoding;
box(19.2, 2.8, 0.15, woodMat, 24, 3.4, IN + 0.08);
plane(18.6, 2.4, mat('#ffffff', { map: boardTex }), 24, 3.4, IN + 0.17);
box(18.6, 0.12, 0.35, woodMat, 24, 2.15, IN + 0.25);
let boardKey = '';
function drawBoard(g) {
  const key = [g.topic, g.teacher.teaching].join('|');
  if (key === boardKey) return;
  boardKey = key;
  const c = boardCanvas.getContext('2d');
  c.fillStyle = g.teacher.teaching ? '#2f6b45' : '#24513a'; c.fillRect(0, 0, 1024, 180);
  c.fillStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < 40; i++) c.fillRect(Math.random() * 1024, Math.random() * 180, 60, 2);
  c.fillStyle = 'rgba(255,255,255,.92)'; c.textAlign = 'center';
  c.font = 'bold 54px "Comic Sans MS", "Chalkboard SE", cursive';
  c.fillText(g.topic ? g.topicName : 'No topic yet…', 512, 70);
  c.font = '32px "Comic Sans MS", "Chalkboard SE", cursive';
  c.fillText(g.topic ? g.board : 'Teacher: press T → Topic', 512, 135);
  boardTex.needsUpdate = true;
}

// clock
const clock = new THREE.Group(); clock.position.set(40, 4.9, IN + 0.12); scene.add(clock);
const face = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), mat('#ffffff')); clock.add(face);
const rim = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.68, 32), mat('#333333')); clock.add(rim);
const minHand = box(0.05, 0.5, 0.02, mat('#222222'), 0, 0.22, 0.03, new THREE.Group()); clock.add(minHand.parent);
const secHand = box(0.025, 0.55, 0.02, mat('#e03131'), 0, 0.25, 0.05, new THREE.Group()); clock.add(secHand.parent);

// posters
function poster(text, bg, fg, x, y, z, ry, w = 2.2, h = 1.5) {
  plane(w, h, mat('#ffffff', { map: canvasTex(256, 176, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 256, 176);
    g.fillStyle = fg; g.textAlign = 'center'; g.font = 'bold 34px sans-serif';
    text.split('\n').forEach((l, i, a) => g.fillText(l, 128, 96 - (a.length - 1) * 20 + i * 42));
  }) }), x, y, z, ry);
}
poster('READ\nEVERY DAY!', '#ffd166', '#5f3dc4', 8, 3.8, IN + 0.06, 0);
poster('2 + 2 = 4\n3 × 3 = 9', '#74c0fc', '#1c3d5a', 44.5, 3, IN + 0.06, 0, 2, 1.3);
poster('BE KIND', '#ff8787', '#ffffff', ROOM_W - IN - 0.06, 3.6, 8, -Math.PI / 2);
poster('NO PHONES\nIN CLASS!', '#ffffff', '#c92a2a', ROOM_W - IN - 0.06, 3.6, 13, -Math.PI / 2);
poster('🌍 WORLD', '#69db7c', '#0b3d1f', ROOM_W - IN - 0.06, 3.6, 21, -Math.PI / 2);

// bookshelf (right wall)
box(1, 2.4, 4, woodMat, ROOM_W - IN - 0.55, 1.2, 17.5);
for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) {
  box(0.7, 0.55, 0.32, mat(['#e03131', '#1971c2', '#2f9e44', '#f08c00', '#7048e8'][(i + r) % 5]), ROOM_W - IN - 0.6, 0.45 + r * 0.75, 15.8 + i * 0.38);
}

// teacher desk with an apple
const tdx = TDESK.x * S, tdz = TDESK.y * S, tdw = TDESK.w * S, tdd = TDESK.h * S;
box(tdw, 0.15, tdd, darkWood, tdx, 1.5, tdz);
box(tdw, 1.45, 0.1, darkWood, tdx, 0.72, tdz + tdd / 2 - 0.05);
box(0.1, 1.45, tdd, darkWood, tdx - tdw / 2 + 0.05, 0.72, tdz);
box(0.1, 1.45, tdd, darkWood, tdx + tdw / 2 - 0.05, 0.72, tdz);
const apple = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), mat('#e03131')); apple.position.set(tdx + 2.4, 1.8, tdz); apple.castShadow = true; scene.add(apple);
box(0.05, 0.12, 0.05, mat('#5c3d1e'), tdx + 2.4, 2.05, tdz);
box(1, 0.35, 0.7, mat('#1971c2'), tdx - 2, 1.75, tdz);
box(0.9, 0.04, 0.65, mat('#ffffff'), tdx, 1.6, tdz);

// student desks & chairs
const deskTop = mat('#c08a54'), metal = mat('#6c757d'), chairMat = mat('#4dabf7');
for (const d of DESKS) {
  const x = d.x * S, z = d.y * S;
  box(3.5, 0.12, 2, deskTop, x, 1.3, z);
  for (const [dx, dz] of [[-1.6, -0.85], [1.6, -0.85], [-1.6, 0.85], [1.6, 0.85]]) box(0.1, 1.25, 0.1, metal, x + dx, 0.62, z + dz);
  const cz = (d.y + SEAT_DY) * S + 0.15;
  box(1.2, 0.1, 1.1, chairMat, x, 0.8, cz);
  box(1.2, 1, 0.1, chairMat, x, 1.35, cz + 0.55);
  for (const [dx, dz] of [[-0.5, -0.45], [0.5, -0.45], [-0.5, 0.45], [0.5, 0.45]]) box(0.07, 0.8, 0.07, metal, x + dx, 0.4, cz + dz);
}

// detention corner: red rug + sign
const rug = plane(DETENTION.w * S, DETENTION.h * S, mat('#ffffff', { map: canvasTex(256, 192, (g) => {
  g.fillStyle = '#c92a2a'; g.fillRect(0, 0, 256, 192);
  g.strokeStyle = '#ffa8a8'; g.lineWidth = 10; for (let i = -200; i < 400; i += 34) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 192, 192); g.stroke(); }
  g.fillStyle = '#fff'; g.font = 'bold 36px sans-serif'; g.textAlign = 'center'; g.fillText('DETENTION', 128, 108);
}) }), (DETENTION.x + DETENTION.w / 2) * S, 0.02, (DETENTION.y + DETENTION.h / 2) * S);
rug.rotation.x = -Math.PI / 2;
poster('⛓ DETENTION ⛓\nThink about it.', '#212529', '#ff6b6b', IN + 0.06, 3, (DETENTION.y + 40) * S, Math.PI / 2, 2.6, 1.4);

// ---- Characters -----------------------------------------------------------------
const HAIR = ['#2b1d0e', '#6b3e1f', '#e0b04c', '#111111', '#a33b20', '#d9d0c1', '#3b2a1a'];
const SKIN = ['#f2c9a0', '#e0ac7e', '#c68642', '#8d5524', '#ffdbac'];
const people = new Map(); // id -> character rig

function makePerson(e, teacher) {
  const h = hashStr(e.name + e.id);
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const skin = mat(SKIN[h % SKIN.length]), shirt = mat(e.color), pants = mat(teacher ? '#2f2f3a' : ['#34495e', '#1c3d5a', '#5c4033', '#2b2b2b'][h % 4]);
  const limb = (x, y, w, len, m) => { const p = new THREE.Group(); p.position.set(x, y, 0); body.add(p); box(w, len, w, m, 0, -len / 2, 0, p); return p; };
  const legL = limb(-0.2, 0.95, 0.3, 0.95, pants), legR = limb(0.2, 0.95, 0.3, 0.95, pants);
  box(0.85, 1, 0.5, shirt, 0, 1.45, 0, body);
  const armL = limb(-0.56, 1.9, 0.24, 0.9, shirt), armR = limb(0.56, 1.9, 0.24, 0.9, shirt);
  box(0.22, 0.22, 0.22, skin, 0, -0.95, 0, armL); box(0.22, 0.22, 0.22, skin, 0, -0.95, 0, armR);
  const head = new THREE.Group(); head.position.set(0, 2.32, 0); body.add(head);
  box(0.72, 0.72, 0.72, skin, 0, 0, 0, head);
  const hair = mat(teacher ? '#7d7d7d' : HAIR[h % HAIR.length]);
  box(0.78, 0.2, 0.78, hair, 0, 0.42, 0, head);
  box(0.78, 0.5, 0.15, hair, 0, 0.18, -0.36, head);
  const eye = mat('#1b1b1b');
  box(0.12, 0.12, 0.04, eye, -0.16, 0.06, 0.37, head); box(0.12, 0.12, 0.04, eye, 0.16, 0.06, 0.37, head);
  const mouth = box(0.24, 0.05, 0.04, mat('#7a2e2e'), 0, -0.18, 0.37, head);
  if (teacher) {
    const frame = mat('#111');
    box(0.24, 0.2, 0.02, frame, -0.16, 0.06, 0.39, head); box(0.24, 0.2, 0.02, frame, 0.16, 0.06, 0.39, head);
    box(0.12, 0.6, 0.04, mat('#c92a2a'), 0, 1.5, 0.27, body); // tie
  } else {
    box(0.5, 0.6, 0.25, mat(['#f03e3e', '#fab005', '#12b886', '#7950f2'][h % 4]), 0, 1.5, -0.37, body); // backpack
  }
  const phone = box(0.18, 0.3, 0.05, mat('#111'), 0, -1.05, 0.15, armR); phone.visible = false;
  // rain cloud for detention
  const cloud = new THREE.Group(); cloud.position.set(0, 3.5, 0); g.add(cloud); cloud.visible = false;
  for (const [x, y] of [[-0.3, 0], [0, 0.12], [0.3, 0]]) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat('#6c757d')); c.position.set(x, y, 0); cloud.add(c); }
  // selection ring on the floor
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 32), new THREE.MeshBasicMaterial({ color: '#ff922b', transparent: true, opacity: 0.9 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.visible = false; g.add(ring);
  if (teacher) g.scale.setScalar(1.22);
  scene.add(g);
  return { g, body, legL, legR, armL, armR, head, mouth, phone, cloud, ring, walk: 0, px: e.x, py: e.y, teacher };
}

function seatOf(e) { const d = DESKS[+e.id.slice(1)]; return d ? { x: d.x, y: d.y + SEAT_DY } : null; }

function animatePerson(r, e, dt, now) {
  const k = 1 - Math.exp(-dt * 16);
  const jump = Math.hypot(e.x - r.px, e.y - r.py) > 80;
  const ox = r.px, oy = r.py;
  r.px = jump ? e.x : r.px + (e.x - r.px) * k;
  r.py = jump ? e.y : r.py + (e.y - r.py) * k;
  const speed = jump ? 0 : Math.hypot(r.px - ox, r.py - oy) / Math.max(dt, 1e-3);
  r.g.position.set(r.px * S, 0, r.py * S);
  // turn smoothly toward the facing angle
  const target = Math.PI / 2 - e.a;
  let d = target - r.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
  r.g.rotation.y += d * Math.min(1, dt * 14);
  r.g.visible = !e.office;

  // reset pose
  for (const p of [r.legL, r.legR, r.armL, r.armR]) p.rotation.set(0, 0, 0);
  r.body.position.set(0, 0, 0); r.body.rotation.set(0, 0, 0); r.head.rotation.set(0, 0, 0);
  r.phone.visible = false;
  r.cloud.visible = !!e.det;

  const seat = !r.teacher && seatOf(e);
  const seated = seat && speed < 8 && Math.hypot(e.x - seat.x, e.y - seat.y) < 12 && e.act !== 'dance' && !e.det;
  if (speed > 8) {
    r.walk += dt * speed * 0.09;
    const s = Math.sin(r.walk) * 0.75;
    r.legL.rotation.x = s; r.legR.rotation.x = -s; r.armL.rotation.x = -s * 0.8; r.armR.rotation.x = s * 0.8;
    r.body.position.y = Math.abs(Math.cos(r.walk)) * 0.12;
  } else if (seated) {
    r.body.position.y = -0.2;
    r.legL.rotation.x = r.legR.rotation.x = -Math.PI / 2;
  }
  if (e.det) { r.head.rotation.x = 0.45; r.armL.rotation.z = 0.2; r.armR.rotation.z = -0.2; r.cloud.position.y = 3.5 + Math.sin(now * 3) * 0.08; }
  if (e.act === 'phone') { r.armR.rotation.x = -1.25; r.phone.visible = true; r.head.rotation.x = 0.35; }
  if (e.act === 'note') { r.armR.rotation.x = -1.45; }
  if (e.hand) { r.armR.rotation.x = -Math.PI; r.armR.rotation.z = Math.sin(now * 8) * 0.12; }
  if (e.act === 'dance') {
    r.body.rotation.y = Math.sin(now * 9) * 0.7;
    r.body.position.y = Math.abs(Math.sin(now * 9)) * 0.35;
    r.armL.rotation.z = 2.4 + Math.sin(now * 18) * 0.4; r.armR.rotation.z = -2.4 - Math.sin(now * 18) * 0.4;
    r.legL.rotation.x = Math.sin(now * 9) * 0.5; r.legR.rotation.x = -Math.sin(now * 9) * 0.5;
  }
  if (r.teacher && e.teaching) { r.armR.rotation.x = -2.1 + Math.sin(now * 10) * 0.15; r.armR.rotation.z = Math.sin(now * 7) * 0.2; }
  // talking mouth
  r.mouth.scale.y = e.say ? 1 + Math.abs(Math.sin(now * 18)) * 3 : 1;
}

// teacher vision cone
const coneGeo = new THREE.CircleGeometry(VIEW_RANGE * S, 40, -VIEW_HALF, VIEW_HALF * 2);
const coneMat = new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
const cone = new THREE.Group(); const coneMesh = new THREE.Mesh(coneGeo, coneMat);
coneMesh.rotation.x = -Math.PI / 2; cone.add(coneMesh); cone.position.y = 0.05; scene.add(cone);

// paper balls and notes
const ballGeo = new THREE.IcosahedronGeometry(0.24, 0), paperMat = mat('#f8f9fa');
const ballPool = [], notePool = [];
function pooled(pool, i, make) { while (pool.length <= i) { const m = make(); scene.add(m); pool.push(m); } return pool[i]; }

// confetti particles
const confetti = [];
const confGeo = new THREE.PlaneGeometry(0.18, 0.12);
function burst(x, y, z, n, colors) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(confGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide }));
    m.position.set(x, y, z); scene.add(m);
    confetti.push({ m, vx: (Math.random() - 0.5) * 6, vy: 3 + Math.random() * 5, vz: (Math.random() - 0.5) * 6, life: 1.6 + Math.random() });
  }
}

// ---- Sound (synthesized, no files) -------------------------------------------------
let actx = null, master = null, muted = false;
function audio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return actx; }
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); master = actx.createGain(); master.gain.value = 0.8; master.connect(actx.destination); } catch { actx = null; }
  return actx;
}
addEventListener('pointerdown', audio); addEventListener('keydown', audio);
function tone(freq, dur, type = 'sine', vol = 0.15, slideTo = 0, delay = 0) {
  if (!actx || muted) return;
  const t0 = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(dur, vol, freq, delay = 0) {
  if (!actx || muted) return;
  const t0 = actx.currentTime + delay, len = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, len, actx.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t0);
}
const SFX = {
  bell() { for (let i = 0; i < 10; i++) tone(i % 2 ? 1320 : 1568, 0.2, 'triangle', 0.07, 0, i * 0.09); },
  blip(p) { tone(p, 0.07, 'square', 0.025); },
  splat() { noise(0.22, 0.35, 900); },
  bonk() { tone(520, 0.4, 'sine', 0.35, 70); noise(0.1, 0.2, 3000); },
  whistle() { tone(2300, 0.18, 'sine', 0.1); tone(2300, 0.45, 'sine', 0.1, 0, 0.22); },
  fart() { tone(95, 0.7, 'sawtooth', 0.2, 42); noise(0.6, 0.06, 250); },
  ding() { tone(880, 0.25, 'sine', 0.14); tone(1320, 0.45, 'sine', 0.14, 0, 0.12); },
  buzz() { tone(140, 0.45, 'square', 0.07, 110); },
  whoosh() { noise(0.15, 0.15, 2500); },
  pop() { tone(600, 0.12, 'sine', 0.12, 1200); },
  tada() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 'triangle', 0.1, 0, i * 0.1)); },
};
function speechBlips(e, text) {
  if (text.includes('fart')) return SFX.fart();
  const base = e.id === 'T' ? 180 : 320 + (hashStr(e.name) % 260);
  const n = Math.min(7, 2 + Math.floor(text.length / 8));
  for (let i = 0; i < n; i++) tone(base * (0.85 + Math.random() * 0.4), 0.06, 'square', 0.022, 0, i * 0.075);
}

// ---- HTML overlays: name tags, speech bubbles, floating text -----------------------------
const labelLayer = $('labels');
const labels = new Map();
function labelFor(id) {
  let l = labels.get(id);
  if (!l) {
    l = document.createElement('div'); l.className = 'lbl';
    l.innerHTML = '<div class="bubble"></div><div class="nm"><span class="ic"></span><span class="tx"></span></div>';
    labelLayer.appendChild(l); labels.set(id, l);
    l._b = l.querySelector('.bubble'); l._ic = l.querySelector('.ic'); l._tx = l.querySelector('.tx');
  }
  return l;
}
const tmpV = new THREE.Vector3();
function project(x, y, z) {
  tmpV.set(x, y, z).project(camera);
  if (tmpV.z > 1 || tmpV.z < -1) return null;
  return { x: (tmpV.x + 1) / 2 * innerWidth, y: (1 - tmpV.y) / 2 * innerHeight, d: camera.position.distanceTo(new THREE.Vector3(x, y, z)) };
}
const floatEls = [];

// ---- Camera & controls -------------------------------------------------------------
let yaw = -Math.PI / 2, pitch = 0.32, camMode = 'third', shake = 0;
let mouseNdc = new THREE.Vector2(), mouseAim = null;
const ray = new THREE.Raycaster(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const locked = () => document.pointerLockElement === canvas;
const inGame = () => state && state.game && (state.phase === 'class' || state.phase === 'recess') && me();

addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'KeyV') { camMode = camMode === 'third' ? 'top' : 'third'; if (camMode === 'top' && locked()) document.exitPointerLock(); toast(camMode === 'top' ? 'Bird\'s-eye view' : 'Third-person view'); }
  if (e.code === 'KeyM') { muted = !muted; toast(muted ? 'Sound off' : 'Sound on'); }
});
canvas.addEventListener('mousemove', e => {
  if (locked()) {
    yaw += e.movementX * 0.0026;
    pitch = Math.max(-0.15, Math.min(1.15, pitch + e.movementY * 0.002));
  }
  mouseNdc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});
function aimAngle(m) {
  if (camMode === 'third') return yaw;
  ray.setFromCamera(mouseNdc, camera);
  const p = new THREE.Vector3();
  if (!ray.ray.intersectPlane(floorPlane, p)) return yaw;
  return Math.atan2(p.z / S - m.e.y, p.x / S - m.e.x);
}
canvas.addEventListener('mousedown', e => {
  const m = inGame(); if (!m) return;
  if (camMode === 'third' && !locked()) { canvas.requestPointerLock(); return; }
  if (state.phase !== 'class') return;
  const aim = aimAngle(m);
  if (m.role === 'teacher') {
    if (e.button === 2) { if (teacherTarget) send({ t: 'say', id: 'call', target: teacherTarget }); }
    else if (e.button === 0) send({ t: 'act', a: 'catch' });
  } else if (e.button === 0) { send({ t: 'act', a: 'throw', aim }); SFX.whoosh(); }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

setInterval(() => {
  const m = inGame(); if (!m) return;
  const f = (keys.up ? 1 : 0) - (keys.down ? 1 : 0), r = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  let mx, my;
  if (camMode === 'third') { mx = f * Math.cos(yaw) + r * Math.cos(yaw + Math.PI / 2); my = f * Math.sin(yaw) + r * Math.sin(yaw + Math.PI / 2); }
  else { mx = r; my = -f; }
  const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
  send({ t: 'input', mx, my, phone: keys.phone, aim: aimAngle(m) });
}, 50);

// ---- Teacher: pick any kid in range --------------------------------------------------
let manualSel = null, rangeKey = '';
function kidsInRange(t) {
  return state.game.students.filter(s => !s.office && Math.hypot(s.x - t.x, s.y - t.y) <= TALK_RANGE)
    .sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y));
}
function cycleSelection() {
  const m = me(); if (!m || m.role !== 'teacher') return;
  const list = kidsInRange(m.e); if (!list.length) return toast('No kids in range — walk closer.');
  const i = list.findIndex(s => s.id === teacherTarget);
  manualSel = list[(i + 1) % list.length].id;
  SFX.pop();
}
function updateSelection(m) {
  teacherTarget = null;
  if (!m || m.role !== 'teacher') { $('range').classList.add('hidden'); rangeKey = ''; return; }
  const list = kidsInRange(m.e);
  const aim = aimAngle(m);
  // looking straight at a kid selects them; otherwise keep the Tab/click choice; otherwise the nearest
  let look = null, best = 0.16;
  for (const s of list) {
    let d = Math.atan2(s.y - m.e.y, s.x - m.e.x) - aim; d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
    if (d < best) { best = d; look = s; }
  }
  if (look && look.id !== manualSel && camMode === 'third') manualSel = look.id;
  const manual = list.find(s => s.id === manualSel);
  teacherTarget = (manual || list[0] || {}).id || null;
  const key = list.map(s => s.id + s.act + s.hand + s.det + s.mis).join() + teacherTarget;
  if (key === rangeKey) return;
  rangeKey = key;
  const el = $('range');
  el.classList.toggle('hidden', state.phase !== 'class');
  el.innerHTML = `<h4>👀 Kids in range <small>Tab / look / click</small></h4>` + (list.length ? list.slice(0, 8).map(s => {
    const ic = s.det ? '⛓' : s.act === 'phone' ? '📱' : s.act === 'dance' ? '🕺' : s.hand ? '✋' : s.mis ? '❗' : '';
    return `<button data-id="${s.id}" class="${s.id === teacherTarget ? 'sel' : ''}">${esc(s.name)}${s.pid ? ' 🎮' : ''} <span>${ic}</span></button>`;
  }).join('') : '<p>Nobody nearby — walk closer.</p>');
  el.querySelectorAll('button').forEach(b => b.onclick = () => { manualSel = b.dataset.id; rangeKey = ''; SFX.pop(); });
}

// ---- Events → sound & juice ------------------------------------------------------------
let lastPhase = null, lastBalls = 0;
const lastSay = new Map();
function handleEvents(g) {
  for (const f of floaters) {
    if (f._seen) continue;
    f._seen = true;
    const x = f.x * S, z = f.y * S;
    const t = f.text;
    if (/DETENTION|OFFICE/.test(t)) { SFX.whistle(); burst(x, 2.5, z, 18, ['#ff6b6b', '#c92a2a']); }
    else if (/BONK/.test(t)) { SFX.bonk(); shake = 0.45; burst(x, 3, z, 14, ['#ffd43b', '#ffffff']); }
    else if (/Splat/.test(t)) SFX.splat();
    else if (/Correct/.test(t)) { SFX.ding(); burst(x, 3, z, 40, ['#51cf66', '#ffd43b', '#74c0fc', '#ff8787']); }
    else if (/Wrong|Too slow|Wrong kid|Unfair/.test(t)) SFX.buzz();
    else if (/POP QUIZ|New topic/.test(t)) SFX.ding();
    else if (/got it right/.test(t)) SFX.tada();
    const el = document.createElement('div'); el.className = 'floater'; el.textContent = t; el.style.color = f.color;
    labelLayer.appendChild(el); floatEls.push({ el, x, z, t: 0 });
  }
  floaters.length = 0;
  if (state.phase !== lastPhase) {
    if (state.phase === 'class' || (lastPhase === 'class' && state.phase === 'recess')) SFX.bell();
    if (state.phase === 'recess' || state.phase === 'over') burst(ROOM_W / 2, 5, ROOM_D / 2, 120, ['#ff6b6b', '#ffd43b', '#51cf66', '#74c0fc', '#cc5de8']);
    lastPhase = state.phase;
  }
  if (g && g.balls.length > lastBalls) SFX.whoosh();
  lastBalls = g ? g.balls.length : 0;
}

// ---- Main loop -------------------------------------------------------------------------------
let lastT = performance.now(), orbit = 0;
const camTarget = new THREE.Vector3(), lookTarget = new THREE.Vector3(), lookNow = new THREE.Vector3(ROOM_W / 2, 0, ROOM_D / 2);
function frame3d(nowMs) {
  const dt = Math.min(0.1, (nowMs - lastT) / 1000); lastT = nowMs;
  const now = nowMs / 1000;
  const g = state && state.game && state.phase !== 'lobby' ? state.game : null;
  const m = g ? me() : null;

  // characters
  const seen = new Set();
  if (g) {
    drawBoard(g);
    for (const e of [g.teacher, ...g.students]) {
      seen.add(e.id);
      let r = people.get(e.id);
      if (!r || r.name !== e.name) { if (r) scene.remove(r.g); r = makePerson(e, e.id === 'T'); r.name = e.name; people.set(e.id, r); }
      animatePerson(r, e, dt, now);
      r.ring.visible = e.id === teacherTarget || e.pid === myId || !!(g.ask && g.ask.called === e.id); // must be a real boolean for three.js
      if (r.ring.visible) {
        r.ring.material.color.set(e.pid === myId ? '#ffd43b' : g.ask && g.ask.called === e.id ? '#ffffff' : '#ff922b');
        r.ring.scale.setScalar(1 + Math.sin(now * 5) * 0.06);
      }
      const prev = lastSay.get(e.id);
      if (e.say && e.say !== prev) speechBlips(e, e.say);
      lastSay.set(e.id, e.say || '');
    }
    // cone
    const t = g.teacher, tr = people.get('T');
    cone.position.set(tr.px * S, 0.05, tr.py * S);
    cone.rotation.y = -t.a;
    const alert = g.students.some(s => s.mis && !s.office && (() => {
      const dx = s.x - t.x, dy = s.y - t.y, d = Math.hypot(dx, dy);
      if (d > VIEW_RANGE) return false; if (d < 40) return true;
      let a = Math.atan2(dy, dx) - t.a; a = Math.atan2(Math.sin(a), Math.cos(a)); return Math.abs(a) <= VIEW_HALF;
    })());
    coneMat.color.set(t.teaching ? '#ffffff' : alert ? '#ff6b6b' : '#ffe066');
    coneMat.opacity = t.teaching ? 0.07 : 0.22;
    cone.visible = true;
    // balls & notes
    g.balls.forEach((b, i) => {
      const mesh = pooled(ballPool, i, () => { const x = new THREE.Mesh(ballGeo, paperMat); x.castShadow = true; return x; });
      const u = 1 - b.life / 1.3;
      mesh.visible = true; mesh.position.set(b.x * S, 1.7 + Math.sin(u * Math.PI) * 1.4, b.y * S); mesh.rotation.x += dt * 12; mesh.rotation.z += dt * 9;
    });
    for (let i = g.balls.length; i < ballPool.length; i++) ballPool[i].visible = false;
    g.notes.forEach((n, i) => {
      const mesh = pooled(notePool, i, () => box(0.35, 0.05, 0.25, paperMat, 0, 0, 0));
      mesh.visible = true;
      mesh.position.set((n.x1 + (n.x2 - n.x1) * n.t) * S, 1.6 + Math.sin(n.t * Math.PI) * 0.8, (n.y1 + (n.y2 - n.y1) * n.t) * S);
      mesh.rotation.y += dt * 6;
    });
    for (let i = g.notes.length; i < notePool.length; i++) notePool[i].visible = false;
    handleEvents(g);
    updateSelection(m);
    // the clock's minute hand races through the period
    minHand.parent.rotation.z = -(1 - g.timer / 150) * Math.PI * 2; secHand.parent.rotation.z = -now * Math.PI / 30;
  } else {
    cone.visible = false;
    for (const p of [...ballPool, ...notePool]) p.visible = false;
    secHand.parent.rotation.z = -now * Math.PI / 30;
    $('range').classList.add('hidden');
    floaters.length = 0;
  }
  for (const [id, r] of people) if (!seen.has(id)) { scene.remove(r.g); people.delete(id); const l = labels.get(id); if (l) { l.remove(); labels.delete(id); } }

  // camera: start each period with the teacher facing the class and kids facing the board
  const periodKey = g && m ? g.period + m.e.id + state.phase : null;
  if (periodKey && periodKey !== frame3d.periodKey) { yaw = m.role === 'teacher' ? Math.PI / 2 : -Math.PI / 2; frame3d.periodKey = periodKey; }
  if (m && m.e.teaching && m.role === 'teacher') yaw += Math.atan2(Math.sin(-Math.PI / 2 - yaw), Math.cos(-Math.PI / 2 - yaw)) * Math.min(1, dt * 8);
  if (m && !m.e.office && camMode === 'third') {
    const r = people.get(m.e.id);
    const px = r.px * S, pz = r.py * S, dist = 5.4;
    camTarget.set(px - Math.cos(yaw) * dist * Math.cos(pitch), 1.9 + Math.sin(pitch) * dist, pz - Math.sin(yaw) * dist * Math.cos(pitch));
    camTarget.x = Math.max(IN + 0.4, Math.min(ROOM_W - IN - 0.4, camTarget.x));
    camTarget.z = Math.max(IN + 0.4, Math.min(ROOM_D - IN - 0.4, camTarget.z));
    lookTarget.set(px + Math.cos(yaw) * 3, 1.7, pz + Math.sin(yaw) * 3);
    camera.position.lerp(camTarget, Math.min(1, dt * 12));
    lookNow.lerp(lookTarget, Math.min(1, dt * 14));
  } else if (g) {
    camTarget.set(ROOM_W / 2, 30, ROOM_D + 14);
    lookTarget.set(ROOM_W / 2, 0, ROOM_D / 2 + 1.5);
    camera.position.lerp(camTarget, Math.min(1, dt * 4));
    lookNow.lerp(lookTarget, Math.min(1, dt * 4));
  } else {
    // menus: slow orbit around the empty classroom
    orbit += dt * 0.12;
    camera.position.set(ROOM_W / 2 + Math.cos(orbit) * 20, 12, ROOM_D / 2 + Math.sin(orbit) * 13);
    lookNow.set(ROOM_W / 2, 1.5, ROOM_D / 2);
  }
  camera.lookAt(lookNow);
  if (shake > 0) { shake -= dt; camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; }
  $('crosshair').classList.toggle('hidden', !(m && camMode === 'third' && locked()));

  // confetti
  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i];
    c.vy -= 9 * dt; c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z += c.vz * dt;
    c.m.rotation.x += dt * 8; c.m.rotation.y += dt * 6; c.life -= dt;
    if (c.m.position.y < 0.05) { c.m.position.y = 0.05; c.vx *= 0.5; c.vz *= 0.5; c.vy = 0; }
    if (c.life <= 0) { scene.remove(c.m); c.m.material.dispose(); confetti.splice(i, 1); }
  }

  renderer.render(scene, camera);

  // overlays (after render so the camera matrices are current)
  if (g) {
    for (const e of [g.teacher, ...g.students]) {
      const r = people.get(e.id), l = labelFor(e.id);
      const p = !e.office && project(r.px * S, e.id === 'T' ? 4.2 : 3.4, r.py * S);
      if (!p || (m && e.id === m.e.id && camMode === 'third' && !e.say)) { l.style.display = 'none'; continue; }
      l.style.display = '';
      l.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      const far = Math.max(0.55, Math.min(1, 14 / p.d));
      l.style.opacity = p.d > 34 && !e.say ? 0.55 : 1;
      l.style.fontSize = (13 * far) + 'px';
      l._tx.textContent = e.pid === myId ? `${e.name} (you)` : e.name;
      l.classList.toggle('player', !!e.pid);
      l.classList.toggle('sel', e.id === teacherTarget);
      l._ic.textContent = e.id === 'T' ? (e.teaching ? '📖 ' : '') : e.det ? `⛓${e.det} ` : e.hand ? '✋ ' : e.req ? '🙋 ' : e.pass ? '🎫 ' : e.act === 'phone' ? '📱 ' : e.act === 'dance' ? '🕺 ' : e.mis ? '❗ ' : '';
      if (l._b.textContent !== (e.say || '')) l._b.textContent = e.say || '';
      l._b.style.display = e.say ? '' : 'none';
    }
  } else for (const l of labels.values()) l.style.display = 'none';
  for (let i = floatEls.length - 1; i >= 0; i--) {
    const f = floatEls[i]; f.t += dt;
    const p = project(f.x, 3.6 + f.t * 1.2, f.z);
    if (f.t > 2.2 || !p) { if (f.t > 2.2) { f.el.remove(); floatEls.splice(i, 1); } else f.el.style.display = 'none'; continue; }
    f.el.style.display = '';
    f.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    f.el.style.opacity = Math.max(0, 1 - f.t / 2.2);
  }
  requestAnimationFrame(frame3d);
}
requestAnimationFrame(frame3d);
