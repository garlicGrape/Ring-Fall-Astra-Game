// End-to-end over a real WebSocket: two clients in one room, plus a third in another.
// Exercises the actual server process path — HTTP upgrade, framing, validation, the
// tick loop and snapshot delivery — rather than calling the Hub directly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { Hub } from '../server/hub.js';
import * as P from '../dist/shared/protocol.js';
import { EYE } from '../dist/movement.js';

// A minimal stand-in for server.mjs's socket wiring, on an ephemeral port so tests
// never collide with a development server.
function startServer() {
  const hub = new Hub();
  const http = createServer((req, res) => {
    if (req.url === '/healthz') { res.writeHead(200).end('{"ok":true}'); return; }
    res.writeHead(404).end();
  });
  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: P.MAX_MESSAGE_BYTES });

  wss.on('connection', socket => {
    let player = null;
    const sendFrame = text => { if (socket.readyState === socket.OPEN) socket.send(text); };
    const send = payload => sendFrame(JSON.stringify(payload));
    socket.on('message', (data, isBinary) => {
      try {
        if (isBinary) return send({ t: 'error', code: 'BAD_FRAME' });
        const msg = P.decode(data.toString(), data.length);
        if (msg.t === '__oversize') return send({ t: 'error', code: 'TOO_LARGE' });
        if (msg.t === '__malformed') return send({ t: 'error', code: 'BAD_JSON' });
        if (msg.t === 'join') {
          if (player) return send({ t: 'error', code: 'ALREADY_JOINED' });
          const result = hub.join(msg.room ?? '', msg.name, { send: sendFrame, close: (c, r) => socket.close(c, r) });
          if (!result.ok) return send({ t: 'error', code: result.code, message: result.message });
          player = result.player;
          return send({ t: 'welcome', v: P.PROTOCOL_VERSION, id: player.id, code: result.room.code, name: player.name });
        }
        if (!player) return send({ t: 'error', code: 'NOT_JOINED' });
        if (msg.t === 'input') {
          const input = P.validateInput(msg);
          if (!input) return send({ t: 'error', code: 'BAD_INPUT' });
          hub.acceptInput(player, input);
          return;
        }
        if (msg.t === 'reload') return void player.room?.requestReload(player);
        if (msg.t === 'weapon') return void player.room?.requestWeapon(player, msg.i);
        return send({ t: 'error', code: 'UNKNOWN' });
      } catch (error) {
        send({ t: 'error', code: 'SERVER', message: error?.message });
      }
    });
    const drop = () => { if (player) { hub.leave(player); player = null; } };
    socket.on('close', drop);
    socket.on('error', drop);
  });

  return new Promise(resolve => {
    http.listen(0, '127.0.0.1', () => {
      resolve({
        hub, wss,
        port: http.address().port,
        async close() {
          hub.stop();
          for (const c of wss.clients) c.terminate();
          await new Promise(done => wss.close(done));
          await new Promise(done => http.close(done));
        },
      });
    });
  });
}

// A scripted client that records everything it receives.
class Client {
  constructor(port) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.messages = [];
    this.snapshots = [];
    this.seq = 0;
    this.ready = new Promise((resolve, reject) => {
      this.socket.on('open', resolve);
      this.socket.on('error', reject);
    });
    this.socket.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      this.messages.push(msg);
      if (msg.t === 'snap') this.snapshots.push(msg);
      if (msg.t === 'welcome') { this.id = msg.id; this.code = msg.code; }
    });
  }
  send(payload) { this.socket.send(JSON.stringify(payload)); }
  sendRaw(text) { this.socket.send(text); }
  join(name, room = '') { this.send({ t: 'join', name, room }); }
  input(over = {}) { this.send({ t: 'input', seq: ++this.seq, k: 0, yaw: 0, pitch: 0, ...over }); }
  // Waits for a message matching `match`, or rejects on timeout.
  await(match, ms = 3000) {
    const found = this.messages.find(match);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for message')), ms);
      const listener = raw => {
        const msg = JSON.parse(raw.toString());
        if (match(msg)) { clearTimeout(timer); this.socket.off('message', listener); resolve(msg); }
      };
      this.socket.on('message', listener);
    });
  }
  close() { this.socket.close(); }
}

