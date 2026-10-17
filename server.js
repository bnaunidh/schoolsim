'use strict';
// Detention! — LAN multiplayer school game server.
// Serves the client from ./public and runs the authoritative game simulation over WebSockets.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const MAX_PLAYERS = 3;
const TICK_HZ = 20;
const DT = 1 / TICK_HZ;

// ---- World layout -------------------------------------------------------
const W = 960, H = 640, WALL = 24, R = 14;
const PERIODS = 3, PERIOD_LEN = Number(process.env.PERIOD_LEN) || 150, RECESS_LEN = 8, START_ORDER = 75;
const VIEW_RANGE = 300, VIEW_HALF = Math.PI * 0.3;
const BOARD = { x: 480, y: 64 };
const TDESK = { x: 780, y: 130, w: 140, h: 50 };
const DESK_W = 70, DESK_H = 40;
const COLS = [200, 370, 590, 760], ROWS = [260, 380, 500];
const DESKS = [];
for (const y of ROWS) for (const x of COLS) DESKS.push({ x, y, seatX: x, seatY: y + 36 });
const OBSTACLES = DESKS.map(d => ({ x: d.x - DESK_W / 2, y: d.y - DESK_H / 2, w: DESK_W, h: DESK_H }));
OBSTACLES.push({ x: TDESK.x - TDESK.w / 2, y: TDESK.y - TDESK.h / 2, w: TDESK.w, h: TDESK.h });
const DETENTION = { x: 30, y: 520, w: 120, h: 90 };

// Walkable corridor grid used by the NPC teacher to patrol without bumping into desks.
const GX = [110, 285, 480, 675, 860], GY = [210, 320, 440, 585];
const NODES = [];
for (let j = 0; j < GY.length; j++) for (let i = 0; i < GX.length; i++) {
  if (GX[i] === 110 && GY[j] === 585) continue; // detention corner
  NODES.push({ x: GX[i], y: GY[j], i, j, n: [] });
}
for (const a of NODES) for (const b of NODES) {
  if (a !== b && Math.abs(a.i - b.i) + Math.abs(a.j - b.j) === 1) a.n.push(NODES.indexOf(b));
}
const FRONT_MID = NODES.findIndex(n => n.x === 480 && n.y === 210);
const BOARD_NODE = NODES.length;
NODES.push({ x: BOARD.x, y: BOARD.y, n: [FRONT_MID] });
NODES[FRONT_MID].n.push(BOARD_NODE);

const NPC_NAMES = ['Timmy', 'Ava', 'Jake', 'Mia', 'Leo', 'Zoe', 'Max', 'Lily', 'Sam', 'Ella', 'Noah', 'Ruby', 'Finn', 'Ivy', 'Owen', 'Nora'];
const NPC_TEACHERS = ['Mrs. Crabtree', 'Mr. Grumble', 'Ms. Strict', 'Mr. Beakman'];
const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#e84393', '#00b894', '#6c5ce7', '#fd79a8', '#fab1a0'];
const TRIVIA = [
  ['What is the capital of France?', ['Paris', 'Rome', 'Berlin', 'Madrid']],
  ['How many legs does a spider have?', ['8', '6', '10', '12']],
  ['What planet is called the Red Planet?', ['Mars', 'Venus', 'Jupiter', 'Saturn']],
  ['What gas do plants breathe in?', ['Carbon dioxide', 'Oxygen', 'Helium', 'Nitrogen']],
  ['Which is the largest ocean?', ['Pacific', 'Atlantic', 'Indian', 'Arctic']],
  ['How many continents are there?', ['7', '5', '6', '8']],
  ['What is H2O?', ['Water', 'Salt', 'Air', 'Gold']],
  ['Who wrote "Romeo and Juliet"?', ['Shakespeare', 'Dickens', 'Tolkien', 'Rowling']],
  ['What is the freezing point of water (°C)?', ['0', '10', '32', '-10']],
  ['Which shape has 3 sides?', ['Triangle', 'Square', 'Pentagon', 'Circle']],
  ['What is the largest planet?', ['Jupiter', 'Earth', 'Saturn', 'Neptune']],
  ['Which animal is a mammal?', ['Dolphin', 'Shark', 'Trout', 'Octopus']],
  ['What do bees make?', ['Honey', 'Milk', 'Silk', 'Wax only']],
  ['Which is a prime number?', ['7', '9', '15', '21']],
  ['How many minutes are in an hour?', ['60', '100', '30', '24']],
  ['What is the opposite of "ancient"?', ['Modern', 'Old', 'Antique', 'Dusty']],
];

