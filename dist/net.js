// Client networking: transport, local prediction and remote interpolation.
// Renderer-free on purpose, so it can be exercised without a browser.

import { movePlayer } from './movement.js';
import * as P from './shared/protocol.js';

export class NetClient {
  constructor(url, handlers = {}) {
    this.url = url;
    this.handlers = handlers;
    this.socket = null;
    this.status = 'idle';    // idle | connecting | joining | playing | closed | error
    this.id = null;
    this.code = null;
    this.name = null;
    this.rules = null;
    this.seq = 0;
    this.rtt = 0;
    this.pingSentAt = 0;
    this.pingTimer = null;
  }

  connect(name, code) {
    this.close();
    this.status = 'connecting';
    this.handlers.onStatus?.(this.status);
    let socket;
    try { socket = new WebSocket(this.url); }
    catch { this.fail('Could not open a connection.'); return; }
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.status = 'joining';
      this.handlers.onStatus?.(this.status);
      this.send({ t: 'join', name, room: code || '' });
      this.pingTimer = setInterval(() => {
        this.pingSentAt = performance.now();
        this.send({ t: 'ping', s: this.pingSentAt });
      }, 2000);
    });

    socket.addEventListener('message', event => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      this.receive(msg);
    });

    socket.addEventListener('error', () => this.fail('Connection error.'));
    socket.addEventListener('close', event => {
      this.stopPing();
      if (this.status !== 'error') {
        this.status = 'closed';
        this.handlers.onClose?.(event.code, event.reason);
        this.handlers.onStatus?.(this.status);
      }
    });
  }

  receive(msg) {
    switch (msg.t) {
      case 'welcome':
        this.id = msg.id;
        this.code = msg.code;
        this.name = msg.name;
        this.rules = msg.rules;
        this.status = 'playing';
        this.handlers.onWelcome?.(msg);
        this.handlers.onStatus?.(this.status);
        return;
      case 'snap':
        this.handlers.onSnapshot?.(msg);
        return;
      case 'pong':
        if (typeof msg.s === 'number') this.rtt = Math.round(performance.now() - msg.s);
        return;
      case 'error':
        this.handlers.onError?.(msg.code, msg.message);
        return;
    }
  }

  fail(message) {
    this.status = 'error';
    this.stopPing();
    this.handlers.onError?.('SOCKET', message);
    this.handlers.onStatus?.(this.status);
  }

  send(payload) {
    if (this.socket?.readyState !== 1) return false;
    try { this.socket.send(JSON.stringify(payload)); return true; }
    catch { return false; }
  }

  // Returns the input that was sent, so the predictor can queue it for replay.
  sendInput(keys, yaw, pitch, firing, aiming) {
    const input = {
      seq: ++this.seq,
      k: P.maskFromKeys(keys),
      yaw: +yaw.toFixed(4),
      pitch: +pitch.toFixed(4),
      f: !!firing,
      a: !!aiming,
    };
    this.send({ t: 'input', ...input });
    return input;
  }

  reload() { this.send({ t: 'reload' }); }
  weapon(index) { this.send({ t: 'weapon', i: index }); }

  stopPing() { if (this.pingTimer) clearInterval(this.pingTimer); this.pingTimer = null; }

  close() {
    this.stopPing();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState <= 1) { try { socket.close(1000, 'client left'); } catch { /* already closing */ } }
  }
}

// Local prediction with server reconciliation.
//
// Inputs are applied immediately so the player never waits a round trip, kept until
// the server acknowledges them, and replayed on top of authoritative state when a
// snapshot arrives. Because this runs the SAME movePlayer as the server, a correct
// prediction reconciles to a zero-length correction.
export class Predictor {
  constructor(solids) {
    this.solids = solids;
    this.pending = [];
    this.corrections = 0;
    this.lastError = 0;
  }

  // Applies one input locally and remembers it for replay.
  predict(player, input, dt = P.TICK_DT) {
    movePlayer(player, P.keysFromMask(input.k), input.yaw, dt, this.solids);
    this.pending.push({ ...input });
    if (this.pending.length > P.MAX_PENDING_INPUTS) this.pending.shift();
  }

  // Snaps to authority, then replays everything the server has not seen yet.
  reconcile(player, authoritative, ack, dt = P.TICK_DT) {
    const before = { x: player.pos.x, y: player.pos.y, z: player.pos.z };

    player.pos.x = authoritative.x;
    player.pos.y = authoritative.y;
    player.pos.z = authoritative.z;
    if (typeof authoritative.vy === 'number') player.vy = authoritative.vy;
    if (typeof authoritative.ground === 'boolean') player.ground = authoritative.ground;

    this.pending = this.pending.filter(input => input.seq > ack);
    for (const input of this.pending) {
      movePlayer(player, P.keysFromMask(input.k), input.yaw, dt, this.solids);
    }

    this.lastError = Math.hypot(player.pos.x - before.x, player.pos.y - before.y, player.pos.z - before.z);
    if (this.lastError > .01) this.corrections++;
    return this.lastError;
  }

  reset() { this.pending.length = 0; this.corrections = 0; this.lastError = 0; }
}

// Buffers remote player states and plays them back slightly in the past, so motion
// between 20 Hz snapshots is smooth instead of stepped.
export class RemoteBuffer {
  constructor(delaySeconds = 2 / P.SNAPSHOT_HZ) {
    this.delay = delaySeconds;
    this.states = new Map();   // id -> [{ time, ...fields }]
  }

  push(id, state, time) {
    let track = this.states.get(id);
    if (!track) { track = []; this.states.set(id, track); }
    track.push({ ...state, time });
    // Two seconds of history is far more than interpolation needs.
    while (track.length > 2 && track[0].time < time - 2) track.shift();
  }

  forget(id) { this.states.delete(id); }
  keep(ids) { for (const id of [...this.states.keys()]) if (!ids.has(id)) this.states.delete(id); }

  // Position/orientation at the delayed render time, or null when nothing is buffered.
  sample(id, now) {
    const track = this.states.get(id);
    if (!track || !track.length) return null;
    const target = now - this.delay;

    if (track.length === 1 || target <= track[0].time) return { ...track[0], extrapolated: false };
    const last = track[track.length - 1];
    if (target >= last.time) return { ...last, extrapolated: true };

    for (let i = track.length - 1; i > 0; i--) {
      const b = track[i], a = track[i - 1];
      if (target >= a.time && target <= b.time) {
        const span = b.time - a.time;
        const t = span > 1e-6 ? (target - a.time) / span : 1;
        return {
          ...b,
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: a.z + (b.z - a.z) * t,
          yaw: a.yaw + shortestAngle(a.yaw, b.yaw) * t,
          pitch: a.pitch + (b.pitch - a.pitch) * t,
          extrapolated: false,
        };
      }
    }
    return { ...last, extrapolated: true };
  }

  clear() { this.states.clear(); }
}

// Interpolating yaw the short way round stops a 359 -> 1 degree step spinning the model.
export function shortestAngle(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}
