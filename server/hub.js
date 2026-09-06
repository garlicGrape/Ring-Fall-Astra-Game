// Room registry, connection lifecycle and the fixed-timestep driver.
//
// Deliberately free of any WebSocket import: a connection is just an object with a
// send(text) and close(code, reason). That keeps the whole thing testable without
// opening a socket, and keeps transport concerns in server.mjs.
//
// CONTRACT: connection.send() receives an ALREADY-SERIALIZED string. Snapshots are
// stringified once per room and shared across its players, so a transport that
// stringifies again would double-encode every frame.

import { Room, ServerPlayer } from './room.js';
import * as P from '../dist/shared/protocol.js';

export class Hub {
  constructor({ random = Math.random, now = () => Date.now() / 1000 } = {}) {
    this.rooms = new Map();
    this.random = random;
    this.now = now;
    this.nextId = 1;
    this.timer = null;
    this.lastTickAt = 0;
    this.accumulator = 0;
    this.ticksRun = 0;
  }

  get playerCount() {
    let total = 0;
    for (const room of this.rooms.values()) total += room.size;
    return total;
  }

  // Never spins. A degenerate RNG, or a genuinely crowded code space, falls back to a
  // deterministic walk instead of looping until the event loop starves.
  allocateCode() {
    for (let attempt = 0; attempt < 64; attempt++) {
      const code = P.makeRoomCode(this.random);
      if (!this.rooms.has(code)) return code;
    }
    for (let index = 0; index < P.CODE_SPACE; index++) {
      const code = P.codeFromIndex(index);
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }

  createRoom() {
    const code = this.allocateCode();
    if (code === null) return null;
    const room = new Room(code, { random: this.random, now: this.now() });
    this.rooms.set(code, room);
    return room;
  }

  // Returns { ok: true, player, room } or { ok: false, code, message }.
  join(rawCode, rawName, connection) {
    const name = P.sanitizeName(rawName);
    if (!name) return { ok: false, code: 'BAD_NAME', message: 'Enter a display name.' };

    let room;
    if (rawCode === '' || rawCode == null) {
      room = this.createRoom();
      if (!room) return { ok: false, code: 'NO_CAPACITY', message: 'The server is out of room codes.' };
    } else {
      if (!P.isRoomCode(rawCode)) {
        return { ok: false, code: 'BAD_CODE', message: 'Room codes are four characters.' };
      }
      room = this.rooms.get(String(rawCode).toUpperCase());
      if (!room) return { ok: false, code: 'NO_ROOM', message: 'No room with that code. Check it, or create one.' };
      if (room.full) return { ok: false, code: 'ROOM_FULL', message: `That room is full (${P.ROOM_MAX} players).` };
    }

    // Names are per-room unique so the scoreboard and kill feed stay readable.
    const taken = new Set([...room.players.values()].map(p => p.name.toLowerCase()));
    let unique = name, suffix = 2;
    while (taken.has(unique.toLowerCase())) unique = `${name.slice(0, P.NAME_MAX - 2)}${suffix++}`;

    const player = new ServerPlayer(this.nextId++, unique);
    player.connection = connection;
    player.room = room;
    player.lastSeenAt = this.now();
    player.inputWindowStart = this.now();
    player.inputsThisWindow = 0;
    room.add(player);
    this.ensureRunning();
    return { ok: true, player, room };
  }

  leave(player) {
    const room = player?.room;
    if (!room) return;
    room.remove(player.id);
    player.room = null;
    if (room.size === 0) room.emptySince = this.now();
    this.ensureRunning();
  }

  // Rate limit: returns false when the client is sending inputs faster than allowed.
  acceptInput(player, input) {
    const now = this.now();
    if (now - player.inputWindowStart >= 1) {
      player.inputWindowStart = now;
      player.inputsThisWindow = 0;
    }
    if (++player.inputsThisWindow > P.MAX_INPUTS_PER_SECOND) return false;
    player.lastSeenAt = now;
    player.queueInput(input);
    return true;
  }

  // Empty rooms are reclaimed, and silent connections are dropped.
  sweep() {
    const now = this.now();
    for (const [code, room] of this.rooms) {
      for (const player of [...room.players.values()]) {
        if (now - player.lastSeenAt > P.TIMEOUT_SECONDS) {
          try { player.connection?.close(4000, 'timeout'); } catch { /* already gone */ }
          this.leave(player);
        }
      }
      if (room.size === 0 && now - room.emptySince > P.EMPTY_ROOM_TTL) this.rooms.delete(code);
    }
  }

  broadcast(room) {
    const snapshot = JSON.stringify(room.buildSnapshot());
    for (const player of room.players.values()) {
      try { player.connection?.send(snapshot); } catch { /* dropped next sweep */ }
    }
  }

  // Advances every occupied room. Called by the driver, and directly by tests.
  advance(steps = 1) {
    for (let i = 0; i < steps; i++) {
      this.ticksRun++;
      for (const room of this.rooms.values()) {
        if (room.size === 0) continue;
        room.step(P.TICK_DT);
        if (this.ticksRun % P.SNAPSHOT_EVERY === 0) this.broadcast(room);
      }
    }
  }

  // The loop runs ONLY while someone is connected. An idle server burns no CPU, which
  // matters directly on per-second-metered hosts.
  ensureRunning() {
    const wanted = this.playerCount > 0;
    if (wanted && !this.timer) {
      this.lastTickAt = this.now();
      this.accumulator = 0;
      this.timer = setInterval(() => this.drive(), 1000 / P.TICK_HZ);
      if (this.timer.unref) this.timer.unref();
    } else if (!wanted && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  drive() {
    const now = this.now();
    // Clamp so a suspended process does not replay minutes of simulation at once.
    this.accumulator += Math.min(now - this.lastTickAt, .25);
    this.lastTickAt = now;
    let steps = 0;
    while (this.accumulator >= P.TICK_DT && steps < 8) {
      this.accumulator -= P.TICK_DT;
      steps++;
    }
    if (steps) this.advance(steps);
    this.sweep();
    this.ensureRunning();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