// ---- Helpers ------------------------------------------------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const r1 = v => Math.round(v * 10) / 10;

function collide(e) {
  for (const o of OBSTACLES) {
    const cx = clamp(e.x, o.x, o.x + o.w), cy = clamp(e.y, o.y, o.y + o.h);
    const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= R * R) continue;
    if (d2 === 0) { e.y = o.y + o.h + R; continue; }
    const d = Math.sqrt(d2);
    e.x = cx + dx / d * R; e.y = cy + dy / d * R;
  }
  e.x = clamp(e.x, WALL + R, W - WALL - R);
  e.y = clamp(e.y, WALL + R, H - WALL - R);
}

function moveToward(e, x, y, speed) {
  const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy);
  if (d < 3) { e.x = x; e.y = y; return true; }
  const step = Math.min(d, speed * DT);
  e.x += dx / d * step; e.y += dy / d * step;
  e.angle = Math.atan2(dy, dx);
  return false;
}

function makeQuestion() {
  if (Math.random() < 0.5) {
    const a = 2 + Math.floor(Math.random() * 11), b = 2 + Math.floor(Math.random() * 11);
    const op = pick(['+', '×', '−']);
    const ans = op === '+' ? a + b : op === '×' ? a * b : a - b;
    const opts = new Set([ans]);
    while (opts.size < 4) opts.add(ans + pick([-1, 1]) * (1 + Math.floor(Math.random() * 6)));
    const options = shuffle([...opts].map(String));
    return { q: `${a} ${op} ${b} = ?`, options, answer: options.indexOf(String(ans)) };
  }
  const [q, opts] = pick(TRIVIA);
  const options = shuffle(opts.slice());
  return { q, options, answer: options.indexOf(opts[0]) };
}

// ---- State --------------------------------------------------------------
const players = new Map(); // id -> { id, ws, name, role, input }
let hostId = null;
let nextId = 1;
let phase = 'lobby'; // lobby | class | recess | over
let game = null;
let events = [];

function emit(text, x, y, color = '#fff') { events.push({ text, x: Math.round(x), y: Math.round(y), color }); }

function makeTeacher(player) {
  const n = NODES[FRONT_MID];
  return {
    id: 'T', kind: 'teacher', name: player ? player.name : pick(NPC_TEACHERS), color: '#4b2c6f',
    playerId: player ? player.id : null, x: n.x, y: n.y, angle: Math.PI / 2,
    teaching: false, catchCd: 0, catches: 0, score: 0, glance: 0,
    ai: newTeacherAI(),
  };
}

function newTeacherAI() {
  return { path: [], node: FRONT_MID, pause: 1, mode: 'patrol', legs: 0, teachT: 0, glanceT: 3, suspect: null, reactT: 0, scan: Math.random() * 6 };
}

function makeStudent(desk, name, color, player) {
  const d = DESKS[desk];
  return {
    id: 'S' + desk, kind: 'student', name, color, playerId: player ? player.id : null, desk,
    x: d.seatX, y: d.seatY, angle: -Math.PI / 2,
    grade: 0, mischief: 0, caught: 0, action: null, actionT: 0, misbehaveT: 0, detentionT: 0,
    throwCd: 0, noteCd: 0, quizAt: 0,
    ai: { bold: rand(0.4, 1.2), think: rand(0.5, 2), wX: 0, wPhase: 0 },
  };
}

function startGame() {
  const list = [...players.values()];
  for (const p of list) if (p.role !== 'teacher') p.role = 'student';
  const teacherP = list.find(p => p.role === 'teacher');
  const studentPs = list.filter(p => p.role === 'student');
  const desks = shuffle(DESKS.map((_, i) => i));
  const names = shuffle(NPC_NAMES.slice());
  const colors = shuffle(COLORS.slice());
  const students = desks.map((desk, k) => {
    const p = studentPs[k];
    return makeStudent(desk, p ? p.name : names[k], colors[k % colors.length], p);
  }).sort((a, b) => a.desk - b.desk);
  game = {
    period: 1, timer: PERIOD_LEN, order: START_ORDER, results: [],
    teacher: makeTeacher(teacherP), students, balls: [], notes: [], quiz: null, quizCd: 25,
    banner: null,
  };
  phase = 'class';
  emit('Class is in session!', 480, 300, '#ffd166');
}

