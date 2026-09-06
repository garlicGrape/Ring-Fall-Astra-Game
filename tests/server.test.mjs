import test from 'node:test';
import assert from 'node:assert/strict';
import { Hub } from '../server/hub.js';
import { Room, ServerPlayer, forwardVector } from '../server/room.js';
import { movePlayer, EYE } from '../dist/movement.js';
import { buildSolids } from '../dist/shared/arena.js';
import * as P from '../dist/shared/protocol.js';

const SOLIDS = buildSolids();

// Deterministic hub: a seeded LCG makes every run reproducible while still varying,
// and a controllable clock keeps timing assertions exact.
function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function hub(seed = 1) {
  let clock = 0;
  const h = new Hub({ random: seeded(seed), now: () => clock });
  h.setTime = t => { clock = t; };
  h.advanceTime = d => { clock += d; };
  return h;
}
const sink = () => ({ sent: [], send(m) { this.sent.push(JSON.parse(m)); }, close() { this.closed = true; } });

function input(seq, over = {}) {
  return P.validateInput({ seq, k: 0, yaw: 0, pitch: 0, ...over });
}
// Feeds the same input for n ticks, the way a connected client would.
function run(h, players, n, over = {}) {
  for (let i = 0; i < n; i++) {
    for (const p of [].concat(players)) h.acceptInput(p, input(p.highestSeq + 1, over));
    h.advance(1);
  }
}

test('rooms are isolated: players, snapshots and shots never cross between them', () => {
  const h = hub();
  const a = h.join('', 'Ana', sink());
  const b = h.join('', 'Ben', sink());
  assert.notEqual(a.room.code, b.room.code);
  assert.equal(a.room.size, 1);
  assert.equal(b.room.size, 1);

  const c = h.join(a.room.code, 'Cal', sink());
  assert.equal(c.ok, true);
  assert.equal(a.room.size, 2);
  assert.equal(b.room.size, 1);

  const snapA = a.room.buildSnapshot();
  assert.deepEqual(snapA.p.map(p => p.n).sort(), ['Ana', 'Cal']);
  assert.equal(b.room.buildSnapshot().p.length, 1);

  // A shot in room A cannot reach a player standing at the same coordinates in room B.
  a.player.pos = { x: 0, y: EYE, z: 20 };
  c.player.pos = { x: 0, y: EYE, z: 14 };
  b.player.pos = { x: 0, y: EYE, z: 14 };
  a.player.protectedUntil = 0; c.player.protectedUntil = 0; b.player.protectedUntil = 0;
  a.room.tryFire(a.player);
  // Shields absorb first, so damage shows in the combined pool rather than in health.
  assert.ok(c.player.shield < P.MAX_SHIELD, 'same-room target was hit');
  assert.equal(b.player.shield, P.MAX_SHIELD, 'other-room player untouched');
  assert.equal(b.player.hp, P.MAX_HEALTH, 'other-room player undamaged');
});

test('capacity is enforced at 8 and reported as a useful error', () => {
  const h = hub();
  const first = h.join('', 'P1', sink());
  for (let i = 2; i <= P.ROOM_MAX; i++) {
    assert.equal(h.join(first.room.code, 'P' + i, sink()).ok, true, `player ${i} joined`);
  }
  assert.equal(first.room.size, P.ROOM_MAX);
  const overflow = h.join(first.room.code, 'P9', sink());
  assert.equal(overflow.ok, false);
  assert.equal(overflow.code, 'ROOM_FULL');
  assert.match(overflow.message, /full/i);
});

test('invalid rooms and names are rejected without creating state', () => {
  const h = hub();
  assert.equal(h.join('ZZZZ', 'Ana', sink()).code, 'NO_ROOM');
  assert.equal(h.join('nope!', 'Ana', sink()).code, 'BAD_CODE');
  assert.equal(h.join('', '', sink()).code, 'BAD_NAME');
  assert.equal(h.join('', '   ', sink()).code, 'BAD_NAME');
  assert.equal(h.rooms.size, 0, 'no room was created by a failed join');
});

