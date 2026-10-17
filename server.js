'use strict';
// SchoolSim — LAN server. Serves the client from ./public and runs the shared simulation (public/game.js) over WebSockets.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const { createSchoolSim } = require('./public/game.js');

const PORT = Number(process.env.PORT) || 3000;

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
    if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  }
  return out;
}

const sim = createSchoolSim({ periodLen: Number(process.env.PERIOD_LEN) || undefined, urls: lanUrls });

const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/server-info') {
    // Lets the client know it can use the WebSocket LAN server instead of peer-to-peer rooms
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ mode: 'lan' }));
  }
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
  const conn = { send: d => ws.readyState === 1 && ws.send(d), close: () => ws.close() };
  let p = null;
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (!p) { if (m.t === 'join') p = sim.join(conn, m.name); return; }
    sim.handle(p, m);
  });
  ws.on('close', () => { if (p) sim.leave(p); });
});

setInterval(sim.tick, 1000 / sim.TICK_HZ);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  SchoolSim server running on port ${PORT}\n`);
  console.log(`  On this computer:   http://localhost:${PORT}`);
  for (const u of lanUrls()) console.log(`  Friends on your LAN: ${u}`);
  console.log('\n  Up to 3 players. NPCs fill the rest of the class.\n');
});
