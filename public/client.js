'use strict';
// SchoolSim — browser client. Renders server snapshots and sends input.

const W = 960, H = 640, WALL = 24;
const COLS = [200, 370, 590, 760], ROWS = [260, 380, 500];
const DESKS = [];
for (const y of ROWS) for (const x of COLS) DESKS.push({ x, y });
const TDESK = { x: 780, y: 130, w: 140, h: 50 };
const DETENTION = { x: 30, y: 520, w: 120, h: 90 };
const VIEW_RANGE = 300, VIEW_HALF = Math.PI * 0.3;

const $ = id => document.getElementById(id);
const canvas = $('c');

let net = null, myId = null, state = null, lanUrls = [], lines = null, room = null;
let talkOpen = false, talkCat = null, teacherTarget = null;
const smooth = new Map(); // entity id -> displayed {x,y}
const floaters = [];
const keys = {};

// ---- Connection ---------------------------------------------------------
// Two ways to play: the Node LAN server (WebSocket), or peer-to-peer rooms (works on GitHub Pages),
// where the host's browser runs the game (game.js) and friends connect with a room code.
const PEER_PREFIX = 'schoolsim-room-';
const PEER_OPTS = window.SCHOOLSIM_PEER || {}; // optional: point at your own PeerJS server

let lastMsgAt = 0;
function onMessage(raw) {
  const m = JSON.parse(raw);
  lastMsgAt = Date.now();
  if (m.t === 'welcome') { myId = m.id; lanUrls = m.urls || []; room = m.room || room; lines = m.lines; $('joinMsg').textContent = ''; }
  else if (m.t === 'full') { $('joinMsg').textContent = 'The class is full (3 players max).'; myId = null; }
  else if (m.t === 'toast') toast(m.text);
  else if (m.t === 'state') onState(m);
}
function onDisconnect(why) {
  if (myId) { toast(why || 'Disconnected'); showScreen('join'); $('joinMsg').textContent = (why || 'Lost connection') + '. Rejoin?'; }
  myId = null; net = null;
}
const send = m => net && net.send(JSON.stringify(m));
// WebRTC can take a long time to notice a host closing their tab, so treat silence as a disconnect
setInterval(() => { if (net && myId && Date.now() - lastMsgAt > 5000) onDisconnect('Lost connection to the host'); }, 1000);

function connectLan(name) {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name }));
  ws.onmessage = ev => onMessage(ev.data);
  ws.onclose = () => onDisconnect('Disconnected from server');
  net = { send: d => ws.readyState === 1 && ws.send(d) };
}

function hostRoom(name) {
  const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
  $('joinMsg').textContent = 'Opening your classroom…';
  const peer = new Peer(PEER_PREFIX + code, PEER_OPTS);
  peer.on('error', err => {
    if (err.type === 'unavailable-id') { peer.destroy(); return hostRoom(name); }
    $('joinMsg').textContent = 'Could not host: ' + err.type;
  });
  peer.on('open', () => {
    const sim = createSchoolSim({ room: code });
    const me = sim.join({ send: onMessage, close() {} }, name);
    net = { send: d => sim.handle(me, JSON.parse(d)) };
    setInterval(sim.tick, 1000 / sim.TICK_HZ);
    peer.on('connection', c => {
      let p = null;
      const conn = { send: d => { if (c.open) c.send(d); }, close: () => setTimeout(() => c.close(), 300) };
      c.on('data', d => {
        let m; try { m = JSON.parse(d); } catch { return; }
        if (!m || typeof m !== 'object') return;
        if (!p) { if (m.t === 'join') p = sim.join(conn, m.name); return; }
        sim.handle(p, m);
      });
      c.on('close', () => { if (p) { sim.leave(p); p = null; } });
    });
    peer.on('disconnected', () => peer.reconnect());
  });
}

function joinRoom(name, code) {
  code = code.trim().toUpperCase();
  if (code.length !== 4) { $('joinMsg').textContent = 'Enter the 4-letter class code.'; return; }
  $('joinMsg').textContent = 'Finding class ' + code + '…';
  const peer = new Peer(PEER_OPTS);
  peer.on('error', err => {
    $('joinMsg').textContent = err.type === 'peer-unavailable' ? `No class with code ${code}. Check the code with your host.` : 'Connection error: ' + err.type;
  });
  peer.on('open', () => {
    const c = peer.connect(PEER_PREFIX + code, { reliable: true });
    c.on('open', () => { c.send(JSON.stringify({ t: 'join', name })); room = code; });
    c.on('data', onMessage);
    c.on('close', () => { onDisconnect('The host left the class'); peer.destroy(); });
    net = { send: d => { if (c.open) c.send(d); } };
  });
}

function playerName() {
  const name = $('name').value.trim() || 'Player';
  try { localStorage.setItem('schoolsim-name', name); } catch {}
  $('joinMsg').textContent = '';
  return name;
}
$('joinBtn').onclick = () => connectLan(playerName());
$('hostBtn').onclick = () => { if (!net) hostRoom(playerName()); };
$('codeBtn').onclick = () => { if (!net) joinRoom(playerName(), $('code').value); };
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('codeBtn').click(); });
$('name').addEventListener('keydown', e => { if (e.key === 'Enter') ($('joinBtn').classList.contains('hidden') ? $('hostBtn') : $('joinBtn')).click(); });
try { $('name').value = localStorage.getItem('schoolsim-name') || ''; } catch {}
const urlCode = new URLSearchParams(location.search).get('code');
if (urlCode) $('code').value = urlCode.toUpperCase();