test('names are sanitized, length-capped and made unique per room', () => {
  assert.equal(P.sanitizeName('<script>Ace'), 'scriptAce');
  assert.equal(P.sanitizeName('A​B‮C'), 'ABC');
  assert.equal(P.sanitizeName('x'.repeat(40)).length, P.NAME_MAX);
  assert.equal(P.sanitizeName(42), '');

  const h = hub();
  const a = h.join('', 'Ace', sink());
  const b = h.join(a.room.code, 'Ace', sink());
  assert.notEqual(b.player.name, a.player.name, 'duplicate names are disambiguated');
});

test('the server ignores client-supplied position, health and score fields', () => {
  const h = hub();
  const { player } = h.join('', 'Ana', sink());
  const start = { ...player.pos };

  // A hostile client asserts a teleport, full health and a score, through the same
  // entry point the socket handler uses. validateInput is the trust boundary.
  const hostile = { t: 'input', seq: 1, k: 0, yaw: 0, pitch: 0, x: 999, y: 999, z: 999, hp: 9999, kills: 99 };
  const accepted = P.validateInput(hostile);
  assert.notEqual(accepted, null, 'the message itself is well formed');
  for (const field of ['x', 'y', 'z', 'hp', 'kills']) {
    assert.equal(field in accepted, false, `${field} is stripped at the boundary`);
  }

  h.acceptInput(player, accepted);
  h.advance(1);
  assert.equal(player.pos.x, start.x);
  assert.equal(player.pos.z, start.z);
  assert.equal(player.hp, P.MAX_HEALTH);
  assert.equal(player.kills, 0);
});

test('server movement reproduces the client prediction exactly', () => {
  const h = hub();
  const { player } = h.join('', 'Ana', sink());
  const mirror = { pos: { ...player.pos }, vy: player.vy, ground: player.ground };
  const keys = P.KEY.FORWARD | P.KEY.RIGHT;

  run(h, player, 90, { k: keys });
  for (let i = 0; i < 90; i++) movePlayer(mirror, P.keysFromMask(keys), 0, P.TICK_DT, SOLIDS);

  assert.ok(Math.abs(player.pos.x - mirror.pos.x) < 1e-9, 'x matches');
  assert.ok(Math.abs(player.pos.z - mirror.pos.z) < 1e-9, 'z matches');
  assert.ok(Math.abs(player.pos.y - mirror.pos.y) < 1e-9, 'y matches');
});

test('flooding inputs neither speeds up movement nor is accepted past the rate limit', () => {
  const h = hub();
  const cheat = h.join('', 'Ana', sink()).player;
  const honest = h.join('', 'Ben', sink()).player;
  // Identical open ground for both, so displacement is comparable.
  cheat.pos = { x: 0, y: EYE, z: 20 };
  honest.pos = { x: 0, y: EYE, z: 20 };
  const from = { x: 0, z: 20 };

  // The cheater queues 10 inputs per tick; the honest client sends one.
  for (let tick = 0; tick < 60; tick++) {
    for (let i = 0; i < 10; i++) h.acceptInput(cheat, input(cheat.highestSeq + 1, { k: P.KEY.FORWARD }));
    h.acceptInput(honest, input(honest.highestSeq + 1, { k: P.KEY.FORWARD }));
    h.advance(1);
  }
  const travelled = p => Math.hypot(p.pos.x - from.x, p.pos.z - from.z);
  assert.ok(travelled(honest) > 1, 'the honest client actually moved');
  assert.ok(Math.abs(travelled(cheat) - travelled(honest)) < 1e-9,
    `flooding gained ${travelled(cheat) - travelled(honest)} extra units`);

  let accepted = 0;
  for (let i = 0; i < P.MAX_INPUTS_PER_SECOND * 2; i++) {
    if (h.acceptInput(honest, input(honest.highestSeq + 1))) accepted++;
  }
  assert.ok(accepted <= P.MAX_INPUTS_PER_SECOND, 'rate limit rejects the flood');
});

