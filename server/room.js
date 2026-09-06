// Authoritative free-for-all deathmatch room.
//
// The server owns every fact a client could lie about: position, collision, health,
// shields, ammo, reload state, hit detection, deaths, respawns, scores and the clock.
// Clients send sequenced inputs and receive snapshots; nothing else is trusted.
//
// Movement, weapon timing and arena collision are the SAME modules the browser runs,
// so prediction and authority cannot drift apart by construction.

import { movePlayer, EYE } from '../dist/movement.js';
import { WeaponSystem, DEFINITIONS } from '../dist/weapons.js';
import { buildSolids, SPAWNS, KILL_FLOOR } from '../dist/shared/arena.js';
import { resolveShot } from '../dist/shared/raycast.js';
import * as P from '../dist/shared/protocol.js';

const SOLIDS = buildSolids();
const SHOT_RANGE = 110;

// Ground height under a spawn pad, so players materialize standing on it.
function groundAt(x, z) {
  let top = -Infinity;
  for (const s of SOLIDS) {
    if (x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ && s.maxY > top) top = s.maxY;
  }
  return top === -Infinity ? 0 : top;
}
const SPAWN_POINTS = SPAWNS.map(([x, z]) => ({ x, y: groundAt(x, z) + EYE, z }));

// Look direction for Three.js 'YXZ' euler order, matching the client camera exactly.
export function forwardVector(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

export class ServerPlayer {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.pos = { x: 0, y: EYE, z: 0 };
    this.vy = 0;
    this.ground = true;
    this.yaw = 0;
    this.pitch = 0;
    this.hp = P.MAX_HEALTH;
    this.shield = P.MAX_SHIELD;
    this.weapons = new WeaponSystem();
    this.alive = true;
    this.respawnAt = 0;
    this.protectedUntil = 0;
    this.kills = 0;
    this.deaths = 0;
    this.hurtAt = -1e9;
    this.pending = [];        // unprocessed inputs, oldest first
    this.lastInput = null;    // repeated briefly when the queue starves, then neutralized
    this.starved = 0;         // consecutive ticks without a fresh input
    this.ack = 0;             // highest input sequence actually simulated
    this.highestSeq = -1;     // guards replays and out-of-order duplicates
    this.dropped = 0;
    this.connected = true;
  }

  // Queues one already-validated input. Returns false when the client is flooding.
  queueInput(input) {
    if (input.seq <= this.highestSeq) return true;   // duplicate or reordered: ignore, not fatal
    this.highestSeq = input.seq;
    this.pending.push(input);
    if (this.pending.length > P.MAX_PENDING_INPUTS) {
      this.pending.splice(0, this.pending.length - P.MAX_PENDING_INPUTS);
      this.dropped++;
    }
    return true;
  }

  snapshot() {
    const w = this.weapons;
    return {
      id: this.id,
      n: this.name,
      x: round(this.pos.x), y: round(this.pos.y), z: round(this.pos.z),
      yaw: round(this.yaw), pitch: round(this.pitch),
      hp: Math.ceil(this.hp), sh: Math.ceil(this.shield),
      w: w.active,
      am: w.ammo[w.active],
      rl: w.reloading ? round(w.progress) : 0,
      a: this.alive ? 1 : 0,
      pr: this.protected ? 1 : 0,
      k: this.kills, d: this.deaths,
      ack: this.ack,
    };
  }

  get protected() { return this.protectedUntil > 0; }
}

const round = n => Math.round(n * 1000) / 1000;

export class Room {
  constructor(code, { random = Math.random, now = 0 } = {}) {
    this.code = code;
    this.players = new Map();
    this.random = random;
    this.tick = 0;
    this.clock = 0;
    this.state = 'playing';          // 'playing' | 'intermission'
    this.timeLeft = P.MATCH_SECONDS;
    this.intermission = 0;
    this.events = [];
    this.emptySince = now;
    this.lastResult = null;
  }

  get size() { return this.players.size; }
  get full() { return this.players.size >= P.ROOM_MAX; }

  add(player) {
    if (this.full) return false;
    this.players.set(player.id, player);
    this.respawn(player, true);
    this.emit({ e: 'join', id: player.id, n: player.name });
    return true;
  }

  remove(id) {
    const player = this.players.get(id);
    if (!player) return;
    this.players.delete(id);
    this.emit({ e: 'leave', id, n: player.name });
  }

