'use strict';
// Detention! — browser client. Renders server snapshots and sends input.

const W = 960, H = 640, WALL = 24;
const COLS = [200, 370, 590, 760], ROWS = [260, 380, 500];
const DESKS = [];
for (const y of ROWS) for (const x of COLS) DESKS.push({ x, y });
const TDESK = { x: 780, y: 130, w: 140, h: 50 };
const DETENTION = { x: 30, y: 520, w: 120, h: 90 };
const VIEW_RANGE = 300, VIEW_HALF = Math.PI * 0.3;

const $ = id => document.getElementById(id);
const canvas = $('c'), ctx = canvas.getContext('2d');

let ws = null, myId = null, state = null, lanUrls = [];
const smooth = new Map(); // entity id -> displayed {x,y}
const floaters = [];
const keys = {};
let mouse = { x: 0, y: 0 };
let view = { s: 1, ox: 0, oy: 0 };

// ---- Connection ---------------------------------------------------------
function connect(name) {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name }));
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.t === 'welcome') { myId = m.id; lanUrls = m.urls || []; }
    else if (m.t === 'full') { $('joinMsg').textContent = 'The class is full (3 players max).'; myId = null; }
    else if (m.t === 'toast') toast(m.text);
    else if (m.t === 'state') onState(m);
  };
  ws.onclose = () => {
    if (myId) { toast('Disconnected from server'); showScreen('join'); $('joinMsg').textContent = 'Lost connection. Rejoin?'; }
    myId = null;
  };
}
const send = m => ws && ws.readyState === 1 && ws.send(JSON.stringify(m));

$('joinBtn').onclick = () => {
  const name = $('name').value.trim() || 'Player';
  try { localStorage.setItem('detention-name', name); } catch {}
  $('joinMsg').textContent = '';
  connect(name);
};
$('name').addEventListener('keydown', e => { if (e.key === 'Enter') $('joinBtn').click(); });
try { $('name').value = localStorage.getItem('detention-name') || ''; } catch {}

document.querySelectorAll('#roleBtns button').forEach(b => b.onclick = () => send({ t: 'role', role: b.dataset.role }));
$('startBtn').onclick = () => send({ t: 'start' });

