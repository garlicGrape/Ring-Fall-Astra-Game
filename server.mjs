// RINGFALL: static client + authoritative game server on one origin and one port.
// Binds 0.0.0.0 and honours PORT so it deploys unchanged to a container host.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import { Hub } from './server/hub.js';
import * as P from './dist/shared/protocol.js';

const root = resolve(import.meta.dirname, 'dist');
const port = Number(process.env.PORT) || 3000;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

const hub = new Hub();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: hub.rooms.size, players: hub.playerCount }));
      return;
    }

    const requested = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (requested !== root && !requested.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const file = requested === root ? resolve(root, 'index.html') : requested;
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('Not found');
  }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: P.MAX_MESSAGE_BYTES });

wss.on('connection', socket => {
  let player = null;
  // sendFrame takes serialized text (the Hub's contract); send() serializes for us.
  const sendFrame = text => { if (socket.readyState === socket.OPEN) socket.send(text); };
  const send = payload => sendFrame(JSON.stringify(payload));
  const fail = (code, message) => send({ t: 'error', code, message });

  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; if (player) player.lastSeenAt = Date.now() / 1000; });

  socket.on('message', (data, isBinary) => {
    // Nothing below may throw: a malformed frame must never take the process down.
    try {
      if (isBinary) return fail('BAD_FRAME', 'Text frames only.');
      const msg = P.decode(data.toString(), data.length);
      if (msg.t === '__oversize') { fail('TOO_LARGE', 'Message too large.'); socket.close(1009, 'oversize'); return; }
      if (msg.t === '__malformed') return fail('BAD_JSON', 'Malformed message.');

      if (msg.t === 'join') {
        if (player) return fail('ALREADY_JOINED', 'Already in a room.');
        const result = hub.join(msg.room ?? '', msg.name, { send: sendFrame, close: (c, r) => socket.close(c, r) });
        if (!result.ok) return fail(result.code, result.message);
        player = result.player;
        send({
          t: 'welcome',
          v: P.PROTOCOL_VERSION,
          id: player.id,
          code: result.room.code,
          name: player.name,
          rules: {
            killTarget: P.KILL_TARGET, matchSeconds: P.MATCH_SECONDS,
            respawn: P.RESPAWN_SECONDS, max: P.ROOM_MAX, tickHz: P.TICK_HZ,
          },
        });
        return;
      }

      if (!player) return fail('NOT_JOINED', 'Join a room first.');

      switch (msg.t) {
        case 'input': {
          const input = P.validateInput(msg);
          if (!input) return fail('BAD_INPUT', 'Invalid input.');
          if (!hub.acceptInput(player, input)) { socket.close(4001, 'input flood'); }
          return;
        }
        case 'reload': player.room?.requestReload(player); return;
        case 'weapon': player.room?.requestWeapon(player, msg.i); return;
        case 'ping': send({ t: 'pong', s: msg.s }); return;
        default: return fail('UNKNOWN', 'Unknown message type.');
      }
    } catch (error) {
      console.error('message handling failed:', error?.message);
      try { fail('SERVER', 'Message could not be handled.'); } catch { /* socket gone */ }
    }
  });

  const drop = () => { if (player) { hub.leave(player); player = null; } };
  socket.on('close', drop);
  socket.on('error', drop);
});

// Heartbeat: drop sockets that stop answering rather than leaving ghosts in rooms.
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) { socket.terminate(); continue; }
    socket.isAlive = false;
    try { socket.ping(); } catch { /* closing */ }
  }
}, P.HEARTBEAT_SECONDS * 1000);
heartbeat.unref?.();

server.listen(port, '0.0.0.0', () => {
  console.log(`RINGFALL running at http://localhost:${port}  (ws://localhost:${port}/ws)`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal}: shutting down. Active matches end here.`);
  clearInterval(heartbeat);
  hub.stop();
  for (const socket of wss.clients) { try { socket.close(1001, 'server shutting down'); } catch { /* gone */ } }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref?.();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { server, hub };