  emit(event) {
    // Bounded so a pathological tick cannot grow a snapshot without limit.
    if (this.events.length < 64) this.events.push(event);
  }

  // Farthest spawn from the nearest living opponent, so players do not appear in a fight.
  pickSpawn(player) {
    let best = SPAWN_POINTS[0], bestScore = -Infinity;
    for (const point of SPAWN_POINTS) {
      let nearest = Infinity;
      for (const other of this.players.values()) {
        if (other === player || !other.alive) continue;
        const dx = other.pos.x - point.x, dz = other.pos.z - point.z;
        nearest = Math.min(nearest, Math.hypot(dx, dz));
      }
      // Break ties randomly so repeated deaths do not always return to the same pad.
      const score = (nearest === Infinity ? 1e3 : nearest) + this.random() * 4;
      if (score > bestScore) { bestScore = score; best = point; }
    }
    return best;
  }

  respawn(player, initial = false) {
    const point = this.pickSpawn(player);
    player.pos = { x: point.x, y: point.y, z: point.z };
    player.vy = 0;
    player.ground = true;
    player.hp = P.MAX_HEALTH;
    player.shield = P.MAX_SHIELD;
    player.alive = true;
    player.respawnAt = 0;
    player.protectedUntil = this.clock + P.SPAWN_PROTECT_SECONDS;
    player.hurtAt = -1e9;
    player.weapons.reset();
    if (!initial) this.emit({ e: 'spawn', id: player.id, x: round(point.x), y: round(point.y), z: round(point.z) });
  }

  // One fixed simulation step. dt is always P.TICK_DT.
  step(dt = P.TICK_DT) {
    this.tick++;
    this.clock += dt;

    if (this.state === 'intermission') {
      this.intermission -= dt;
      if (this.intermission <= 0) this.startMatch();
      return;
    }

    for (const player of this.players.values()) this.stepPlayer(player, dt);

    this.timeLeft -= dt;
    const leader = this.leader();
    if (leader && leader.kills >= P.KILL_TARGET) this.endMatch('target');
    else if (this.timeLeft <= 0) this.endMatch('time');
  }

  stepPlayer(player, dt) {
    // Exactly one input per tick caps movement at the tick rate, so flooding gains
    // nothing. A brief stall repeats the last input so packet loss does not stutter,
    // but only for a grace window: beyond that the player goes neutral rather than
    // running and firing forever on a stale input. They stay in the world and stay
    // killable, which is also what an open menu must look like to everyone else.
    let input;
    if (player.pending.length) {
      input = player.pending.shift();
      player.starved = 0;
    } else if (player.lastInput) {
      player.starved++;
      input = player.starved <= P.INPUT_GRACE_TICKS
        ? player.lastInput
        : { ...player.lastInput, k: 0, fire: false };
    }
    if (input) {
      player.lastInput = player.pending.length || player.starved === 0 ? input : player.lastInput;
      player.ack = input.seq;
      player.yaw = input.yaw;
      player.pitch = input.pitch;
    }

    if (!player.alive) {
      if (this.clock >= player.respawnAt) this.respawn(player);
      return;
    }

    if (player.protectedUntil > 0 && this.clock >= player.protectedUntil) player.protectedUntil = 0;

    if (input) {
      movePlayer(player, P.keysFromMask(input.k), player.yaw, dt, SOLIDS);
      if (player.pos.y < KILL_FLOOR) { this.kill(player, null, 'fell'); return; }
    }

    player.weapons.tick(dt);
    if (input?.fire) this.tryFire(player);

    if (this.clock - player.hurtAt > P.SHIELD_REGEN_DELAY) {
      player.shield = Math.min(P.MAX_SHIELD, player.shield + P.SHIELD_REGEN_RATE * dt);
    }
  }

  requestReload(player) { if (player.alive) player.weapons.reload(); }
  requestWeapon(player, index) { if (player.alive) player.weapons.switchTo(index); }