// Served by the Node LAN server? Otherwise (GitHub Pages, any static host) use peer-to-peer rooms.
(location.hostname.endsWith('github.io') ? Promise.resolve(null) : fetch('server-info').then(r => r.ok ? r.json() : null).catch(() => null)).then(info => {
  const lan = info && info.mode === 'lan';
  $('joinBtn').classList.toggle('hidden', !lan);
  $('p2p').classList.toggle('hidden', lan);
  if (!lan && typeof Peer === 'undefined') $('joinMsg').textContent = 'Could not load the multiplayer library — check your internet connection.';
});

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
  $('talkBtn').classList.toggle('hidden', !inGame);
  if (!inGame) { for (const id of ['quiz', 'banner', 'ask', 'requests', 'talk']) $(id).classList.add('hidden'); talkOpen = false; }
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
  renderAsk();
  renderRequests();
  renderTalk();
}

function renderLobby() {
  const host = state.players.find(p => p.id === state.hostId);
  const mine = state.players.find(p => p.id === myId);
  const isHost = state.hostId === myId;
  const link = `${location.origin}${location.pathname}?code=${room}`;
  $('lanInfo').innerHTML = room
    ? `Class code: <b style="font-size:22px;letter-spacing:3px">${room}</b><br>Friends open <b>${esc(link)}</b>${isHostTab() ? '<br><i>Keep this tab open — your browser is running the class.</i>' : ''}`
    : lanUrls.length
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

function isHostTab() { return state && state.hostId === myId; }

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
    $('help').textContent = 'Click to look around (Esc frees the mouse) · WASD move · Tab / look at a kid: select · T: talk · Right-click: call on selected · Space/click: catch · E at board: teach · Y/N: requests · V: camera';
  } else {
    const s = m.e;
    $('hudRight').textContent = s.det ? (s.office ? `🏫 PRINCIPAL'S OFFICE ${s.det}s` : `⛓ DETENTION ${s.det}s`) : `🎒 ${s.name} · Grade ${s.grade} · Mischief ${s.mischief} · Score ${s.score}`;
    $('help').textContent = 'Click to look around (Esc frees the mouse) · WASD move · T: talk · H: hand · 1–4: answer · Hold F: phone · N: note · G: dance · Click: throw · E: sit · V: camera — avoid the yellow cone!';
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
  if (e.code === 'KeyT') { talkOpen = !talkOpen; talkCat = null; renderTalk(true); return; }
  if (talkOpen && (e.code === 'Escape' || e.code === 'Backspace')) { if (talkCat) talkCat = null; else talkOpen = false; renderTalk(true); e.preventDefault(); return; }
  if (talkOpen && /^Digit[1-9]$/.test(e.code)) { talkPick(+e.code.slice(5) - 1); return; }
  if (m.role === 'teacher') {
    if (e.code === 'Space') { send({ t: 'act', a: 'catch' }); e.preventDefault(); }
    if (e.code === 'KeyE') send({ t: 'act', a: 'teach' });
    if (e.code === 'KeyQ') sayLine('quiz');
    if (e.code === 'Tab') { e.preventDefault(); cycleSelection(); }
    if (e.code === 'KeyY' || e.code === 'KeyN') { const r = state.game.students.find(s => s.req); if (r) send({ t: 'act', a: 'reply', sid: r.id, yes: e.code === 'KeyY' }); }
  } else {
    if (e.code === 'KeyN') send({ t: 'act', a: 'note' });
    if (e.code === 'KeyE') send({ t: 'act', a: 'sit' });
    if (e.code === 'KeyH') sayLine('hand');
    if (e.code === 'KeyG') sayLine('dance');
    if (/^Digit[1-4]$/.test(e.code)) send({ t: 'act', a: 'answer', i: +e.code.slice(5) - 1 });
  }
});