const byId = id => (game.teacher.id === id ? game.teacher : game.students.find(s => s.id === id));
const outOfSeat = s => Math.hypot(s.x - DESKS[s.desk].seatX, s.y - DESKS[s.desk].seatY) > 26;
const isMisbehaving = s => s.detentionT <= 0 && (s.action === 'phone' || s.action === 'note' || s.action === 'wander' || s.misbehaveT > 0 || outOfSeat(s));

function canSee(t, e) {
  const dx = e.x - t.x, dy = e.y - t.y, d = Math.hypot(dx, dy);
  if (d > VIEW_RANGE) return false;
  if (d < 40) return true;
  return Math.abs(angDiff(Math.atan2(dy, dx), t.angle)) <= VIEW_HALF;
}

function visibleMisbehavers(t) {
  return game.students.filter(s => isMisbehaving(s) && canSee(t, s)).sort((a, b) => dist(t, a) - dist(t, b));
}

function sendToDetention(s) {
  const k = game.students.filter(o => o.detentionT > 0).length;
  s.detentionT = 12; s.action = null; s.misbehaveT = 0; s.caught++;
  s.mischief = Math.max(0, s.mischief - 10);
  s.x = DETENTION.x + 22 + (k % 4) * 26; s.y = DETENTION.y + 30 + Math.floor(k / 4) * 30;
  s.angle = Math.PI;
}

function doCatch(t, s) {
  sendToDetention(s);
  t.catches++; t.score += 10; t.catchCd = 0.8;
  game.order = Math.min(100, game.order + 8);
  emit(`${s.name}! DETENTION!`, s.x + 60, s.y - 30, '#ff6b6b');
}

function teacherCatch(t) {
  if (t.catchCd > 0 || phase !== 'class') return;
  const s = visibleMisbehavers(t)[0];
  if (s) return doCatch(t, s);
  t.catchCd = 2;
  game.order = Math.max(0, game.order - 4);
  emit('Wrong kid! (-order)', t.x, t.y - 30, '#ffa94d');
}

function startQuiz() {
  if (game.quiz || phase !== 'class') return;
  const q = makeQuestion();
  game.quiz = { ...q, t: 10, reveal: 0, answers: {} };
  for (const s of game.students) s.quizAt = rand(1.5, 8);
  emit('POP QUIZ!', 480, 120, '#74c0fc');
}

function throwBall(s, aim) {
  if (s.throwCd > 0 || s.detentionT > 0 || phase !== 'class') return;
  s.throwCd = 1.5; s.misbehaveT = 1.5; s.angle = aim;
  game.balls.push({ x: s.x + Math.cos(aim) * 18, y: s.y + Math.sin(aim) * 18, vx: Math.cos(aim) * 420, vy: Math.sin(aim) * 420, owner: s.id, life: 1.3 });
}

function passNote(s) {
  if (s.noteCd > 0 || s.detentionT > 0 || phase !== 'class') return;
  const others = game.students.filter(o => o !== s && o.detentionT <= 0 && dist(o, s) < 220).sort((a, b) => dist(a, s) - dist(b, s));
  if (!others.length) return;
  const to = others[0];
  s.noteCd = 4; s.action = 'note'; s.actionT = 2; s.mischief += 3;
  s.angle = Math.atan2(to.y - s.y, to.x - s.x);
  game.notes.push({ from: s.id, to: to.id, t: 0 });
}

// ---- Simulation ---------------------------------------------------------
function movePlayer(e, inp, speed) {
  let dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), dy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
  if (!dx && !dy) return false;
  const l = Math.hypot(dx, dy);
  e.x += dx / l * speed * DT; e.y += dy / l * speed * DT;
  collide(e);
  return true;
}

function updateTeacher(t) {
  t.catchCd = Math.max(0, t.catchCd - DT);
  const p = t.playerId && players.get(t.playerId);
  if (p) {
    const moved = movePlayer(t, p.input, 165);
    if (t.teaching && (moved || dist(t, BOARD) > 70)) t.teaching = false;
    t.angle = t.teaching ? -Math.PI / 2 : p.input.aim;
  } else {
    npcTeacher(t);
  }
  if (t.teaching && phase === 'class') {
    t.score += DT;
    game.order = Math.min(100, game.order + 0.8 * DT);
  }
}