function toast(text) {
  const t = $('toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2200);
}

function showScreen(which) {
  $('join').classList.toggle('hidden', which !== 'join');
  $('lobby').classList.toggle('hidden', which !== 'lobby');
  const inGame = which === 'game';
  $('hud').classList.toggle('hidden', !inGame);
  $('help').classList.toggle('hidden', !inGame);
  if (!inGame) { $('quiz').classList.add('hidden'); $('banner').classList.add('hidden'); }
}

// ---- State handling -----------------------------------------------------
function me() {
  if (!state || !state.game) return null;
  const g = state.game;
  if (g.teacher.pid === myId) return { role: 'teacher', e: g.teacher };
  const s = g.students.find(o => o.pid === myId);
  return s ? { role: 'student', e: s } : null;
}

function onState(m) {
  state = m;
  for (const ev of m.events) floaters.push({ ...ev, t: 0 });
  if (!myId) return;
  if (m.phase === 'lobby') { showScreen('lobby'); renderLobby(); return; }
  showScreen('game');
  renderHud();
  renderQuiz();
  renderBanner();
}

function renderLobby() {
  const host = state.players.find(p => p.id === state.hostId);
  const mine = state.players.find(p => p.id === myId);
  const isHost = state.hostId === myId;
  $('lanInfo').innerHTML = lanUrls.length
    ? `Friends on the same Wi-Fi join at: <b>${lanUrls.join('</b> or <b>')}</b>`
    : `Friends join at: <b>${location.host}</b>`;
  $('playerList').innerHTML = state.players.map(p =>
    `<li><span>${p.id === state.hostId ? '👑 ' : ''}${esc(p.name)}${p.id === myId ? ' (you)' : ''}</span><span>${p.role ? (p.role === 'teacher' ? '🍎 Teacher' : '🎒 Student') : '…choosing'}</span></li>`
  ).join('') + `<li style="opacity:.6"><span>${state.max - state.players.length} open seat(s)</span><span>NPCs fill the rest</span></li>`;

  const teacherTaken = state.players.some(p => p.role === 'teacher' && p.id !== myId);
  const canChoose = isHost || (host && host.role);
  $('roleBtns').classList.toggle('hidden', !canChoose);
  document.querySelectorAll('#roleBtns button').forEach(b => {
    b.classList.toggle('picked', mine && mine.role === b.dataset.role);
    b.disabled = b.dataset.role === 'teacher' && teacherTaken;
  });
  $('roleHint').textContent = isHost
    ? (mine.role ? 'Start whenever your class is ready.' : "You're first in! Choose: teacher or student?")
    : (!host || !host.role ? `Waiting for ${host ? host.name : 'the host'} to choose a role…` : teacherTaken ? 'The teacher spot is taken — you\'re a student.' : 'Pick your role.');
  $('startBtn').classList.toggle('hidden', !isHost);
  $('startBtn').disabled = !(mine && mine.role);
}

function renderHud() {
  const g = state.game, m = me();
  const mm = String(Math.floor(g.timer / 60)), ss = String(g.timer % 60).padStart(2, '0');
  const tally = `Teacher ${g.results.filter(r => r === 'teacher').length} – ${g.results.filter(r => r === 'students').length} Students`;
  $('hudLeft').textContent = state.phase === 'class' ? `Period ${g.period}/${g.periods} · ${mm}:${ss} · ${tally}` : `Recess · ${tally}`;
  $('orderFill').style.width = g.order + '%';
  $('orderFill').style.background = g.order > 55 ? '#51cf66' : g.order > 30 ? '#fcc419' : '#ff6b6b';
  if (!m) { $('hudRight').textContent = 'Spectating'; return; }
  if (m.role === 'teacher') {
    $('hudRight').textContent = `🍎 ${m.e.name} · Score ${m.e.score} · Catches ${m.e.catches}${g.quizCd > 0 ? ` · Quiz in ${g.quizCd}s` : ' · Quiz ready (Q)'}`;
    $('help').textContent = 'WASD move · Mouse look · SPACE / click: catch a misbehaving student in your yellow cone · E at the blackboard: teach (you face the board!) · Q: pop quiz';
  } else {
    const s = m.e;
    $('hudRight').textContent = s.det ? `⛓ DETENTION ${s.det}s` : `🎒 ${s.name} · Grade ${s.grade} · Mischief ${s.mischief} · Score ${s.score}`;
    $('help').textContent = 'WASD move · Hold F: phone · N: pass a note · Click: throw paper ball · E: sit · 1–4: quiz answers — stay out of the teacher\'s yellow cone when you misbehave!';
  }
}

let quizKey = '';
function renderQuiz() {
  const q = state.game.quiz, m = me();
  const el = $('quiz');
  if (!q || state.phase !== 'class') { el.classList.add('hidden'); quizKey = ''; return; }
  el.classList.remove('hidden');
  const mine = m && m.role === 'student' ? q.answers[m.e.id] : undefined;
  const answered = Object.keys(q.answers).length;
  const key = [q.q, q.answer, mine, q.t, answered].join('|');
  if (key === quizKey) return;
  quizKey = key;
  const student = m && m.role === 'student' && !m.e.det;
  el.innerHTML = `<h3>📝 Pop quiz: ${esc(q.q)}</h3><div class="opts">${q.options.map((o, i) => {
    let cls = '';
    if (q.answer >= 0) cls = i === q.answer ? 'right' : i === mine ? 'wrong' : '';
    else if (i === mine) cls = 'mine';
    return `<button data-i="${i}" class="${cls}" ${!student || mine !== undefined || q.answer >= 0 ? 'disabled' : ''}>${i + 1}. ${esc(o)}</button>`;
  }).join('')}</div><div class="meta">${q.answer >= 0 ? 'Answer revealed!' : `${q.t}s left · ${answered}/${state.game.students.length} answered`}${m && m.role === 'teacher' ? ' · you get +2 per correct answer' : ''}</div>`;
  el.querySelectorAll('button').forEach(b => b.onclick = () => send({ t: 'act', a: 'answer', i: +b.dataset.i }));
}

let bannerKey = '';
function renderBanner() {
  const g = state.game, el = $('banner');
  if (state.phase === 'class') { el.classList.add('hidden'); bannerKey = ''; return; }
  const key = state.phase + g.period + (state.phase === 'recess' ? g.timer : '') + state.hostId;
  if (key === bannerKey) return;
  bannerKey = key;
  el.classList.remove('hidden');
  const people = [g.teacher, ...g.students].filter(e => e.pid || state.phase === 'over')
    .sort((a, b) => (b.pid ? 1 : 0) - (a.pid ? 1 : 0) || b.score - a.score);
  const rows = people.map(e => `<tr><td>${e.id === 'T' ? '🍎' : '🎒'} ${esc(e.name)}${e.pid === myId ? ' (you)' : e.pid ? ' 🎮' : ''}</td><td>${e.score}</td><td>${e.id === 'T' ? `${e.catches} catches` : `grade ${e.grade} · mischief ${e.mischief} · caught ${e.caught}×`}</td></tr>`).join('');
  if (state.phase === 'recess') {
    const b = g.banner || {};
    el.innerHTML = `<div class="card"><h1>${b.winner === 'teacher' ? '🍎 Teacher wins!' : '🎒 Students win!'}</h1><p class="sub">Period ${g.period}: ${esc(b.why || '')}</p><table>${rows}</table><p>${g.period < g.periods ? `Recess… next period in ${g.timer}s` : `Final results in ${g.timer}s`}</p></div>`;
  } else {
    const tw = g.results.filter(r => r === 'teacher').length, sw = g.results.length - tw;
    el.innerHTML = `<div class="card wide"><h1>${tw > sw ? '🍎 The teacher rules the school!' : '🎒 The students run the school!'}</h1><p class="sub">Periods won — Teacher ${tw} : ${sw} Students</p><table><tr><th>Name</th><th>Score</th><th></th></tr>${rows}</table>${state.hostId === myId ? '<button class="primary" id="againBtn">Back to lobby</button>' : '<p>Waiting for the host…</p>'}</div>`;
    const again = $('againBtn'); if (again) again.onclick = () => send({ t: 'restart' });
  }
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- Input --------------------------------------------------------------
const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyF: 'phone' };
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || !state || state.phase !== 'class') return;
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.repeat) return;
  const m = me(); if (!m) return;
  if (m.role === 'teacher') {
    if (e.code === 'Space') { send({ t: 'act', a: 'catch' }); e.preventDefault(); }
    if (e.code === 'KeyE') send({ t: 'act', a: 'teach' });
    if (e.code === 'KeyQ') send({ t: 'act', a: 'quiz' });
  } else {
    if (e.code === 'KeyN') send({ t: 'act', a: 'note' });
    if (e.code === 'KeyE') send({ t: 'act', a: 'sit' });
    if (/^Digit[1-4]$/.test(e.code)) send({ t: 'act', a: 'answer', i: +e.code.slice(5) - 1 });
  }
});
addEventListener('keyup', e => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
canvas.addEventListener('mousemove', e => { mouse = toWorld(e.clientX, e.clientY); });
canvas.addEventListener('mousedown', e => {
  if (!state || state.phase !== 'class') return;
  mouse = toWorld(e.clientX, e.clientY);
  const m = me(); if (!m) return;
  if (m.role === 'teacher') send({ t: 'act', a: 'catch' });
  else send({ t: 'act', a: 'throw', aim: aimFrom(m.e) });
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

function toWorld(cx, cy) { return { x: (cx - view.ox) / view.s, y: (cy - view.oy) / view.s }; }
function aimFrom(e) { const p = smooth.get(e.id) || e; return Math.atan2(mouse.y - p.y, mouse.x - p.x); }

setInterval(() => {
  if (!state || !state.game || (state.phase !== 'class' && state.phase !== 'recess')) return;
  const m = me(); if (!m) return;
  send({ t: 'input', up: keys.up, down: keys.down, left: keys.left, right: keys.right, phone: keys.phone, aim: aimFrom(m.e) });
}, 50);

// ---- Rendering ----------------------------------------------------------
function resize() {
  const dpr = devicePixelRatio || 1;
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  const top = 40, bottom = 30;
  const s = Math.min(innerWidth / W, (innerHeight - top - bottom) / H);
  view = { s, ox: (innerWidth - W * s) / 2, oy: top + (innerHeight - top - bottom - H * s) / 2, dpr };
}
addEventListener('resize', resize); resize();

function drawRoom() {
  // floor
  ctx.fillStyle = '#c89f6a'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(90,60,30,.18)'; ctx.lineWidth = 1;
  for (let y = 0; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // walls
  ctx.fillStyle = '#5b4636';
  ctx.fillRect(0, 0, W, WALL); ctx.fillRect(0, H - WALL, W, WALL); ctx.fillRect(0, 0, WALL, H); ctx.fillRect(W - WALL, 0, WALL, H);
  // windows
  ctx.fillStyle = '#a5d8ff';
  for (const y of [120, 260, 400]) ctx.fillRect(4, y, 14, 80);
  // door
  ctx.fillStyle = '#8b5a2b'; ctx.fillRect(W - WALL, 530, WALL, 80);
  ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.arc(W - 16, 572, 3, 0, 7); ctx.fill();
  // blackboard
  const t = state.game.teacher;
  ctx.fillStyle = '#7a5230'; ctx.fillRect(292, 2, 376, 40);
  ctx.fillStyle = t.teaching ? '#2f6b45' : '#264d36'; ctx.fillRect(298, 6, 364, 30);
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '15px "Comic Sans MS", cursive'; ctx.textAlign = 'center';
  ctx.fillText(t.teaching ? '✏️  ½ + ¼ = ¾ … pay attention!' : 'Today: Fractions  ·  No phones!', 480, 26);
  // clock
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(900, 12, 10, 0, 7); ctx.fill();
  ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.moveTo(900, 12); ctx.lineTo(900 + Math.cos(Date.now() / 600) * 7, 12 + Math.sin(Date.now() / 600) * 7); ctx.stroke();
  // detention corner
  ctx.save();
  ctx.beginPath(); ctx.rect(DETENTION.x, DETENTION.y, DETENTION.w, DETENTION.h); ctx.clip();
  ctx.fillStyle = 'rgba(200,40,40,.25)'; ctx.fillRect(DETENTION.x, DETENTION.y, DETENTION.w, DETENTION.h);
  ctx.strokeStyle = 'rgba(200,40,40,.35)'; ctx.lineWidth = 6;
  for (let i = -100; i < 200; i += 18) { ctx.beginPath(); ctx.moveTo(DETENTION.x + i, DETENTION.y); ctx.lineTo(DETENTION.x + i + 90, DETENTION.y + 90); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = '#c92a2a'; ctx.font = 'bold 13px system-ui'; ctx.fillText('DETENTION', DETENTION.x + DETENTION.w / 2, DETENTION.y + 14);
  // teacher desk
  ctx.fillStyle = '#6d4425'; ctx.fillRect(TDESK.x - TDESK.w / 2, TDESK.y - TDESK.h / 2, TDESK.w, TDESK.h);
  ctx.fillStyle = '#f8f9fa'; ctx.fillRect(TDESK.x - 40, TDESK.y - 12, 30, 20);
  ctx.font = '20px serif'; ctx.fillText('🍎', TDESK.x + 35, TDESK.y + 7);
  // student desks + chairs
  for (const d of DESKS) {
    ctx.fillStyle = '#a0522d'; ctx.fillRect(d.x - 35, d.y - 20, 70, 40);
    ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(d.x - 30, d.y - 15, 60, 6);
    ctx.fillStyle = '#495057'; ctx.fillRect(d.x - 14, d.y + 24, 28, 22);
  }
}

function drawCone(t, p) {
  const alert = state.game.students.some(s => s.mis && inCone(p, t.a, s));
  ctx.fillStyle = t.teaching ? 'rgba(255,255,255,.06)' : alert ? 'rgba(255,90,90,.22)' : 'rgba(255,236,120,.22)';
  ctx.beginPath(); ctx.moveTo(p.x, p.y);
  ctx.arc(p.x, p.y, VIEW_RANGE, t.a - VIEW_HALF, t.a + VIEW_HALF); ctx.closePath(); ctx.fill();
}
function inCone(p, a, e) {
  const q = smooth.get(e.id) || e;
  const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
  if (d > VIEW_RANGE) return false; if (d < 40) return true;
  let diff = Math.atan2(dy, dx) - a; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
  return Math.abs(diff) <= VIEW_HALF;
}

function drawPerson(e, p, teacher) {
  const r = teacher ? 16 : 13;
  if (e.pid === myId) { ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, r + 6, 0, 7); ctx.stroke(); }
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 4, r, r * 0.8, 0, 0, 7); ctx.fill();
  ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
  // head, offset toward facing
  const hx = p.x + Math.cos(e.a) * 4, hy = p.y + Math.sin(e.a) * 4;
  ctx.fillStyle = '#f5d0a9'; ctx.beginPath(); ctx.arc(hx, hy, r * 0.62, 0, 7); ctx.fill();
  ctx.fillStyle = '#222'; // eyes
  for (const s of [-1, 1]) {
    const ea = e.a + s * 0.45;
    ctx.beginPath(); ctx.arc(hx + Math.cos(ea) * r * 0.42, hy + Math.sin(ea) * r * 0.42, 1.8, 0, 7); ctx.fill();
  }
  if (teacher) { ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(hx, hy, r * 0.62, e.a - 0.9, e.a + 0.9); ctx.stroke(); }
  // name
  ctx.font = `${e.pid ? 'bold ' : ''}11px system-ui`; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,.55)'; const label = e.pid === myId ? `${e.name} (you)` : e.name;
  const w = ctx.measureText(label).width + 8; ctx.fillRect(p.x - w / 2, p.y - r - 19, w, 14);
  ctx.fillStyle = e.pid ? '#ffe066' : '#fff'; ctx.fillText(label, p.x, p.y - r - 8);
  // status icon
  let icon = '';
  if (teacher) icon = e.teaching ? '📖' : '';
  else if (e.det) icon = `⛓${e.det}`;
  else if (e.act === 'phone') icon = '📱';
  else if (e.act === 'note') icon = '✉️';
  else if (e.mis) icon = '❗';
  if (icon) { ctx.font = '14px system-ui'; ctx.fillText(icon, p.x + r + 8, p.y - r + 2); }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1d1a24'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (state && state.game && state.phase !== 'lobby') {
    const d = view.dpr;
    ctx.setTransform(view.s * d, 0, 0, view.s * d, view.ox * d, view.oy * d);
    const g = state.game;
    const k = 1 - Math.exp(-dt * 18);
    const ents = [g.teacher, ...g.students];
    for (const e of ents) {
      let p = smooth.get(e.id);
      if (!p || Math.hypot(p.x - e.x, p.y - e.y) > 80) { p = { x: e.x, y: e.y }; smooth.set(e.id, p); }
      p.x += (e.x - p.x) * k; p.y += (e.y - p.y) * k;
    }
    drawRoom();
    drawCone(g.teacher, smooth.get('T'));
    for (const n of g.notes) {
      const x = n.x1 + (n.x2 - n.x1) * n.t, y = n.y1 + (n.y2 - n.y1) * n.t;
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 5, y - 4, 10, 8); ctx.strokeStyle = '#999'; ctx.strokeRect(x - 5, y - 4, 10, 8);
    }
    for (const s of g.students) drawPerson(s, smooth.get(s.id), false);
    drawPerson(g.teacher, smooth.get('T'), true);
    for (const b of g.balls) { ctx.fillStyle = '#f8f9fa'; ctx.strokeStyle = '#adb5bd'; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, 7); ctx.fill(); ctx.stroke(); }
    // aim line for students
    const m = me();
    if (m && m.role === 'student' && !m.e.det && state.phase === 'class') {
      const p = smooth.get(m.e.id), a = aimFrom(m.e);
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * 60, p.y + Math.sin(a) * 60); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const f of floaters) {
      f.t += dt;
      ctx.globalAlpha = Math.max(0, 1 - f.t / 2.2);
      ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(f.text, f.x, f.y - f.t * 25);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - f.t * 25);
      ctx.globalAlpha = 1;
    }
  }
  for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].t > 2.2) floaters.splice(i, 1);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