test('duplicate and out-of-order input sequences are discarded', () => {
  const player = new ServerPlayer(1, 'Ana');
  player.queueInput(input(5));
  player.queueInput(input(5));
  player.queueInput(input(3));
  player.queueInput(input(6));
  assert.deepEqual(player.pending.map(i => i.seq), [5, 6]);
});

test('fire rate, ammo and reload completion are owned by the server', () => {
  const h = hub();
  const { player, room } = h.join('', 'Ana', sink());
  player.protectedUntil = 0;
  const cap = player.weapons.definition.cap;

  // Holding fire for one second yields at most the weapon's cyclic rate.
  run(h, player, P.TICK_HZ, { f: true });
  const fired = cap - player.weapons.ammo[0];
  const maximum = Math.ceil(1 / player.weapons.definition.interval) + 1;
  assert.ok(fired <= maximum, `${fired} shots in 1s is within ${maximum}`);

  // Ammo only returns when the reload actually finishes.
  const before = player.weapons.ammo[0];
  room.requestReload(player);
  run(h, player, 30);
  assert.equal(player.weapons.ammo[0], before, 'no ammo mid-reload');
  assert.ok(player.weapons.reloading);
  run(h, player, P.TICK_HZ * 2);
  assert.equal(player.weapons.ammo[0], cap, 'ammo restored on completion');
  assert.equal(player.weapons.reloading, false);
});

test('hits require line of sight: cover stops the shot', () => {
  const h = hub();
  const a = h.join('', 'Ana', sink());
  const b = h.join(a.room.code, 'Ben', sink());
  const room = a.room;
  a.player.protectedUntil = 0; b.player.protectedUntil = 0;

  // Clear lane down -Z.
  a.player.pos = { x: 0, y: EYE, z: 20 };
  b.player.pos = { x: 0, y: EYE, z: 14 };
  a.player.yaw = 0; a.player.pitch = 0;
  room.tryFire(a.player);
  const afterClear = b.player.hp + b.player.shield;
  assert.ok(afterClear < P.MAX_HEALTH + P.MAX_SHIELD, 'clear shot damages');

  // Same heading, but the relay mast now stands between them.
  b.player.hp = P.MAX_HEALTH; b.player.shield = P.MAX_SHIELD; b.player.hurtAt = -1e9;
  a.player.pos = { x: 0, y: EYE, z: 10 };
  b.player.pos = { x: 0, y: EYE, z: -10 };
  a.player.weapons.reset();
  room.tryFire(a.player);
  assert.equal(b.player.shield, P.MAX_SHIELD, 'cover absorbs the shot');
  assert.equal(b.player.hp, P.MAX_HEALTH);
});

test('shields absorb first and regenerate only after the delay', () => {
  const room = new Room('TEST', { random: seeded(7) });
  const victim = new ServerPlayer(1, 'Ben');
  room.players.set(1, victim);
  victim.protectedUntil = 0;

  room.damage(victim, 40, null);
  assert.equal(victim.shield, P.MAX_SHIELD - 40);
  assert.equal(victim.hp, P.MAX_HEALTH, 'health untouched while shields hold');

  room.damage(victim, 100, null);
  assert.equal(victim.shield, 0);
  assert.equal(victim.hp, P.MAX_HEALTH - (100 - 60), 'overflow carries into health');

  // No regeneration before the delay elapses.
  for (let i = 0; i < P.TICK_HZ * (P.SHIELD_REGEN_DELAY - 1); i++) room.step();
  assert.equal(victim.shield, 0, 'still down inside the delay window');

  for (let i = 0; i < P.TICK_HZ * 3; i++) room.step();
  assert.ok(victim.shield > 0, 'regenerates after the delay');
  assert.ok(victim.shield <= P.MAX_SHIELD, 'never exceeds the cap');
});