function npcGoTo(t, target) {
  // BFS over the corridor grid from the nearest node to target
  let start = 0, best = Infinity;
  NODES.forEach((n, i) => { const d = dist(n, t); if (d < best) { best = d; start = i; } });
  const prev = new Array(NODES.length).fill(-1); prev[start] = start;
  const q = [start];
  while (q.length) { const c = q.shift(); if (c === target) break; for (const n of NODES[c].n) if (prev[n] < 0) { prev[n] = c; q.push(n); } }
  const path = [];
  for (let c = target; c !== start && c >= 0; c = prev[c]) path.unshift(c);
  path.unshift(start);
  t.ai.path = path;
}

function npcTeacher(t) {
  const ai = t.ai;
  if (phase !== 'class') { t.teaching = false; return; }

  if (!ai.suspect) {
    const sus = visibleMisbehavers(t)[0];
    if (sus) { ai.suspect = sus.id; ai.reactT = rand(0.45, 0.95); t.teaching = false; }
  }
  if (ai.suspect) {
    const s = byId(ai.suspect);
    ai.reactT -= DT;
    if (s) t.angle += angDiff(Math.atan2(s.y - t.y, s.x - t.x), t.angle) * Math.min(1, 8 * DT);
    if (ai.reactT <= 0) {
      if (s && isMisbehaving(s) && canSee(t, s) && t.catchCd <= 0) doCatch(t, s);
      ai.suspect = null;
      t.glance = 0;
    }
    return;
  }

  if (game.quizCd <= 0 && !game.quiz && Math.random() < DT * 0.1) startQuiz();

  if (ai.mode === 'teach' && !ai.path.length && dist(t, BOARD) < 6) {
    ai.teachT -= DT;
    if (t.glance > 0) {
      t.glance -= DT; t.teaching = false;
      t.angle += angDiff(Math.PI / 2, t.angle) * Math.min(1, 10 * DT);
    } else {
      t.teaching = true; t.angle = -Math.PI / 2;
      ai.glanceT -= DT;
      if (ai.glanceT <= 0) { t.glance = rand(0.8, 1.5); ai.glanceT = rand(2.5, 6); }
    }
    if (ai.teachT <= 0) { t.teaching = false; t.glance = 0; ai.mode = 'patrol'; ai.legs = 0; }
    return;
  }
  t.teaching = false;

  if (ai.path.length) {
    const n = NODES[ai.path[0]];
    const arrived = moveToward(t, n.x, n.y, 115);
    collide(t);
    ai.scan += DT * 2;
    t.angle += Math.sin(ai.scan) * 0.5; // look around while walking
    if (arrived) { ai.node = ai.path.shift(); if (!ai.path.length) ai.pause = rand(0.6, 1.8); }
    return;
  }
  if (ai.pause > 0) {
    ai.pause -= DT;
    ai.scan += DT * 1.6;
    t.angle += DT * 1.6 * Math.cos(ai.scan) * 1.5;
    return;
  }
  if (ai.mode === 'teach') { npcGoTo(t, BOARD_NODE); return; }
  ai.legs++;
  if (ai.legs > 3 + Math.random() * 3) {
    ai.mode = 'teach'; ai.teachT = rand(8, 14); ai.glanceT = rand(2, 4);
    npcGoTo(t, BOARD_NODE);
  } else {
    let target;
    do { target = Math.floor(Math.random() * (NODES.length - 1)); } while (target === ai.node);
    npcGoTo(t, target);
  }
}

function updateStudent(s, t) {
  s.throwCd = Math.max(0, s.throwCd - DT);
  s.noteCd = Math.max(0, s.noteCd - DT);
  s.misbehaveT = Math.max(0, s.misbehaveT - DT);
  if (s.detentionT > 0) {
    s.detentionT -= DT;
    if (s.detentionT <= 0) {
      const d = DESKS[s.desk]; s.x = d.seatX; s.y = d.seatY; s.angle = -Math.PI / 2;
      emit(`${s.name} is back`, s.x, s.y - 30, '#aaa');
    }
    return;
  }
  const p = s.playerId && players.get(s.playerId);
  if (p) {
    movePlayer(s, p.input, 150);
    s.angle = p.input.aim;
    if (p.input.phone && phase === 'class') s.action = 'phone';
    else if (s.action === 'phone') s.action = null;
    if (s.action === 'note') { s.actionT -= DT; if (s.actionT <= 0) s.action = null; }
  } else {
    npcStudent(s, t);
  }

  if (phase === 'class') {
    if (isMisbehaving(s)) {
      game.order -= 0.6 * DT;
      s.mischief += (s.action === 'phone' ? 2 : 1) * DT;
    } else if (!outOfSeat(s)) {
      s.grade += (t.teaching ? 1.2 : 0.4) * DT;
    }
  }
}