const settle = ms => new Promise(r => setTimeout(r, ms));

test('two real clients share a room, see each other move, and trade damage', async t => {
  const server = await startServer();
  const ana = new Client(server.port);
  const ben = new Client(server.port);
  t.after(async () => { ana.close(); ben.close(); await server.close(); });

  await ana.ready; await ben.ready;
  ana.join('Ana');
  const welcome = await ana.await(m => m.t === 'welcome');
  assert.equal(welcome.name, 'Ana');
  assert.equal(P.isRoomCode(welcome.code), true);

  ben.join('Ben', welcome.code);
  await ben.await(m => m.t === 'welcome');

  // Both appear in each other's snapshots.
  const snap = await ana.await(m => m.t === 'snap' && m.p.length === 2);
  assert.deepEqual(snap.p.map(p => p.n).sort(), ['Ana', 'Ben']);

  // Ben walks; Ana observes his position change over the wire.
  const roomPlayers = [...server.hub.rooms.get(welcome.code).players.values()];
  const benServer = roomPlayers.find(p => p.name === 'Ben');
  const startZ = benServer.pos.z;
  for (let i = 0; i < 40; i++) { ben.input({ k: P.KEY.FORWARD }); await settle(4); }
  await settle(200);
  assert.notEqual(benServer.pos.z, startZ, 'the server moved Ben');

  const seenByAna = ana.snapshots.at(-1).p.find(p => p.n === 'Ben');
  assert.ok(Math.abs(seenByAna.z - benServer.pos.z) < 1.5, 'Ana sees Ben near his authoritative position');

  // Put them face to face and let Ana shoot. Protection is cleared server-side.
  const anaServer = roomPlayers.find(p => p.name === 'Ana');
  anaServer.pos = { x: 0, y: EYE, z: 20 }; anaServer.yaw = 0; anaServer.pitch = 0; anaServer.protectedUntil = 0;
  benServer.pos = { x: 0, y: EYE, z: 14 }; benServer.protectedUntil = 0;
  benServer.pending.length = 0; benServer.lastInput = null;

  for (let i = 0; i < 25; i++) { ana.input({ f: true }); await settle(8); }
  await settle(250);
  assert.ok(benServer.shield < P.MAX_SHIELD || benServer.hp < P.MAX_HEALTH, 'Ben took real damage');

  const damageSeen = ana.snapshots.at(-1).p.find(p => p.n === 'Ben');
  assert.ok(damageSeen.sh < P.MAX_SHIELD || damageSeen.hp < P.MAX_HEALTH, 'the damage is visible to Ana');
});

test('a third client in another room is completely isolated', async t => {
  const server = await startServer();
  const ana = new Client(server.port);
  const cal = new Client(server.port);
  t.after(async () => { ana.close(); cal.close(); await server.close(); });

  await ana.ready; await cal.ready;
  ana.join('Ana');
  const first = await ana.await(m => m.t === 'welcome');
  cal.join('Cal');
  const second = await cal.await(m => m.t === 'welcome');
  assert.notEqual(first.code, second.code);

  await ana.await(m => m.t === 'snap');
  await cal.await(m => m.t === 'snap');
  await settle(200);
  assert.equal(ana.snapshots.at(-1).p.length, 1, 'Ana sees only herself');
  assert.equal(cal.snapshots.at(-1).p.length, 1, 'Cal sees only himself');
  assert.equal(server.hub.rooms.size, 2);
});

test('join-in-progress works and a leaver does not end the other match', async t => {
  const server = await startServer();
  const ana = new Client(server.port);
  const ben = new Client(server.port);
  const cal = new Client(server.port);
  t.after(async () => { ana.close(); ben.close(); cal.close(); await server.close(); });

  await ana.ready; await ben.ready; await cal.ready;
  ana.join('Ana');
  const room = (await ana.await(m => m.t === 'welcome')).code;
  ben.join('Ben', room);
  await ben.await(m => m.t === 'welcome');
  await ana.await(m => m.t === 'snap' && m.p.length === 2);

  // Cal joins a match already under way.
  cal.join('Cal', room);
  await cal.await(m => m.t === 'welcome');
  const three = await ana.await(m => m.t === 'snap' && m.p.length === 3, 4000);
  assert.equal(three.p.length, 3);

  // The room's creator leaves; the others keep playing.
  ana.close();
  await settle(400);
  const names = m => m.t === 'snap' && m.p.map(p => p.n).sort().join(',') === 'Ben,Cal';
  const remaining = await ben.await(names, 4000);
  assert.deepEqual(remaining.p.map(p => p.n).sort(), ['Ben', 'Cal']);
  assert.equal(server.hub.rooms.get(room).size, 2, 'the match continues without its creator');
});