// ---- Dialogue menu ------------------------------------------------------
function myLines() { const m = me(); return m && lines ? lines[m.role] : []; }
function sayLine(id) { send({ t: 'say', id, target: teacherTarget }); }
function talkItems() {
  const ls = myLines();
  if (!talkCat) return [...new Set(ls.map(l => l.cat))].map(c => ({ cat: c }));
  return ls.filter(l => l.cat === talkCat);
}
function talkPick(i) {
  const it = talkItems()[i]; if (!it) return;
  if (!talkCat) { talkCat = it.cat; renderTalk(true); return; }
  sayLine(it.id); talkOpen = false; renderTalk(true);
}
const CAT_ICON = { Topic: '📚', Ask: '❓', Chat: '💬', Discipline: '📢', Praise: '⭐', Class: '✋', Requests: '🙋', Mischief: '😈', Nice: '😇' };
let talkKey = '';
function renderTalk(force) {
  const el = $('talk'), m = me();
  if (!talkOpen || !m || !state || state.phase === 'over') { el.classList.add('hidden'); talkKey = ''; return; }
  const tgt = teacherTarget && state.game.students.find(s => s.id === teacherTarget);
  const cds = m.e.cds || {};
  const key = [talkCat, tgt && tgt.id, JSON.stringify(cds), state.game.topic].join('|');
  if (!force && key === talkKey) return;
  talkKey = key;
  el.classList.remove('hidden');
  const items = talkItems();
  el.innerHTML = `<h4><span>${talkCat ? CAT_ICON[talkCat] + ' ' + talkCat : '💬 What do you want to say?'}</span><span>${talkCat ? 'Esc: back' : 'Esc: close'}</span></h4>` +
    items.map((it, i) => {
      if (!talkCat) return `<button data-i="${i}"><span class="k">${i + 1}</span>${CAT_ICON[it.cat] || ''} ${esc(it.cat)}</button>`;
      const text = (it.label || it.text).replace('{name}', tgt ? tgt.name : '‹selected kid›').replace('{teacher}', state.game.teacher.name).replace('{topic}', state.game.topicName || '‹topic›');
      const cd = cds[it.id];
      const current = it.id === 'topic_' + state.game.topic ? ' ✓' : '';
      return `<button data-i="${i}" ${cd ? 'disabled' : ''}><span class="k">${i + 1}</span>“${esc(text)}”${current}${cd ? ` (${cd}s)` : ''}${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</button>`;
    }).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => talkPick(+b.dataset.i));
}
$('talkBtn').onclick = () => { talkOpen = !talkOpen; talkCat = null; renderTalk(true); };

let askKey = '';
function renderAsk() {
  const a = state.game.ask, el = $('ask'), m = me();
  if (!a || state.phase !== 'class') { el.classList.add('hidden'); askKey = ''; return; }
  const g = state.game, called = a.called && g.students.find(s => s.id === a.called);
  const hands = g.students.filter(s => s.hand).length;
  const mine = m && m.role === 'student' && a.called === m.e.id;
  const key = [a.q, a.phase, a.t, a.called, a.pick, hands, m && m.e.hand].join('|');
  if (key === askKey) return;
  askKey = key;
  el.classList.remove('hidden');
  let meta = '';
  if (a.phase === 'hands') meta = m && m.role === 'teacher'
    ? `✋ ${hands} hand(s) up · right-click a student to call on them (${a.t}s)`
    : `✋ ${hands} hand(s) up · ${m && m.e.hand ? 'your hand is up!' : 'press H to raise your hand'} (${a.t}s)`;
  else if (a.phase === 'answer') meta = mine ? `<b>You've been called on!</b> Pick an answer (${a.t}s)` : `${esc(called ? called.name : '?')} is answering… (${a.t}s)`;
  else meta = a.pick === a.answer ? `✅ ${esc(called ? called.name : '')} got it right!` : a.pick === -2 ? `🤷 ${esc(called ? called.name : '')} didn't know.` : `❌ ${esc(called ? called.name : '')} got it wrong.`;
  el.innerHTML = `<h3>${esc(g.teacher.name)} asks (${esc(g.topicName || '')})</h3><div class="q">${esc(a.q)}</div><div class="opts">${a.options.map((o, i) => {
    const cls = a.phase === 'result' ? (i === a.answer ? 'right' : i === a.pick ? 'wrong' : '') : '';
    return `<button data-i="${i}" class="${cls}" ${mine && a.phase === 'answer' ? '' : 'disabled'}>${i + 1}. ${esc(o)}</button>`;
  }).join('')}</div>${mine && a.phase === 'answer' ? '<button class="idk">🤷 I don\'t know…</button>' : ''}<div class="meta">${meta}</div>`;
  el.querySelectorAll('.opts button').forEach(b => b.onclick = () => send({ t: 'act', a: 'answer', i: +b.dataset.i }));
  const idk = el.querySelector('.idk'); if (idk) idk.onclick = () => sayLine('idk');
}

let reqKey = '';
const REQ_TEXT = { bathroom: 'Can I go to the bathroom?', water: 'Can I get some water?', nurse: 'Can I see the nurse?' };
function renderRequests() {
  const m = me(), el = $('requests');
  const reqs = m && m.role === 'teacher' && state.phase === 'class' ? state.game.students.filter(s => s.req) : [];
  const key = reqs.map(s => s.id + s.req).join();
  if (key === reqKey) return;
  reqKey = key;
  el.classList.toggle('hidden', !reqs.length);
  el.innerHTML = reqs.map((s, i) => `<div class="req">🙋 <b>${esc(s.name)}</b>: “${REQ_TEXT[s.req]}”<br><button class="yes" data-id="${s.id}" data-y="1">Yes${i ? '' : ' (Y)'}</button><button class="no" data-id="${s.id}">No${i ? '' : ' (N)'}</button></div>`).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => send({ t: 'act', a: 'reply', sid: b.dataset.id, yes: !!b.dataset.y }));
}
addEventListener('keyup', e => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
// The 3D view, camera, mouse controls and movement live in world3d.js