function npcStudent(s, t) {
  const ai = s.ai;
  const seen = canSee(t, s) && !t.teaching;
  const d = DESKS[s.desk];
  if (s.action === 'wander') {
    if (seen && Math.random() < DT * 2 * (1.3 - ai.bold)) ai.wPhase = 2; // spotted: hurry back
    if (ai.wPhase === 0) { if (moveToward(s, ai.wX, d.seatY, 85)) { ai.wPhase = 1; s.actionT = rand(1, 2.5); } }
    else if (ai.wPhase === 1) { s.actionT -= DT; s.angle += DT * 3; if (s.actionT <= 0) ai.wPhase = 2; }
    else if (moveToward(s, d.seatX, d.seatY, 110)) { s.action = null; s.angle = -Math.PI / 2; }
    return;
  }
  if (s.action) {
    s.actionT -= DT;
    if (seen && Math.random() < DT * 2.5 * (1.3 - ai.bold)) s.actionT = 0; // sneaky stop
    if (s.actionT <= 0) { s.action = null; s.angle = -Math.PI / 2; }
    return;
  }
  if (outOfSeat(s)) { moveToward(s, d.seatX, d.seatY, 110); return; }

  if (game.quiz && game.quiz.reveal <= 0 && !(s.id in game.quiz.answers)) {
    s.quizAt -= DT;
    if (s.quizAt <= 0) game.quiz.answers[s.id] = Math.random() < 0.65 ? game.quiz.answer : Math.floor(Math.random() * 4);
  }

  ai.think -= DT;
  if (ai.think > 0) return;
  ai.think = rand(0.8, 1.4);
  if (phase !== 'class' || game.quiz) return;
  let chance = seen ? 0.012 : 0.05 * ai.bold;
  if (t.teaching) chance *= 1.6;
  if (Math.random() >= chance) return;

  const roll = Math.random();
  if (roll < 0.4) { s.action = 'phone'; s.actionT = rand(2, 6); s.angle = Math.PI / 2; }
  else if (roll < 0.62) passNote(s);
  else if (roll < 0.85) {
    const targets = game.students.filter(o => o !== s && o.detentionT <= 0);
    const tgt = Math.random() < 0.15 ? t : pick(targets);
    if (tgt) throwBall(s, Math.atan2(tgt.y - s.y, tgt.x - s.x) + rand(-0.15, 0.15));
  } else {
    s.action = 'wander'; ai.wPhase = 0;
    ai.wX = clamp(d.seatX + rand(-260, 260), 180, 900);
  }
}

function updateBalls() {
  for (const b of game.balls) {
    b.x += b.vx * DT; b.y += b.vy * DT; b.life -= DT;
    if (b.x < WALL || b.x > W - WALL || b.y < WALL || b.y > H - WALL) b.life = 0;
    if (b.life <= 0) continue;
    const owner = byId(b.owner);
    const t = game.teacher;
    if (Math.hypot(b.x - t.x, b.y - t.y) < R + 6) {
      b.life = 0;
      if (owner) owner.mischief += 10;
      game.order = Math.max(0, game.order - 6);
      emit('BONK! Hit the teacher!', t.x, t.y - 30, '#ffd43b');
      continue;
    }
    for (const s of game.students) {
      if (s.id === b.owner || s.detentionT > 0) continue;
      if (Math.hypot(b.x - s.x, b.y - s.y) < R + 6) {
        b.life = 0;
        if (owner) owner.mischief += 4;
        emit('Splat!', s.x, s.y - 26, '#ddd');
        break;
      }
    }
  }
  game.balls = game.balls.filter(b => b.life > 0);
  for (const n of game.notes) n.t += DT;
  game.notes = game.notes.filter(n => n.t < 1.5);
}

