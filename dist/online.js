// Online session: owns the connection, the predicted local player, remote avatars
// and the multiplayer HUD. game.js delegates to this whenever mode === 'online'.

import { NetClient, Predictor, RemoteBuffer, shortestAngle } from './net.js';
import * as P from './shared/protocol.js';
import { EYE } from './movement.js';

const $ = id => document.getElementById(id);

// Team-independent accents, distinct in hue and in value so they read against the
// arena's grey concrete and cyan lighting.
const ACCENTS = ['#ff9a4d', '#5fd3ff', '#d2fa76', '#ff7ba8', '#b58cff', '#ffe066', '#63f2c5', '#ff5f52'];
export const accentFor = id => ACCENTS[(id - 1) % ACCENTS.length];

// A readable armored figure built from primitives: clear silhouette, obvious facing,
// and separated limbs so movement can be animated.
function buildAvatar(T, color) {
  const group = new T.Group();
  const armor = new T.MeshStandardMaterial({ color: '#5d6b72', metalness: .55, roughness: .5 });
  const accent = new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .55, metalness: .4, roughness: .45 });
  const visor = new T.MeshStandardMaterial({ color: '#0d2b33', emissive: color, emissiveIntensity: .9, metalness: .8, roughness: .2 });

  const part = (w, h, d, mat, x, y, z) => {
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  // Feet sit at y = 0; the group is positioned at the player's feet.
  const torso = part(.52, .62, .32, armor, 0, 1.06, 0);
  part(.54, .16, .34, accent, 0, 1.30, 0);                    // chest band
  const head = part(.26, .26, .26, armor, 0, 1.52, 0);
  part(.2, .1, .06, visor, 0, 1.53, .14);                     // visor, marks facing
  part(.15, .1, .12, accent, 0, 1.62, -.06);                  // rear antenna block

  const armL = part(.14, .5, .16, armor, -.34, 1.06, 0);
  const armR = part(.14, .5, .16, armor, .34, 1.06, 0);
  part(.17, .14, .19, accent, -.34, 1.30, 0);                 // shoulder pads
  part(.17, .14, .19, accent, .34, 1.30, 0);

  const legL = part(.19, .74, .2, armor, -.14, .38, 0);
  const legR = part(.19, .74, .2, armor, .14, .38, 0);

  // Carried weapon, so a distant player reads as armed and facing you.
  const gun = part(.1, .12, .5, armor, .3, 1.06, .26);

  group.userData = { armor, accent, visor, torso, head, armL, armR, legL, legR, gun };
  return group;
}

function nameplate(T, text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 34px Barlow, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(4,16,20,.9)';
  ctx.strokeText(text, 128, 34);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 34);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(1.6, .4, 1);
  sprite.position.y = 1.95;
  return sprite;
}

export class OnlineSession {
  constructor({ T, scene, solids, player, controls, notify, tone }) {
    Object.assign(this, { T, scene, solids, player, controls, notify, tone });
    this.net = null;
    this.predictor = new Predictor(solids);
    this.remotes = new RemoteBuffer();
    this.avatars = new Map();     // id -> { group, plate, data }
    this.roster = new Map();      // id -> latest authoritative fields
    this.feed = [];
    this.active = false;
    this.inputAccumulator = 0;
    this.renderClock = 0;
    this.snapshotClock = 0;
    this.state = 'playing';
    this.timeLeft = 0;
    this.intermission = 0;
    this.result = null;
    this.onStatus = () => {};
    this.onLeave = () => {};
  }

  get me() { return this.net?.id != null ? this.roster.get(this.net.id) : null; }
  get connected() { return this.net?.status === 'playing'; }