test('the server survives hostile frames and keeps serving the same client', async t => {
  const server = await startServer();
  const ana = new Client(server.port);
  t.after(async () => { ana.close(); await server.close(); });

  await ana.ready;
  ana.join('Ana');
  await ana.await(m => m.t === 'welcome');

  ana.sendRaw('not json at all');
  await ana.await(m => m.t === 'error' && m.code === 'BAD_JSON');
  ana.sendRaw('[1,2,3]');
  await ana.await(m => m.t === 'error' && m.code === 'BAD_JSON');
  ana.send({ t: 'input', seq: 'nope', k: 0, yaw: 0, pitch: 0 });
  await ana.await(m => m.t === 'error' && m.code === 'BAD_INPUT');
  ana.send({ t: 'input', seq: 1, k: 999, yaw: 0, pitch: 0 });
  await ana.await(m => m.t === 'error' && m.code === 'BAD_INPUT');
  ana.send({ t: 'wat' });
  await ana.await(m => m.t === 'error' && m.code === 'UNKNOWN');

  // Still alive and still simulating after all of that.
  await settle(200);
  ana.input({ k: P.KEY.FORWARD });
  const snap = await ana.await(m => m.t === 'snap', 4000);
  assert.equal(snap.p.length, 1);
  assert.equal(server.hub.rooms.size, 1);
});

test('a full room refuses a ninth player with a readable error', async t => {
  const server = await startServer();
  const clients = [];
  t.after(async () => { for (const c of clients) c.close(); await server.close(); });

  const host = new Client(server.port); clients.push(host);
  await host.ready;
  host.join('P1');
  const room = (await host.await(m => m.t === 'welcome')).code;

  for (let i = 2; i <= P.ROOM_MAX; i++) {
    const c = new Client(server.port); clients.push(c);
    await c.ready;
    c.join('P' + i, room);
    await c.await(m => m.t === 'welcome');
  }

  const extra = new Client(server.port); clients.push(extra);
  await extra.ready;
  extra.join('P9', room);
  const rejection = await extra.await(m => m.t === 'error');
  assert.equal(rejection.code, 'ROOM_FULL');
  assert.match(rejection.message, /full/i);
  assert.equal(server.hub.rooms.get(room).size, P.ROOM_MAX);
});

test('an oversize frame closes only the offending connection', async t => {
  const server = await startServer();
  const ana = new Client(server.port);
  const flood = new Client(server.port);
  t.after(async () => { ana.close(); flood.close(); await server.close(); });

  await ana.ready; await flood.ready;
  ana.join('Ana');
  const room = (await ana.await(m => m.t === 'welcome')).code;
  flood.join('Flood', room);
  await flood.await(m => m.t === 'welcome');
  await ana.await(m => m.t === 'snap' && m.p.length === 2, 4000);

  const closed = new Promise(resolve => flood.socket.on('close', resolve));
  flood.sendRaw(JSON.stringify({ t: 'input', seq: 1, k: 0, yaw: 0, pitch: 0, pad: 'x'.repeat(P.MAX_MESSAGE_BYTES * 2) }));
  await closed;

  // The room survives, the other player keeps receiving snapshots, and the slot frees.
  await settle(400);
  const after = await ana.await(m => m.t === 'snap' && m.p.length === 1, 4000);
  assert.equal(after.p[0].n, 'Ana');
  assert.equal(server.hub.rooms.get(room).size, 1);
  assert.equal(server.wss.clients.size >= 1, true, 'the server is still accepting traffic');
});
