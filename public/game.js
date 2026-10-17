// SchoolSim — game simulation shared by the Node LAN server and the in-browser host (GitHub Pages).
// Each player is a connection object: { send(string), close() }. Call tick() {TICK_HZ} times a second.
(function (root) {
'use strict';

const MAX_PLAYERS = 3;
const TICK_HZ = 20;
const DT = 1 / TICK_HZ;

// ---- World layout -------------------------------------------------------
const W = 960, H = 640, WALL = 24, R = 14;
const PERIODS = 3, RECESS_LEN = 8, START_ORDER = 75;
const VIEW_RANGE = 300, VIEW_HALF = Math.PI * 0.3;
const BOARD = { x: 480, y: 64 };
const DOOR = { x: 905, y: 570 };
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

// ---- Topics & questions -------------------------------------------------
const TOPICS = {
  math: { name: 'Math', board: '½ + ¼ = ¾   ·   7 × 8 = 56   ·   Area = l × w' },
  science: { name: 'Science', board: 'H₂O = water   ·   Plants need sunlight   ·   Gravity pulls down' },
  geography: { name: 'Geography', board: '7 continents   ·   5 oceans   ·   The Nile is long' },
  history: { name: 'History', board: 'Pyramids ≈ 2560 BC   ·   1969: Moon landing' },
  english: { name: 'English', board: 'Noun = person, place, thing   ·   their / there / they\'re' },
};
const BANK = {
  science: [
    ['What gas do plants breathe in?', ['Carbon dioxide', 'Oxygen', 'Helium', 'Nitrogen']],
    ['What planet is called the Red Planet?', ['Mars', 'Venus', 'Jupiter', 'Saturn']],
    ['What is H2O?', ['Water', 'Salt', 'Air', 'Gold']],
    ['How many legs does a spider have?', ['8', '6', '10', '12']],
    ['Which animal is a mammal?', ['Dolphin', 'Shark', 'Trout', 'Octopus']],
    ['What is the largest planet?', ['Jupiter', 'Earth', 'Saturn', 'Neptune']],
    ['Water freezes at what °C?', ['0', '10', '32', '-10']],
    ['What do bees make?', ['Honey', 'Milk', 'Silk', 'Cheese']],
  ],
  geography: [
    ['What is the capital of France?', ['Paris', 'Rome', 'Berlin', 'Madrid']],
    ['Which is the largest ocean?', ['Pacific', 'Atlantic', 'Indian', 'Arctic']],
    ['How many continents are there?', ['7', '5', '6', '8']],
    ['What is the capital of Japan?', ['Tokyo', 'Beijing', 'Seoul', 'Bangkok']],
    ['Which continent is Egypt in?', ['Africa', 'Asia', 'Europe', 'South America']],
    ['What is the largest country by area?', ['Russia', 'Canada', 'China', 'USA']],
    ['Which country has the Eiffel Tower?', ['France', 'Italy', 'Spain', 'Germany']],
  ],
  history: [
    ['Who was the first US president?', ['George Washington', 'Abraham Lincoln', 'Thomas Jefferson', 'John Adams']],
    ['In what year did humans first land on the Moon?', ['1969', '1959', '1979', '1989']],
    ['Who built the pyramids of Giza?', ['Ancient Egyptians', 'Romans', 'Vikings', 'Aztecs']],
    ['Which ship sank in 1912?', ['Titanic', 'Mayflower', 'Santa Maria', 'Victory']],
    ['Who painted the Mona Lisa?', ['Leonardo da Vinci', 'Picasso', 'Van Gogh', 'Monet']],
    ['What wall divided Berlin?', ['Berlin Wall', 'Great Wall', 'Hadrian\'s Wall', 'Wall Street']],
  ],
  english: [
    ['Who wrote "Romeo and Juliet"?', ['Shakespeare', 'Dickens', 'Tolkien', 'Rowling']],
    ['Which word is a noun?', ['Table', 'Run', 'Quickly', 'Blue']],
    ['What is the opposite of "ancient"?', ['Modern', 'Old', 'Antique', 'Dusty']],
    ['Which word is a verb?', ['Jump', 'Happy', 'Chair', 'Slowly']],
    ['What is the plural of "mouse"?', ['Mice', 'Mouses', 'Meese', 'Mousen']],
    ['Which is spelled correctly?', ['Because', 'Becuase', 'Becouse', 'Beacause']],
  ],
};

function makeQuestion(topic) {
  if (!topic) topic = pick(Object.keys(TOPICS));
  if (topic === 'math') {
    const a = 2 + Math.floor(Math.random() * 11), b = 2 + Math.floor(Math.random() * 11);
    const op = pick(['+', '×', '−']);
    const ans = op === '+' ? a + b : op === '×' ? a * b : a - b;
    const opts = new Set([ans]);
    while (opts.size < 4) opts.add(ans + pick([-1, 1]) * (1 + Math.floor(Math.random() * 6)));
    const options = shuffle([...opts].map(String));
    return { q: `What is ${a} ${op} ${b}?`, options, answer: options.indexOf(String(ans)) };
  }
  const [q, opts] = pick(BANK[topic]);
  const options = shuffle(opts.slice());
  return { q, options, answer: options.indexOf(opts[0]) };
}

// ---- Dialogue -----------------------------------------------------------
// Every line a player can pick from the T (talk) menu. `target` lines use the student under the teacher's cursor.
const LINES = {
  teacher: [
    ...Object.entries(TOPICS).map(([k, t]) => ({ cat: 'Topic', id: 'topic_' + k, text: `Today's topic is ${t.name}!`, cd: 4 })),
    { cat: 'Ask', id: 'ask', text: 'Who can tell me the answer?', hint: 'question for the class — students raise hands' },
    { cat: 'Ask', id: 'call', text: '{name}, can you answer this?', target: true, hint: 'call on the student you point at' },
    { cat: 'Ask', id: 'callhand', text: 'Yes, {name}? Your hand is up.', hint: 'pick someone with a hand up' },
    { cat: 'Ask', id: 'quiz', text: 'Pop quiz! Pencils out!', hint: 'everyone answers' },
    { cat: 'Discipline', id: 'shush', text: 'Shhh! Quiet down!', cd: 12, hint: 'stops mischief near you' },
    { cat: 'Discipline', id: 'eyes', text: 'Eyes up here, everyone!', cd: 25, hint: 'whole class settles down' },
    { cat: 'Discipline', id: 'phone', text: '{name}, put that phone away!', target: true, cd: 3, hint: 'confiscate a phone' },
    { cat: 'Discipline', id: 'detention', text: '{name}! Detention!', target: true, cd: 1, hint: '12 s in the corner — punishing an innocent kid upsets the class' },
    { cat: 'Discipline', id: 'office', text: '{name}, principal\'s office. NOW!', target: true, cd: 20, hint: 'out of the room for 25 s, −15 mischief' },
    { cat: 'Discipline', id: 'release', text: '{name}, you can go back to your seat.', target: true, cd: 2, hint: 'let a kid out of detention early' },
    { cat: 'Praise', id: 'praise', text: 'Great work, everyone!', cd: 30, hint: '+order, +grades for good kids' },
    { cat: 'Praise', id: 'star', text: 'Gold star for {name}!', target: true, cd: 10, hint: '+5 grade' },
    { cat: 'Praise', id: 'homework', text: 'Homework tonight: page 42!', cd: 45, hint: '+order, but they groan' },
  ],
  student: [
    { cat: 'Class', id: 'hand', text: '✋', label: 'Raise / lower hand', hint: 'teacher may call on you' },
    { cat: 'Class', id: 'idk', text: 'I don\'t know…', hint: 'skip when called' },
    { cat: 'Class', id: 'why', text: 'Why do we even need to learn this?', cd: 8, hint: 'cheeky (+2 mischief)' },
    { cat: 'Requests', id: 'bathroom', text: 'Can I go to the bathroom?', cd: 10, hint: 'hall pass: roam for 15 s' },
    { cat: 'Requests', id: 'water', text: 'Can I get some water?', cd: 10, hint: 'hall pass: roam for 15 s' },
    { cat: 'Requests', id: 'nurse', text: 'I don\'t feel good… can I see the nurse?', cd: 10, hint: 'hall pass: roam for 15 s' },
    { cat: 'Mischief', id: 'boring', text: 'This is sooo boring!', cd: 6, hint: '+3 mischief' },
    { cat: 'Mischief', id: 'whisper', text: 'Psst, {name}! Look at this!', cd: 5, hint: 'whisper to a neighbour' },
    { cat: 'Mischief', id: 'fart', text: '*makes a fart noise*', cd: 15, hint: '+5 mischief, class laughs' },
    { cat: 'Nice', id: 'compliment', text: 'You look great today, {teacher}!', cd: 20, hint: '+1 grade' },
    { cat: 'Nice', id: 'help', text: 'Can I help hand out papers?', cd: 30, hint: '+2 grade, +order' },
  ],
};
const LINE_BY_ID = {};
for (const role of ['teacher', 'student']) for (const l of LINES[role]) LINE_BY_ID[role + ':' + l.id] = l;

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

function createSchoolSim(opts = {}) {
  const PERIOD_LEN = opts.periodLen || 150;

  // ---- State --------------------------------------------------------------
  const players = new Map(); // id -> { id, conn, name, role, input }
  let hostId = null;
  let nextId = 1;
  let phase = 'lobby'; // lobby | class | recess | over
  let game = null;
  let events = [];

  function emit(text, x, y, color = '#fff') { events.push({ text, x: Math.round(x), y: Math.round(y), color }); }
  function tell(p, text) { if (p) p.conn.send(JSON.stringify({ t: 'toast', text })); }
  function say(e, text) { e.say = text; e.sayT = 2.5 + text.length * 0.04; }

  function makeTeacher(player) {
    const n = NODES[FRONT_MID];
    return {
      id: 'T', kind: 'teacher', name: player ? player.name : pick(NPC_TEACHERS), color: '#4b2c6f',
      playerId: player ? player.id : null, x: n.x, y: n.y, angle: Math.PI / 2,
      teaching: false, catchCd: 0, catches: 0, score: 0, glance: 0, say: '', sayT: 0, cds: {},
      ai: newTeacherAI(),
    };
  }

  function newTeacherAI() {
    return { path: [], node: FRONT_MID, pause: 1, mode: 'patrol', legs: 0, teachT: 0, glanceT: 3, suspect: null, reactT: 0, scan: Math.random() * 6, callT: 0 };
  }

  function makeStudent(desk, name, color, player) {
    const d = DESKS[desk];
    return {
      id: 'S' + desk, kind: 'student', name, color, playerId: player ? player.id : null, desk,
      x: d.seatX, y: d.seatY, angle: -Math.PI / 2,
      grade: 0, mischief: 0, caught: 0, action: null, actionT: 0, misbehaveT: 0, detentionT: 0,
      throwCd: 0, noteCd: 0, quizAt: 0, hand: false, passT: 0, request: null, say: '', sayT: 0, cds: {},
      ai: { bold: rand(0.4, 1.2), think: rand(0.5, 2), wX: 0, wPhase: 0, answerAt: 0 },
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
      ask: null, topic: null, banner: null,
    };
    phase = 'class';
    emit('Class is in session!', 480, 300, '#ffd166');
  }

  const byId = id => (game.teacher.id === id ? game.teacher : game.students.find(s => s.id === id));
  const outOfSeat = s => Math.hypot(s.x - DESKS[s.desk].seatX, s.y - DESKS[s.desk].seatY) > 26;
  const isMisbehaving = s => s.detentionT <= 0 && (s.action === 'phone' || s.action === 'note' || s.action === 'wander' || s.misbehaveT > 0 || (outOfSeat(s) && s.passT <= 0));
  const activeStudents = () => game.students.filter(s => s.detentionT <= 0);

  function canSee(t, e) {
    const dx = e.x - t.x, dy = e.y - t.y, d = Math.hypot(dx, dy);
    if (d > VIEW_RANGE) return false;
    if (d < 40) return true;
    return Math.abs(angDiff(Math.atan2(dy, dx), t.angle)) <= VIEW_HALF;
  }

  function visibleMisbehavers(t) {
    return game.students.filter(s => isMisbehaving(s) && canSee(t, s)).sort((a, b) => dist(t, a) - dist(t, b));
  }

  function settle(s) {
    // Make a student stop whatever they were up to (NPCs walk back to their seat)
    if (s.action === 'wander') s.ai.wPhase = 2;
    else if (s.action !== 'pass') s.action = null;
    s.misbehaveT = 0;
  }

  function sendToDetention(s, office = false) {
    const k = game.students.filter(o => o.detentionT > 0 && !o.office).length;
    s.detentionT = office ? 25 : 12; s.office = office; s.action = null; s.misbehaveT = 0; s.caught++; s.hand = false; s.passT = 0; s.request = null;
    s.mischief = Math.max(0, s.mischief - (office ? 15 : 10));
    if (office) { s.x = W + 80; s.y = DOOR.y; } // out of the room
    else { s.x = DETENTION.x + 22 + (k % 4) * 26; s.y = DETENTION.y + 30 + Math.floor(k / 4) * 30; }
    s.angle = Math.PI;
    if (!s.playerId) say(s, pick(['Aw man!', 'Not fair!', 'Ugh…', 'It wasn\'t me!']));
  }

  function doCatch(t, s, office = false) {
    // Repeat offenders get sent to the principal by the NPC teacher
    if (!t.playerId && s.caught >= 2 && Math.random() < 0.4) office = true;
    const x = s.x, y = s.y;
    sendToDetention(s, office);
    t.catches++; t.score += office ? 15 : 10; t.catchCd = 0.8;
    game.order = Math.min(100, game.order + (office ? 12 : 8));
    if (!t.playerId) say(t, office ? `${s.name}, principal's office. NOW!` : `${s.name}! Detention!`);
    emit(office ? `${s.name} → PRINCIPAL'S OFFICE!` : `${s.name}! DETENTION!`, x, y - 30, '#ff6b6b');
  }

  function teacherCatch(t) {
    if (t.catchCd > 0 || phase !== 'class') return;
    const s = visibleMisbehavers(t)[0];
    if (s) return doCatch(t, s);
    wrongAccusation(t);
  }

  function wrongAccusation(t) {
    t.catchCd = 2;
    game.order = Math.max(0, game.order - 4);
    emit('Wrong kid! (-order)', t.x, t.y - 30, '#ffa94d');
  }

  function startQuiz() {
    if (game.quiz || game.ask || phase !== 'class') return false;
    const q = makeQuestion(game.topic);
    game.quiz = { ...q, t: 10, reveal: 0, answers: {} };
    for (const s of game.students) s.quizAt = rand(1.5, 8);
    emit('POP QUIZ!', 480, 120, '#74c0fc');
    return true;
  }

  // ---- Asking questions & calling on students -------------------------------
  function startAsk() {
    if (game.quiz || game.ask || !game.topic || phase !== 'class') return false;
    game.ask = { ...makeQuestion(game.topic), phase: 'hands', t: 15, called: null, pick: -1, wasMis: false };
    game.teacher.ai.callT = rand(3, 5.5);
    return true;
  }

  function callOn(s) {
    const a = game.ask;
    a.phase = 'answer'; a.t = 9; a.called = s.id; a.pick = -1;
    a.hadHand = s.hand;
    a.wasMis = isMisbehaving(s);
    for (const o of game.students) o.hand = false;
    if (a.wasMis) {
      settle(s); s.mischief = Math.max(0, s.mischief - 5);
      if (!s.playerId) say(s, 'Huh? What?');
      emit('Caught off guard! (-5 mischief)', s.x, s.y - 30, '#ffa94d');
    }
    s.ai.answerAt = rand(1.5, 3.5);
  }

  function resolveAsk(pickIdx) {
    const a = game.ask, s = byId(a.called), t = game.teacher;
    a.phase = 'result'; a.t = 3; a.pick = pickIdx;
    if (!s) return;
    if (pickIdx === a.answer) {
      s.grade += 6 + (a.hadHand ? 2 : 0); t.score += 3;
      game.order = Math.min(100, game.order + 3);
      if (!t.playerId) say(t, `Correct! Well done, ${s.name}.`);
      emit(`Correct! +${6 + (a.hadHand ? 2 : 0)} grade`, s.x, s.y - 30, '#8ce99a');
    } else if (pickIdx === -2) {
      if (!t.playerId) say(t, 'Then pay attention!');
    } else {
      game.order = Math.max(0, game.order - 1);
      if (!t.playerId) say(t, `Not quite. It was ${a.options[a.answer]}.`);
      emit('Wrong answer!', s.x, s.y - 30, '#ffa94d');
    }
  }

  function studentAnswer(s, i) {
    const a = game.ask;
    if (a && a.phase === 'answer' && a.called === s.id) {
      say(s, i === -2 ? 'I don\'t know…' : `Is it ${a.options[i]}?`);
      return resolveAsk(i);
    }
    const q = game.quiz;
    if (q && q.reveal <= 0 && !(s.id in q.answers) && i >= 0) q.answers[s.id] = i;
  }

  function updateAsk() {
    const a = game.ask;
    if (!a) return;
    a.t -= DT;
    if (a.phase === 'hands' && a.t <= 0) {
      game.ask = null; game.quizCd = Math.max(game.quizCd, 10);
      for (const s of game.students) s.hand = false;
      say(game.teacher, 'Nobody? Okay then…');
    } else if (a.phase === 'answer') {
      const s = byId(a.called);
      if (!s || s.detentionT > 0) { game.ask = null; return; }
      if (!s.playerId) {
        s.ai.answerAt -= DT;
        if (s.ai.answerAt <= 0) {
          const p = 0.55 + (a.hadHand ? 0.25 : 0) - (a.wasMis ? 0.25 : 0);
          studentAnswer(s, Math.random() < 0.1 ? -2 : Math.random() < p ? a.answer : Math.floor(Math.random() * 4));
        }
      } else if (a.t <= 0) {
        emit('Too slow!', s.x, s.y - 30, '#ffa94d');
        resolveAsk(-1);
      }
    } else if (a.phase === 'result' && a.t <= 0) {
      game.ask = null;
    }
  }

  // ---- Hall pass requests -------------------------------------------------
  function answerRequest(s, yes) {
    if (!s.request) return;
    const t = game.teacher;
    s.request = null;
    if (yes) {
      s.passT = 15;
      say(t, pick([`Sure, ${s.name}. Be quick.`, 'Okay, go ahead.', 'Fine. Take the hall pass.']));
      if (!s.playerId) { settle(s); s.action = 'pass'; s.ai.wPhase = 0; }
    } else {
      say(t, pick([`No, ${s.name}. Sit down.`, 'Not now.', 'You can wait until recess.']));
    }
  }

  // ---- Dialogue effects -----------------------------------------------------
  function speak(e, role, id, targetId) {
    const line = LINE_BY_ID[role + ':' + id];
    if (!line || !game || (phase !== 'class' && phase !== 'recess')) return;
    const p = e.playerId && players.get(e.playerId);
    if ((e.cds[id] || 0) > 0) return tell(p, `Wait ${Math.ceil(e.cds[id])}s before saying that again.`);
    if ((e.cds._any || 0) > 0) return tell(p, 'Not so fast!');
    const t = game.teacher;
    let target = targetId ? game.students.find(s => s.id === targetId && (id === 'release' ? s.detentionT > 0 && !s.office : s.detentionT <= 0)) : null;
    if (line.target && !target) return tell(p, id === 'release' ? 'Point at a kid in detention first.' : 'Point your mouse at a student first.');
    if (phase === 'recess' && role === 'teacher' && !id.startsWith('topic_')) { say(e, line.text.replace('{name}', target ? target.name : '')); return; }

    if (role === 'teacher') {
      if (id.startsWith('topic_')) {
        game.topic = id.slice(6);
        emit(`New topic: ${TOPICS[game.topic].name}`, 480, 110, '#ffd166');
      } else if (id === 'ask') {
        if (!game.topic) return tell(p, 'Start a topic first (Topic menu).');
        if (!startAsk()) return tell(p, 'Finish the current question first.');
      } else if (id === 'call') {
        if (game.ask && game.ask.phase === 'hands') callOn(target);
        else if (!game.ask && game.topic && !game.quiz) { startAsk(); callOn(target); }
        else return tell(p, game.topic ? 'Wait for the current question to finish.' : 'Start a topic first (Topic menu).');
      } else if (id === 'callhand') {
        const hands = game.students.filter(s => s.hand && s.detentionT <= 0);
        if (!game.ask || game.ask.phase !== 'hands' || !hands.length) return tell(p, 'Nobody has their hand up.');
        target = hands.find(s => s.playerId) || pick(hands);
        callOn(target);
      } else if (id === 'quiz') {
        if (game.quizCd > 0) return tell(p, `Pop quiz ready in ${Math.ceil(game.quizCd)}s.`);
        if (!startQuiz()) return tell(p, 'Finish the current question first.');
      } else if (id === 'shush') {
        for (const s of activeStudents()) if (dist(s, t) < 260) settle(s);
        game.order = Math.min(100, game.order + 3);
      } else if (id === 'eyes') {
        for (const s of activeStudents()) { settle(s); if (!s.playerId && s.action !== 'pass') s.angle = Math.atan2(t.y - s.y, t.x - s.x); }
        game.order = Math.min(100, game.order + 5);
      } else if (id === 'phone') {
        if (target.action === 'phone') {
          target.action = null; target.mischief = Math.max(0, target.mischief - 5);
          target.phoneBan = 8;
          game.order = Math.min(100, game.order + 2);
          if (!target.playerId) say(target, 'Sorry…');
          emit('Phone confiscated!', target.x, target.y - 30, '#ffa94d');
        } else { wrongAccusation(t); if (!target.playerId) say(target, 'What phone?!'); }
      } else if (id === 'detention' || id === 'office') {
        if (t.catchCd > 0) return;
        const office = id === 'office', guilty = isMisbehaving(target);
        if (guilty) doCatch(t, target, office);
        else {
          // The teacher can punish anyone, but the class notices when it's unfair
          sendToDetention(target, office);
          t.catchCd = 2;
          game.order = Math.max(0, game.order - (office ? 10 : 6));
          if (!target.playerId) say(target, 'What?! I didn\'t do anything!');
          chorus(['Not fair!', 'He didn\'t do anything!', 'Unfair!'], 2);
          emit(`Unfair ${office ? 'office trip' : 'detention'}! (-order)`, target.x + 60, target.y - 30, '#ffa94d');
        }
      } else if (id === 'release') {
        target.detentionT = 0.01;
        game.order = Math.min(100, game.order + 1);
        if (!target.playerId) setTimeout(() => say(target, 'Thanks!'), 400);
      } else if (id === 'praise') {
        game.order = Math.min(100, game.order + 4);
        for (const s of activeStudents()) if (!isMisbehaving(s)) s.grade += 2;
        chorus(['Yay!', 'Thanks!', ':)'], 3);
      } else if (id === 'star') {
        target.grade += 5;
        if (!target.playerId) say(target, 'Thanks!');
      } else if (id === 'homework') {
        game.order = Math.min(100, game.order + 3);
        chorus(['Awww!', 'Nooo!', 'Ugh!'], 5);
      }
      say(e, line.text.replace('{name}', target ? target.name : ''));
    } else {
      const s = e;
      if (s.detentionT > 0) return;
      let text = line.text.replace('{teacher}', t.name);
      if (id === 'hand') { s.hand = !s.hand; if (!s.hand) text = ''; }
      else if (id === 'idk') {
        if (game.ask && game.ask.phase === 'answer' && game.ask.called === s.id) return studentAnswer(s, -2);
      } else if (id === 'why') { mischief(s, 2, 1.5, 1); reply(t, 'Because it\'s on the test!'); }
      else if (['bathroom', 'water', 'nurse'].includes(id)) {
        if (s.request || s.passT > 0) return;
        s.request = { kind: id, t: 10 };
        t.ai.reqT = rand(1.2, 2.2);
      } else if (id === 'boring') { mischief(s, 3, 2, 2); chorus(['Yeah!', 'Totally.'], 1); }
      else if (id === 'whisper') {
        const n = activeStudents().filter(o => o !== s).sort((a, b) => dist(a, s) - dist(b, s))[0];
        if (!n || dist(n, s) > 220) return tell(p, 'Nobody close enough to whisper to.');
        text = line.text.replace('{name}', n.name);
        mischief(s, 2, 2, 0.5);
        if (!n.playerId) setTimeout(() => n.detentionT <= 0 && say(n, pick(['Haha nice', 'Whoa!', 'Shh, she\'ll see!'])), 900);
      } else if (id === 'fart') {
        mischief(s, 5, 2.5, 4);
        for (const o of activeStudents().filter(o => o !== s && !o.playerId && dist(o, s) < 250).slice(0, 4)) say(o, pick(['Hahaha!', 'Ewww!', 'LOL']));
      } else if (id === 'compliment') { if (phase === 'class') s.grade += 1; reply(t, `Why thank you, ${s.name}.`); }
      else if (id === 'help') { if (phase === 'class') { s.grade += 2; game.order = Math.min(100, game.order + 1); } reply(t, 'How helpful!'); }
      if (text) say(s, text);
    }
    e.cds[id] = line.cd || 0;
    e.cds._any = 0.4;
  }

  function mischief(s, pts, misT, orderLoss) {
    if (phase !== 'class') return;
    s.mischief += pts; s.misbehaveT = Math.max(s.misbehaveT, misT);
    game.order = Math.max(0, game.order - orderLoss);
  }
  function reply(t, text) { if (!t.playerId) setTimeout(() => game && say(t, text), 1100); }
  function chorus(lines, n) { for (const s of shuffle(activeStudents().filter(s => !s.playerId)).slice(0, n)) say(s, pick(lines)); }

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

  function tickCommon(e) {
    e.sayT = Math.max(0, e.sayT - DT);
    for (const k in e.cds) e.cds[k] = Math.max(0, e.cds[k] - DT);
  }

  function updateTeacher(t) {
    tickCommon(t);
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

    // Conversation duties come first: hall-pass requests and calling on someone
    const req = game.students.find(s => s.request);
    if (req) { ai.reqT = (ai.reqT || 0) - DT; if (ai.reqT <= 0) answerRequest(req, Math.random() < 0.6); }
    if (game.ask && game.ask.phase === 'hands') {
      ai.callT -= DT;
      if (ai.callT <= 0) {
        const hands = game.students.filter(s => s.hand && s.detentionT <= 0);
        const target = hands.length ? pick(hands) : pick(activeStudents());
        if (target) speak(t, 'teacher', hands.length ? 'callhand' : 'call', target.id);
      }
    }

    if (!ai.suspect) {
      const seen = visibleMisbehavers(t);
      if (seen.length >= 3 && !t.cds.shush) speak(t, 'teacher', 'shush');
      else if (seen[0]) { ai.suspect = seen[0].id; ai.reactT = rand(0.45, 0.95); t.teaching = false; }
    }
    if (ai.suspect) {
      const s = byId(ai.suspect);
      ai.reactT -= DT;
      if (s) t.angle += angDiff(Math.atan2(s.y - t.y, s.x - t.x), t.angle) * Math.min(1, 8 * DT);
      if (ai.reactT <= 0) {
        if (s && isMisbehaving(s) && canSee(t, s) && t.catchCd <= 0) {
          if (s.action === 'phone' && Math.random() < 0.3) speak(t, 'teacher', 'phone', s.id);
          else doCatch(t, s);
        }
        ai.suspect = null;
        t.glance = 0;
      }
      return;
    }

    if (game.quizCd <= 0 && !game.quiz && !game.ask && Math.random() < DT * 0.05) speak(t, 'teacher', 'quiz');

    if (ai.mode === 'teach' && !ai.path.length && dist(t, BOARD) < 6) {
      ai.teachT -= DT;
      if (!game.ask && !game.quiz && Math.random() < DT * 0.12) speak(t, 'teacher', 'ask');
      if (t.glance > 0) {
        t.glance -= DT; t.teaching = false;
        t.angle += angDiff(Math.PI / 2, t.angle) * Math.min(1, 10 * DT);
      } else {
        t.teaching = true; t.angle = -Math.PI / 2;
        ai.glanceT -= DT;
        if (ai.glanceT <= 0) { t.glance = rand(0.8, 1.5); ai.glanceT = rand(2.5, 6); }
      }
      if (ai.teachT <= 0) {
        t.teaching = false; t.glance = 0; ai.mode = 'patrol'; ai.legs = 0;
        if (Math.random() < 0.3) speak(t, 'teacher', pick(['praise', 'homework', 'eyes']));
      }
      return;
    }
    t.teaching = false;

    if (ai.path.length) {
      const n = NODES[ai.path[0]];
      const arrived = moveToward(t, n.x, n.y, 115);
      collide(t);
      ai.scan += DT * 2;
      t.angle += Math.sin(ai.scan) * 0.5; // look around while walking
      if (arrived) {
        ai.node = ai.path.shift();
        if (!ai.path.length) {
          ai.pause = rand(0.6, 1.8);
          if (ai.mode === 'teach' && (!game.topic || Math.random() < 0.3)) {
            speak(t, 'teacher', 'topic_' + pick(Object.keys(TOPICS).filter(k => k !== game.topic)));
          }
        }
      }
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
    if (ai.legs > 3 + Math.random() * 3 || !game.topic) {
      ai.mode = 'teach'; ai.teachT = rand(10, 16); ai.glanceT = rand(2, 4);
      npcGoTo(t, BOARD_NODE);
    } else {
      let target;
      do { target = Math.floor(Math.random() * (NODES.length - 1)); } while (target === ai.node);
      npcGoTo(t, target);
    }
  }

  function updateStudent(s, t) {
    tickCommon(s);
    s.throwCd = Math.max(0, s.throwCd - DT);
    s.noteCd = Math.max(0, s.noteCd - DT);
    s.misbehaveT = Math.max(0, s.misbehaveT - DT);
    s.passT = Math.max(0, s.passT - DT);
    s.phoneBan = Math.max(0, (s.phoneBan || 0) - DT);
    if (s.request) {
      s.request.t -= DT;
      if (s.request.t <= 0) { s.request = null; if (!s.playerId) say(s, '…hello?'); }
    }
    if (s.detentionT > 0) {
      s.detentionT -= DT;
      if (s.detentionT <= 0) {
        const d = DESKS[s.desk]; s.x = d.seatX; s.y = d.seatY; s.angle = -Math.PI / 2; s.office = false;
        emit(`${s.name} is back`, s.x, s.y - 30, '#aaa');
      }
      return;
    }
    const p = s.playerId && players.get(s.playerId);
    if (p) {
      movePlayer(s, p.input, 150);
      s.angle = p.input.aim;
      if (p.input.phone && phase === 'class' && s.phoneBan <= 0) s.action = 'phone';
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
    if (s.action === 'pass') {
      // Hall pass: walk to the door, linger, come back
      if (ai.wPhase === 0) { moveToward(s, s.x < 870 ? 880 : DOOR.x, d.seatY, 90) && (ai.wPhase = 1); }
      else if (ai.wPhase === 1) { if (moveToward(s, DOOR.x, DOOR.y, 90)) { ai.wPhase = 2; s.actionT = 4; } }
      else if (ai.wPhase === 2) { s.actionT -= DT; if (s.actionT <= 0 || s.passT < 6) ai.wPhase = 3; }
      else if (ai.wPhase === 3) { moveToward(s, 880, d.seatY, 100) && (ai.wPhase = 4); }
      else if (moveToward(s, d.seatX, d.seatY, 100)) { s.action = null; s.angle = -Math.PI / 2; }
      return;
    }
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
    if (game.ask) {
      if (game.ask.phase === 'hands' && !s.hand && Math.random() < 0.35 * (1.4 - ai.bold)) {
        s.hand = true;
        if (Math.random() < 0.3) say(s, pick(['Ooh! Me!', 'I know!', 'Pick me!']));
      }
      return;
    }
    let chance = seen ? 0.012 : 0.05 * ai.bold;
    if (t.teaching) chance *= 1.6;
    if (Math.random() >= chance) {
      if (Math.random() < 0.002 && !s.request && s.passT <= 0) speak(s, 'student', pick(['bathroom', 'water', 'nurse']));
      return;
    }

    const roll = Math.random();
    if (roll < 0.35) { s.action = 'phone'; s.actionT = rand(2, 6); s.angle = Math.PI / 2; if (Math.random() < 0.2) say(s, 'lol'); }
    else if (roll < 0.52) passNote(s);
    else if (roll < 0.62) speak(s, 'student', pick(['boring', 'whisper', 'why', 'fart']));
    else if (roll < 0.85) {
      const targets = activeStudents().filter(o => o !== s);
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
        if (!t.playerId) say(t, 'WHO THREW THAT?!');
        emit('BONK! Hit the teacher!', t.x, t.y - 30, '#ffd43b');
        continue;
      }
      for (const s of game.students) {
        if (s.id === b.owner || s.detentionT > 0) continue;
        if (Math.hypot(b.x - s.x, b.y - s.y) < R + 6) {
          b.life = 0;
          if (owner) owner.mischief += 4;
          if (!s.playerId) say(s, pick(['Hey!', 'Ow!', 'Quit it!']));
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
    game.quiz = null; game.ask = null; game.balls = []; game.notes = [];
    game.teacher.teaching = false;
    for (const s of game.students) { s.hand = false; s.request = null; }
    phase = 'recess'; game.timer = RECESS_LEN;
  }

  function nextPeriod() {
    if (game.period >= PERIODS) { phase = 'over'; return; }
    game.period++; game.timer = PERIOD_LEN; game.order = START_ORDER; game.banner = null; game.quizCd = 25; game.topic = null;
    for (const s of game.students) {
      const d = DESKS[s.desk];
      Object.assign(s, { x: d.seatX, y: d.seatY, angle: -Math.PI / 2, action: null, detentionT: 0, misbehaveT: 0, passT: 0 });
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
        updateAsk();
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
    if (e.sayT > 0) o.say = e.say;
    if (e.playerId) o.cds = Object.fromEntries(Object.entries(e.cds).filter(([, v]) => v > 0).map(([k, v]) => [k, Math.ceil(v)]));
    if (e.kind === 'teacher') Object.assign(o, { teaching: e.teaching, catches: e.catches, score: Math.round(e.score) });
    else Object.assign(o, {
      act: e.action, mis: isMisbehaving(e), det: e.detentionT > 0 ? Math.ceil(e.detentionT) : 0, office: !!e.office,
      hand: e.hand, pass: e.passT > 0 ? Math.ceil(e.passT) : 0, req: e.request ? e.request.kind : null,
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
      const q = game.quiz, a = game.ask;
      msg.game = {
        period: game.period, periods: PERIODS, timer: Math.max(0, Math.ceil(game.timer)), order: Math.round(game.order),
        results: game.results, banner: game.banner, quizCd: Math.max(0, Math.ceil(game.quizCd)),
        topic: game.topic, topicName: game.topic && TOPICS[game.topic].name, board: game.topic && TOPICS[game.topic].board,
        teacher: serializeEntity(game.teacher), students: game.students.map(serializeEntity),
        balls: game.balls.map(b => ({ x: r1(b.x), y: r1(b.y) })),
        notes: game.notes.map(n => { const a = byId(n.from), b = byId(n.to); return a && b ? { x1: a.x, y1: a.y, x2: b.x, y2: b.y, t: n.t / 1.5 } : null; }).filter(Boolean),
        quiz: q && { q: q.q, options: q.options, t: Math.max(0, Math.ceil(q.t)), answer: q.reveal > 0 ? q.answer : -1, answers: q.answers },
        ask: a && { q: a.q, options: a.options, phase: a.phase, t: Math.max(0, Math.ceil(a.t)), called: a.called, pick: a.pick, answer: a.phase === 'result' ? a.answer : -1 },
      };
    }
    return JSON.stringify(msg);
  }

  function broadcast() {
    const data = snapshot();
    events = [];
    for (const p of players.values()) p.conn.send(data);
  }

  function handle(p, m) {
    switch (m.t) {
      case 'role': {
        if (phase !== 'lobby' || (m.role !== 'teacher' && m.role !== 'student')) return;
        const host = players.get(hostId);
        if (p.id !== hostId && !host.role) return tell(p, 'Wait for the host to choose first.');
        if (m.role === 'teacher' && [...players.values()].some(o => o !== p && o.role === 'teacher')) return tell(p, 'Someone is already the teacher.');
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
      case 'say': {
        if (!game) return;
        const t = game.teacher;
        if (t.playerId === p.id) return speak(t, 'teacher', String(m.id), m.target);
        const s = game.students.find(o => o.playerId === p.id);
        if (s) speak(s, 'student', String(m.id));
        return;
      }
      case 'act': {
        if (!game || phase !== 'class') return;
        const t = game.teacher;
        if (t.playerId === p.id) {
          if (m.a === 'catch') teacherCatch(t);
          else if (m.a === 'teach' && dist(t, BOARD) < 70) {
            if (!game.topic && !t.teaching) return tell(p, 'Pick a topic first: T → Topic.');
            t.teaching = !t.teaching;
          } else if (m.a === 'reply') {
            const s = game.students.find(o => o.id === m.sid && o.request);
            if (s) answerRequest(s, !!m.yes);
          }
          return;
        }
        const s = game.students.find(o => o.playerId === p.id);
        if (!s || s.detentionT > 0) return;
        if (m.a === 'throw' && Number.isFinite(m.aim)) throwBall(s, m.aim);
        else if (m.a === 'note') passNote(s);
        else if (m.a === 'sit') { const d = DESKS[s.desk]; if (Math.hypot(s.x - d.seatX, s.y - d.seatY) < 70) { s.x = d.seatX; s.y = d.seatY; } }
        else if (m.a === 'answer' && Number.isInteger(m.i) && m.i >= 0 && m.i < 4) studentAnswer(s, m.i);
        return;
      }
    }
  }

  function join(conn, name) {
    if (players.size >= MAX_PLAYERS) { conn.send(JSON.stringify({ t: 'full' })); conn.close(); return null; }
    const p = { id: 'P' + nextId++, conn, name: String(name || 'Player').trim().slice(0, 16) || 'Player', role: null, input: { aim: 0 } };
    players.set(p.id, p);
    if (!hostId) hostId = p.id;
    if (game && phase !== 'lobby' && phase !== 'over') {
      // Late joiner takes over an NPC student
      const s = game.students.find(o => !o.playerId);
      if (s) { s.playerId = p.id; s.name = p.name; p.role = 'student'; emit(`${p.name} joined the class`, s.x, s.y - 30, '#8ce99a'); }
    }
    conn.send(JSON.stringify({ t: 'welcome', id: p.id, urls: opts.urls ? opts.urls() : [], room: opts.room || null, lines: LINES }));
    return p;
  }

  function leave(p) {
    players.delete(p.id);
    if (game) {
      const e = game.teacher.playerId === p.id ? game.teacher : game.students.find(s => s.playerId === p.id);
      if (e) {
        e.playerId = null;
        if (e.kind === 'teacher') { e.ai = newTeacherAI(); e.teaching = false; }
        else if (e.action === 'phone') e.action = null;
        emit(`${p.name} left — an NPC takes over`, e.x, e.y - 30, '#aaa');
      }
    }
    if (hostId === p.id) hostId = players.size ? players.keys().next().value : null;
    if (!players.size) { phase = 'lobby'; game = null; }
  }

  return { join, handle, leave, tick, TICK_HZ };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createSchoolSim };
else root.createSchoolSim = createSchoolSim;
})(typeof window !== 'undefined' ? window : globalThis);