  start(name, code) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.net = new NetClient(`${protocol}//${location.host}/ws`, {
      onWelcome: msg => this.welcome(msg),
      onSnapshot: msg => this.snapshot(msg),
      onStatus: status => this.onStatus(status, null),
      onError: (errorCode, message) => this.onStatus('error', { code: errorCode, message }),
      onClose: () => { this.active = false; this.onStatus('closed', null); },
    });
    this.active = true;
    this.renderClock = 0;
    this.predictor.reset();
    this.remotes.clear();
    this.feed.length = 0;
    this.net.connect(name, code);
  }

  stop() {
    this.active = false;
    this.net?.close();
    this.net = null;
    for (const [, avatar] of this.avatars) this.disposeAvatar(avatar);
    this.avatars.clear();
    this.roster.clear();
    this.remotes.clear();
    this.predictor.reset();
    this.feed.length = 0;
    $('onlineHud')?.classList.add('hidden');
  }

  welcome(msg) {
    this.notify('DEPLOYED / ROOM ' + msg.code, 2.5);
    $('onlineHud')?.classList.remove('hidden');
    this.updateInviteUi(msg.code);
    this.onStatus('playing', { code: msg.code, name: msg.name });
  }

  updateInviteUi(code) {
    const link = `${location.origin}${location.pathname}#${code}`;
    const field = $('inviteLink');
    if (field) field.value = link;
    const label = $('roomCode');
    if (label) label.textContent = code;
  }

  // Fixed-rate input send plus immediate local prediction.
  update(dt) {
    if (!this.connected) return;
    this.renderClock += dt;
    this.inputAccumulator += dt;

    let steps = 0;
    while (this.inputAccumulator >= P.TICK_DT && steps < 5) {
      this.inputAccumulator -= P.TICK_DT;
      steps++;
      const mine = this.me;
      const firing = this.controls.firing && mine?.a !== 0;
      const input = this.net.sendInput(this.controls.keys, this.controls.yaw, this.controls.pitch, firing, this.controls.aiming);
      // Dead players send neutral input and do not move.
      if (mine?.a === 0) { this.predictor.pending.length = 0; continue; }
      this.predictor.predict(this.player, input);
    }
  }

  snapshot(msg) {
    this.snapshotClock = this.renderClock;
    this.state = msg.st;
    this.timeLeft = msg.tl;
    this.intermission = msg.im;

    const seen = new Set();
    for (const entry of msg.p) {
      seen.add(entry.id);
      this.roster.set(entry.id, entry);
      if (entry.id === this.net.id) {
        // Authority wins, then unacknowledged inputs are replayed on top.
        if (entry.a === 1) this.predictor.reconcile(this.player, entry, entry.ack);
        else { this.player.pos.x = entry.x; this.player.pos.y = entry.y; this.player.pos.z = entry.z; }
      } else {
        this.remotes.push(entry.id, entry, this.renderClock);
      }
    }
    for (const id of [...this.roster.keys()]) if (!seen.has(id)) this.dropPlayer(id);
    this.remotes.keep(seen);

    for (const event of msg.ev ?? []) this.handleEvent(event);
    this.renderHud();
  }

  dropPlayer(id) {
    this.roster.delete(id);
    this.remotes.forget(id);
    const avatar = this.avatars.get(id);
    if (avatar) { this.disposeAvatar(avatar); this.avatars.delete(id); }
  }

  handleEvent(event) {
    switch (event.e) {
      case 'join': this.pushFeed(`${event.n} joined`); return;
      case 'leave': this.pushFeed(`${event.n} left`); this.dropPlayer(event.id); return;
      case 'kill': {
        const line = event.by === null ? `${event.n} fell` : `${event.byN} eliminated ${event.n}`;
        this.pushFeed(line);
        if (event.by === this.net.id) { this.tone(560, .16, 'triangle', .13); this.notify('ELIMINATED ' + event.n, 1.2); }
        else if (event.id === this.net.id) this.notify('YOU WERE ELIMINATED', 2);
        return;
      }
      case 'hit':
        if (event.by === this.net.id) this.tone(880, .05, 'square', .08);
        if (event.id === this.net.id) this.tone(event.sh ? 300 : 420, .07, 'sine', .12);
        return;
      case 'end': {
        this.result = event;
        const text = event.draw ? 'ROUND DRAWN' : `${event.winner?.n ?? 'NOBODY'} WINS`;
        this.notify(text, 5);
        this.pushFeed(text);
        return;
      }
      case 'start': this.notify('NEW ROUND / FIGHT', 2.5); this.feed.length = 0; return;
    }
  }

  pushFeed(text) {
    this.feed.unshift({ text, at: this.renderClock });
    if (this.feed.length > 5) this.feed.pop();
  }

  // Places remote avatars at their interpolated positions and animates them.
  render(dt) {
    if (!this.connected) return;
    const T = this.T;
    for (const [id, entry] of this.roster) {
      if (id === this.net.id) continue;
      const sample = this.remotes.sample(id, this.renderClock);
      if (!sample) continue;

      let avatar = this.avatars.get(id);
      if (!avatar) {
        const group = buildAvatar(T, accentFor(id));
        const plate = nameplate(T, entry.n, accentFor(id));
        group.add(plate);
        this.scene.add(group);
        avatar = { group, plate, previous: { x: sample.x, z: sample.z }, phase: 0 };
        this.avatars.set(id, avatar);
      }

      const feetY = sample.y - EYE;
      avatar.group.position.set(sample.x, feetY, sample.z);
      avatar.group.rotation.y = sample.yaw;

      // Dead players lie down rather than vanishing, so kills read clearly.
      const dead = sample.a === 0;
      avatar.group.visible = true;
      avatar.group.rotation.x = dead ? -Math.PI / 2.2 : 0;
      avatar.group.position.y = dead ? feetY + .3 : feetY;

      // Spawn protection reads as a pulsing shell.
      const protectedNow = sample.pr === 1;
      const parts = avatar.group.userData;
      parts.accent.emissiveIntensity = protectedNow ? 1.4 + Math.sin(this.renderClock * 9) * .6 : .55;
      parts.visor.emissiveIntensity = dead ? .1 : .9;

      // Run cycle driven by actual ground speed, so animation matches movement.
      const speed = Math.hypot(sample.x - avatar.previous.x, sample.z - avatar.previous.z) / Math.max(dt, 1e-4);
      avatar.previous.x = sample.x; avatar.previous.z = sample.z;
      avatar.phase += Math.min(speed, 12) * dt * 2.4;
      const swing = dead ? 0 : Math.sin(avatar.phase) * Math.min(speed / 9, 1) * .55;
      parts.legL.rotation.x = swing;
      parts.legR.rotation.x = -swing;
      parts.armL.rotation.x = -swing * .7;
      parts.armR.rotation.x = swing * .3;
      parts.head.rotation.x = -sample.pitch * .5;
      avatar.plate.visible = !dead;
    }
  }

  disposeAvatar(avatar) {
    this.scene.remove(avatar.group);
    avatar.group.traverse(node => {
      if (node.isMesh || node.isSprite) {
        node.geometry?.dispose?.();
        const material = node.material;
        if (material) { material.map?.dispose?.(); material.dispose?.(); }
      }
    });
  }

  renderHud() {
    const standings = [...this.roster.values()].sort((a, b) => b.k - a.k || a.d - b.d);
    const board = $('scoreboard');
    if (board) {
      board.innerHTML = standings.map(entry => {
        const mine = entry.id === this.net.id ? ' class="mine"' : '';
        return `<tr${mine}><td><i style="background:${accentFor(entry.id)}"></i>${escapeHtml(entry.n)}</td><td>${entry.k}</td><td>${entry.d}</td></tr>`;
      }).join('');
    }
    const feed = $('killFeed');
    if (feed) feed.innerHTML = this.feed.map(line => `<div>${escapeHtml(line.text)}</div>`).join('');

    const clock = $('matchClock');
    if (clock) {
      if (this.state === 'intermission') clock.textContent = 'NEXT ROUND ' + this.intermission;
      else clock.textContent = `${String(Math.floor(this.timeLeft / 60)).padStart(2, '0')}:${String(this.timeLeft % 60).padStart(2, '0')}`;
    }
    const ping = $('pingValue');
    if (ping) ping.textContent = this.net.rtt + 'ms';
    const count = $('playerCount');
    if (count) count.textContent = `${this.roster.size}/${P.ROOM_MAX}`;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