test('a death is scored exactly once even under simultaneous overkill', () => {
  const room = new Room('TEST', { random: seeded(7) });
  const victim = new ServerPlayer(1, 'Ben');
  const killer = new ServerPlayer(2, 'Ana');
  room.players.set(1, victim); room.players.set(2, killer);
  victim.protectedUntil = 0;

  room.damage(victim, 500, killer);
  room.damage(victim, 500, killer);
  room.kill(victim, killer, 'shot');

  assert.equal(victim.deaths, 1, 'one death');
  assert.equal(killer.kills, 1, 'one kill credited');
  assert.equal(room.events.filter(e => e.e === 'kill').length, 1, 'one kill event');
});

test('falling costs the victim a point and credits nobody', () => {
  const room = new Room('TEST', { random: seeded(7) });
  const player = new ServerPlayer(1, 'Ana');
  room.players.set(1, player);
  player.kills = 3;
  room.kill(player, null, 'fell');
  assert.equal(player.kills, 2);
  assert.equal(player.deaths, 1);
});

test('respawn restores the player after the delay with protection', () => {
  const h = hub();
  const { player, room } = h.join('', 'Ana', sink());
  player.protectedUntil = 0;
  room.kill(player, null, 'fell');
  assert.equal(player.alive, false);

  h.advance(Math.floor(P.TICK_HZ * (P.RESPAWN_SECONDS - .5)));
  assert.equal(player.alive, false, 'still down before the respawn delay');

  h.advance(P.TICK_HZ);
  assert.equal(player.alive, true, 'back after the delay');
  assert.equal(player.hp, P.MAX_HEALTH);
  assert.equal(player.shield, P.MAX_SHIELD);
  assert.equal(player.protected, true, 'spawns with protection');
});

test('spawn protection blocks damage and is forfeited by firing', () => {
  const h = hub();
  const a = h.join('', 'Ana', sink());
  const b = h.join(a.room.code, 'Ben', sink());
  a.player.pos = { x: 0, y: EYE, z: 20 };
  b.player.pos = { x: 0, y: EYE, z: 14 };
  a.player.protectedUntil = 0;

  assert.equal(b.player.protected, true);
  a.room.tryFire(a.player);
  assert.equal(b.player.hp, P.MAX_HEALTH, 'protected player takes no damage');

  b.player.pos = { x: 0, y: EYE, z: 14 };
  b.room.tryFire(b.player);
  assert.equal(b.player.protected, false, 'firing ends protection');

  a.player.weapons.reset();
  a.room.tryFire(a.player);
  assert.ok(b.player.shield < P.MAX_SHIELD, 'now vulnerable');
});

test('a match ends at the kill target, then resets scores after intermission', () => {
  const h = hub();
  const a = h.join('', 'Ana', sink());
  const b = h.join(a.room.code, 'Ben', sink());
  a.player.kills = P.KILL_TARGET;
  h.advance(1);

  assert.equal(a.room.state, 'intermission');
  assert.equal(a.room.lastResult.reason, 'target');
  assert.equal(a.room.lastResult.winner.n, 'Ana');
  assert.equal(a.room.lastResult.draw, false);

  h.advance(P.TICK_HZ * (P.INTERMISSION_SECONDS + 1));
  assert.equal(a.room.state, 'playing');
  assert.equal(a.player.kills, 0, 'scores reset');
  assert.equal(b.player.kills, 0);
  assert.ok(a.room.timeLeft > P.MATCH_SECONDS - 5, 'clock restarted');
});

test('a tie on the timer is a draw, not a win', () => {
  const h = hub();
  const a = h.join('', 'Ana', sink());
  const b = h.join(a.room.code, 'Ben', sink());
  a.player.kills = 4; b.player.kills = 4;
  a.room.timeLeft = P.TICK_DT / 2;
  h.advance(1);
  assert.equal(a.room.state, 'intermission');
  assert.equal(a.room.lastResult.reason, 'time');
  assert.equal(a.room.lastResult.draw, true);
  assert.equal(a.room.lastResult.winner, null);
});