function updateQuiz() {
  game.quizCd -= DT;
  const q = game.quiz;
  if (!q) return;
  if (q.reveal > 0) {
    q.reveal -= DT;
    if (q.reveal <= 0) { game.quiz = null; game.quizCd = 35; }
    return;
  }
  q.t -= DT;
  if (q.t > 0) return;
  let right = 0;
  for (const s of game.students) if (q.answers[s.id] === q.answer) { s.grade += 8; right++; }
  game.teacher.score += right * 2;
  q.reveal = 3;
  emit(`${right} got it right!`, 480, 120, '#74c0fc');
}

function endPeriod(winner, why) {
  game.results.push(winner);
  if (winner === 'teacher') game.teacher.score += 25;
  else for (const s of game.students) if (s.playerId) s.mischief += 15;
  game.banner = { winner, why };
  game.quiz = null; game.balls = []; game.notes = [];
  game.teacher.teaching = false;
  phase = 'recess'; game.timer = RECESS_LEN;
}

function nextPeriod() {
  if (game.period >= PERIODS) { phase = 'over'; return; }
  game.period++; game.timer = PERIOD_LEN; game.order = START_ORDER; game.banner = null; game.quizCd = 25;
  for (const s of game.students) {
    const d = DESKS[s.desk];
    Object.assign(s, { x: d.seatX, y: d.seatY, angle: -Math.PI / 2, action: null, detentionT: 0, misbehaveT: 0 });
  }
  const t = game.teacher, n = NODES[FRONT_MID];
  Object.assign(t, { x: n.x, y: n.y, angle: Math.PI / 2, teaching: false, glance: 0, ai: newTeacherAI() });
  phase = 'class';
  emit(`Period ${game.period} — class is in session!`, 480, 300, '#ffd166');
}

function tick() {
  if (game && (phase === 'class' || phase === 'recess')) {
    const t = game.teacher;
    updateTeacher(t);
    for (const s of game.students) updateStudent(s, t);
    if (phase === 'class') {
      updateBalls();
      updateQuiz();
      game.order = clamp(game.order, 0, 100);
      game.timer -= DT;
      if (game.order <= 0) endPeriod('students', 'CHAOS! The class went wild.');
      else if (game.timer <= 0) endPeriod(game.order >= 50 ? 'teacher' : 'students', game.order >= 50 ? 'The class stayed under control.' : 'The class was out of control.');
    } else {
      game.timer -= DT;
      if (game.timer <= 0) nextPeriod();
    }
  }
  broadcast();
}

// ---- Networking ---------------------------------------------------------
function serializeEntity(e) {
  const o = { id: e.id, name: e.name, color: e.color, pid: e.playerId, x: r1(e.x), y: r1(e.y), a: Math.round(e.angle * 100) / 100 };
  if (e.kind === 'teacher') Object.assign(o, { teaching: e.teaching, catches: e.catches, score: Math.round(e.score) });
  else Object.assign(o, {
    act: e.action, mis: isMisbehaving(e), det: e.detentionT > 0 ? Math.ceil(e.detentionT) : 0,
    grade: Math.round(e.grade), mischief: Math.round(e.mischief), caught: e.caught, score: Math.round(e.grade + e.mischief),
  });
  return o;
}

function snapshot() {
  const msg = {
    t: 'state', phase, hostId, max: MAX_PLAYERS,
    players: [...players.values()].map(p => ({ id: p.id, name: p.name, role: p.role })),
    events,
  };
  if (game) {
    const q = game.quiz;
    msg.game = {
      period: game.period, periods: PERIODS, timer: Math.max(0, Math.ceil(game.timer)), order: Math.round(game.order),
      results: game.results, banner: game.banner, quizCd: Math.max(0, Math.ceil(game.quizCd)),
      teacher: serializeEntity(game.teacher), students: game.students.map(serializeEntity),
      balls: game.balls.map(b => ({ x: r1(b.x), y: r1(b.y) })),
      notes: game.notes.map(n => { const a = byId(n.from), b = byId(n.to); return a && b ? { x1: a.x, y1: a.y, x2: b.x, y2: b.y, t: n.t / 1.5 } : null; }).filter(Boolean),
      quiz: q && { q: q.q, options: q.options, t: Math.max(0, Math.ceil(q.t)), answer: q.reveal > 0 ? q.answer : -1, answers: q.answers },
    };
  }
  return JSON.stringify(msg);
}

function broadcast() {
  const data = snapshot();
  events = [];
  for (const p of players.values()) if (p.ws.readyState === 1) p.ws.send(data);
}

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
    if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  }
  return out;
}