  tryFire(shooter) {
    const weapon = shooter.weapons.definition;
    if (!shooter.weapons.fire()) return;   // owns ammo, cooldown and reload gating

    // Firing forfeits spawn protection.
    shooter.protectedUntil = 0;

    const origin = { x: shooter.pos.x, y: shooter.pos.y, z: shooter.pos.z };
    const targets = [];
    for (const other of this.players.values()) {
      if (other !== shooter && other.alive && !other.protected) targets.push(other);
    }

    const base = forwardVector(shooter.yaw, shooter.pitch);
    const damaged = new Map();
    for (let pellet = 0; pellet < weapon.pellets; pellet++) {
      // Spread is rolled on the server; a client cannot narrow its own cone.
      const dir = spread(base, weapon.spread, this.random);
      const { hit } = resolveShot(origin, dir, SHOT_RANGE, SOLIDS, targets);
      if (!hit) continue;
      const falloff = weapon.pellets > 1 ? Math.max(.2, 1 - hit.distance / 35) : 1;
      damaged.set(hit.target, (damaged.get(hit.target) ?? 0) + weapon.damage * falloff);
    }

    this.emit({ e: 'shot', id: shooter.id, w: shooter.weapons.active });
    for (const [victim, amount] of damaged) this.damage(victim, amount, shooter);
  }

  damage(victim, amount, attacker) {
    if (!victim.alive || victim.protected) return;
    victim.hurtAt = this.clock;
    const absorbed = Math.min(victim.shield, amount);
    victim.shield -= absorbed;
    victim.hp -= amount - absorbed;
    this.emit({ e: 'hit', id: victim.id, by: attacker?.id ?? null, sh: absorbed > 0 ? 1 : 0 });
    if (victim.hp <= 0) this.kill(victim, attacker, 'shot');
  }

  kill(victim, attacker, cause) {
    if (!victim.alive) return;   // deaths are scored exactly once
    victim.alive = false;
    victim.hp = 0;
    victim.shield = 0;
    victim.deaths++;
    victim.respawnAt = this.clock + P.RESPAWN_SECONDS;
    victim.weapons.action = null;
    // A kill credits the attacker; falling or shooting yourself costs you one.
    if (attacker && attacker !== victim) attacker.kills++;
    else victim.kills = Math.max(0, victim.kills - 1);
    this.emit({
      e: 'kill', id: victim.id, n: victim.name,
      by: attacker?.id ?? null, byN: attacker?.name ?? null, c: cause,
    });
  }

  leader() {
    let best = null;
    for (const player of this.players.values()) if (!best || player.kills > best.kills) best = player;
    return best;
  }

  endMatch(reason) {
    const standings = [...this.players.values()]
      .map(p => ({ id: p.id, n: p.name, k: p.kills, d: p.deaths }))
      .sort((a, b) => b.k - a.k || a.d - b.d);
    const top = standings[0];
    const draw = reason === 'time' && standings.filter(s => s.k === top?.k).length > 1;
    this.lastResult = { reason, draw, standings, winner: draw ? null : (top ?? null) };
    this.state = 'intermission';
    this.intermission = P.INTERMISSION_SECONDS;
    this.emit({ e: 'end', ...this.lastResult });
  }

  startMatch() {
    this.state = 'playing';
    this.timeLeft = P.MATCH_SECONDS;
    for (const player of this.players.values()) {
      player.kills = 0;
      player.deaths = 0;
      this.respawn(player, true);
    }
    this.emit({ e: 'start' });
  }

  buildSnapshot() {
    const snap = {
      t: 'snap',
      k: this.tick,
      st: this.state,
      tl: Math.max(0, Math.round(this.timeLeft)),
      im: this.state === 'intermission' ? Math.max(0, Math.ceil(this.intermission)) : 0,
      p: [...this.players.values()].map(p => p.snapshot()),
      ev: this.events,
    };
    this.events = [];
    return snap;
  }
}

// Cone spread around a normalized forward vector, using two perpendicular axes.
function spread(forward, amount, random) {
  if (!amount) return forward;
  // Any vector not parallel to forward works as a seed for the tangent basis.
  const seed = Math.abs(forward.y) < .9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const rx = forward.y * seed.z - forward.z * seed.y;
  const ry = forward.z * seed.x - forward.x * seed.z;
  const rz = forward.x * seed.y - forward.y * seed.x;
  const rl = Math.hypot(rx, ry, rz) || 1;
  const ux = rx / rl, uy = ry / rl, uz = rz / rl;
  const vx = forward.y * uz - forward.z * uy;
  const vy = forward.z * ux - forward.x * uz;
  const vz = forward.x * uy - forward.y * ux;
  const a = (random() - .5) * amount, b = (random() - .5) * amount;
  const x = forward.x + ux * a + vx * b;
  const y = forward.y + uy * a + vy * b;
  const z = forward.z + uz * a + vz * b;
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

export { SOLIDS, SPAWN_POINTS, DEFINITIONS };