test('malformed and hostile messages are rejected without throwing', () => {
  const cases = [
    null, undefined, 42, 'string', [], {},
    { seq: 1.5, k: 0, yaw: 0, pitch: 0 },
    { seq: -1, k: 0, yaw: 0, pitch: 0 },
    { seq: 1, k: 99, yaw: 0, pitch: 0 },
    { seq: 1, k: -1, yaw: 0, pitch: 0 },
    { seq: 1, k: 0, yaw: NaN, pitch: 0 },
    { seq: 1, k: 0, yaw: Infinity, pitch: 0 },
    { seq: 1, k: 0, yaw: 1e9, pitch: 0 },
    { seq: 1, k: 0, yaw: '0', pitch: 0 },
  ];
  for (const bad of cases) assert.equal(P.validateInput(bad), null, `rejected ${JSON.stringify(bad)}`);

  assert.equal(P.decode('{not json').t, '__malformed');
  assert.equal(P.decode('[1,2,3]').t, '__malformed');
  assert.equal(P.decode('"a string"').t, '__malformed');
  assert.equal(P.decode('{"noType":1}').t, '__malformed');
  assert.equal(P.decode('x'.repeat(P.MAX_MESSAGE_BYTES + 1)).t, '__oversize');
  assert.equal(P.decode('{"t":"input"}').t, 'input');

  // Pitch is clamped rather than rejected, so a spinning client cannot look through the floor.
  const clamped = P.validateInput({ seq: 1, k: 0, yaw: 0, pitch: 99 });
  assert.ok(clamped.pitch < Math.PI / 2 && clamped.pitch > 0);
});

test('disconnect removes the player and frees the slot', () => {
  const h = hub();
  const a = h.join('', 'Ana', sink());
  const b = h.join(a.room.code, 'Ben', sink());
  assert.equal(a.room.size, 2);

  h.leave(b.player);
  assert.equal(a.room.size, 1);
  assert.equal(a.room.buildSnapshot().p.length, 1);

  // The remaining player's match continues even though the room's creator is gone.
  h.leave(a.player);
  assert.equal(h.rooms.get(a.room.code).size, 0);
  assert.equal(h.playerCount, 0);
});

test('silent connections time out and empty rooms expire', () => {
  const h = hub();
  const connection = sink();
  const a = h.join('', 'Ana', connection);
  const code = a.room.code;

  h.advanceTime(P.TIMEOUT_SECONDS + 1);
  h.sweep();
  assert.equal(h.rooms.get(code).size, 0, 'silent player dropped');
  assert.equal(connection.closed, true, 'their socket was closed');

  h.advanceTime(P.EMPTY_ROOM_TTL + 1);
  h.sweep();
  assert.equal(h.rooms.has(code), false, 'empty room reclaimed');
});

test('the tick loop runs only while players are connected', () => {
  const h = hub();
  assert.equal(h.timer, null, 'idle before anyone joins');
  const a = h.join('', 'Ana', sink());
  assert.notEqual(h.timer, null, 'running with a player');
  h.leave(a.player);
  assert.equal(h.timer, null, 'stopped again when the last player leaves');
  h.stop();
});

test('snapshots carry the acknowledged input sequence for reconciliation', () => {
  const h = hub();
  const { player, room } = h.join('', 'Ana', sink());
  run(h, player, 5, { k: P.KEY.FORWARD });
  const snap = room.buildSnapshot();
  const me = snap.p.find(p => p.id === player.id);
  assert.equal(me.ack, player.highestSeq, 'ack reflects the last simulated input');
  assert.ok(Number.isFinite(me.x) && Number.isFinite(me.y) && Number.isFinite(me.z));
  assert.equal(typeof snap.tl, 'number');
});