function handle(p, m) {
  switch (m.t) {
    case 'role': {
      if (phase !== 'lobby' || (m.role !== 'teacher' && m.role !== 'student')) return;
      const host = players.get(hostId);
      if (p.id !== hostId && !host.role) return p.ws.send(JSON.stringify({ t: 'toast', text: 'Wait for the host to choose first.' }));
      if (m.role === 'teacher' && [...players.values()].some(o => o !== p && o.role === 'teacher')) return p.ws.send(JSON.stringify({ t: 'toast', text: 'Someone is already the teacher.' }));
      p.role = m.role;
      return;
    }
    case 'start':
      if (phase === 'lobby' && p.id === hostId && p.role) startGame();
      return;
    case 'restart':
      if (phase === 'over' && p.id === hostId) { phase = 'lobby'; game = null; }
      return;
    case 'input': {
      const i = p.input;
      i.up = !!m.up; i.down = !!m.down; i.left = !!m.left; i.right = !!m.right; i.phone = !!m.phone;
      if (Number.isFinite(m.aim)) i.aim = m.aim;
      return;
    }
    case 'act': {
      if (!game || phase !== 'class') return;
      const t = game.teacher;
      if (t.playerId === p.id) {
        if (m.a === 'catch') teacherCatch(t);
        else if (m.a === 'teach' && dist(t, BOARD) < 70) t.teaching = !t.teaching;
        else if (m.a === 'quiz') { if (game.quizCd <= 0) startQuiz(); }
        return;
      }
      const s = game.students.find(o => o.playerId === p.id);
      if (!s || s.detentionT > 0) return;
      if (m.a === 'throw' && Number.isFinite(m.aim)) throwBall(s, m.aim);
      else if (m.a === 'note') passNote(s);
      else if (m.a === 'sit') { const d = DESKS[s.desk]; if (Math.hypot(s.x - d.seatX, s.y - d.seatY) < 70) { s.x = d.seatX; s.y = d.seatY; } }
      else if (m.a === 'answer' && game.quiz && game.quiz.reveal <= 0 && !(s.id in game.quiz.answers) && m.i >= 0 && m.i < 4) game.quiz.answers[s.id] = m.i | 0;
      return;
    }
  }
}

function join(ws, name) {
  if (players.size >= MAX_PLAYERS) { ws.send(JSON.stringify({ t: 'full' })); ws.close(); return null; }
  const p = { id: 'P' + nextId++, ws, name: String(name || 'Player').trim().slice(0, 16) || 'Player', role: null, input: { aim: 0 } };
  players.set(p.id, p);
  if (!hostId) hostId = p.id;
  if (game && phase !== 'lobby' && phase !== 'over') {
    // Late joiner takes over an NPC student
    const s = game.students.find(o => !o.playerId);
    if (s) { s.playerId = p.id; s.name = p.name; p.role = 'student'; emit(`${p.name} joined the class`, s.x, s.y - 30, '#8ce99a'); }
  }
  ws.send(JSON.stringify({ t: 'welcome', id: p.id, urls: lanUrls() }));
  return p;
}

function leave(p) {
  players.delete(p.id);
  if (game) {
    const e = game.teacher.playerId === p.id ? game.teacher : game.students.find(s => s.playerId === p.id);
    if (e) {
      e.playerId = null;
      if (e.kind === 'teacher') { e.ai = newTeacherAI(); e.teaching = false; }
      emit(`${p.name} left — an NPC takes over`, e.x, e.y - 30, '#aaa');
    }
  }
  if (hostId === p.id) hostId = players.size ? players.keys().next().value : null;
  if (!players.size) { phase = 'lobby'; game = null; }
}

// ---- HTTP + WS server ---------------------------------------------------
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.normalize(path.join(PUBLIC, url === '/' ? 'index.html' : url));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
  let p = null;
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (!p) { if (m.t === 'join') p = join(ws, m.name); return; }
    handle(p, m);
  });
  ws.on('close', () => { if (p) leave(p); });
});

setInterval(tick, 1000 / TICK_HZ);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Detention! server running on port ${PORT}\n`);
  console.log(`  On this computer:   http://localhost:${PORT}`);
  for (const u of lanUrls()) console.log(`  Friends on your LAN: ${u}`);
  console.log(`\n  Up to ${MAX_PLAYERS} players. NPCs fill the rest of the class.\n`);
});