test('the look vector matches the client camera convention', () => {
  const straight = forwardVector(0, 0);
  assert.ok(Math.abs(straight.x) < 1e-12 && Math.abs(straight.y) < 1e-12);
  assert.ok(Math.abs(straight.z + 1) < 1e-12, 'yaw 0 looks down -Z');

  const right = forwardVector(-Math.PI / 2, 0);
  assert.ok(Math.abs(right.x - 1) < 1e-12, 'negative yaw looks down +X');

  const up = forwardVector(0, Math.PI / 4);
  assert.ok(up.y > 0, 'positive pitch looks up');
  for (const yaw of [0, 1, -2, 3]) for (const pitch of [-1, 0, 1]) {
    const v = forwardVector(yaw, pitch);
    assert.ok(Math.abs(Math.hypot(v.x, v.y, v.z) - 1) < 1e-12, 'unit length');
  }
});

test('room code allocation never spins, even with a degenerate random source', () => {
  // A constant RNG makes every generated code identical. Allocation must fall back to a
  // deterministic walk rather than looping forever and starving the event loop.
  const h = new Hub({ random: () => .5, now: () => 0 });
  const codes = new Set();
  for (let i = 0; i < 40; i++) {
    const room = h.createRoom();
    assert.notEqual(room, null, 'a room was allocated');
    assert.equal(codes.has(room.code), false, `code ${room.code} is unique`);
    codes.add(room.code);
  }
  assert.equal(codes.size, 40);
  h.stop();
});

test('every allocated code is a valid, joinable room code', () => {
  const h = hub(99);
  for (let i = 0; i < 25; i++) {
    const room = h.createRoom();
    assert.equal(P.isRoomCode(room.code), true, `${room.code} matches the code format`);
  }
  h.stop();
});

test('broadcast delivers snapshots as single-encoded JSON frames', () => {
  const h = hub();
  const frames = [];
  const connection = { send(text) { frames.push(text); }, close() {} };
  const { room } = h.join('', 'Ana', connection);

  h.advance(P.SNAPSHOT_EVERY);
  assert.ok(frames.length >= 1, 'a snapshot was broadcast');

  // Double-encoding would parse to a string rather than an object, which is exactly
  // how a connected client ends up seeing nothing move.
  const parsed = JSON.parse(frames[0]);
  assert.equal(typeof parsed, 'object', 'frame parses to an object, not a string');
  assert.equal(parsed.t, 'snap');
  assert.ok(Array.isArray(parsed.p));
  assert.equal(parsed.p[0].n, 'Ana');
  assert.equal(room.code.length, 4);
  h.stop();
});

test('a silent client coasts briefly, then goes neutral instead of running and firing forever', () => {
  const h = hub();
  const { player } = h.join('', 'Ana', sink());
  player.protectedUntil = 0;
  player.pos = { x: 0, y: EYE, z: 20 };

  // One input holding forward and the trigger, then the client goes quiet.
  h.acceptInput(player, input(1, { k: P.KEY.FORWARD, f: true }));
  h.advance(1);
  const afterFirst = { ...player.pos };

  // Inside the grace window the input is repeated, so motion stays smooth.
  h.advance(P.INPUT_GRACE_TICKS - 2);
  assert.notEqual(player.pos.z, afterFirst.z, 'still coasting during the grace window');

  // Past the window the player stops moving and stops shooting.
  h.advance(5);
  const settled = { ...player.pos };
  const ammoAtRest = player.weapons.ammo[0];
  h.advance(P.TICK_HZ * 2);

  assert.equal(player.pos.x, settled.x, 'no drift once neutral');
  assert.equal(player.pos.z, settled.z, 'no drift once neutral');
  assert.equal(player.weapons.ammo[0], ammoAtRest, 'a stale held trigger stops firing');
  // Still present and still a target, which is what an open menu must look like.
  assert.equal(player.alive, true);
  assert.equal(h.rooms.get(player.room.code).size, 1);
});
