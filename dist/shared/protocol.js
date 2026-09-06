// Wire protocol and match rules shared by the browser client and the authoritative server.
// No renderer and no Node APIs, so both sides import this file unchanged.

export const PROTOCOL_VERSION = 1;

// Simulation and networking rates.
export const TICK_HZ = 60;
export const TICK_DT = 1 / TICK_HZ;
export const SNAPSHOT_HZ = 20;
export const SNAPSHOT_EVERY = TICK_HZ / SNAPSHOT_HZ;   // ticks between snapshots

// Match rules.
export const ROOM_MIN = 2;
export const ROOM_MAX = 8;
export const KILL_TARGET = 15;
export const MATCH_SECONDS = 8 * 60;
export const RESPAWN_SECONDS = 3;
export const SPAWN_PROTECT_SECONDS = 2.5;
export const INTERMISSION_SECONDS = 8;
export const MAX_HEALTH = 100;
export const MAX_SHIELD = 100;
export const SHIELD_REGEN_DELAY = 5;
export const SHIELD_REGEN_RATE = 24;   // points per second
export const EMPTY_ROOM_TTL = 60;      // seconds an empty room is kept before expiry

// Abuse limits. A client that exceeds these is dropped rather than trusted.
export const MAX_MESSAGE_BYTES = 1024;
export const MAX_INPUTS_PER_SECOND = 150;   // generous headroom over TICK_HZ
export const MAX_PENDING_INPUTS = 180;      // ~3s of backlog, then the oldest are dropped
export const INPUT_GRACE_TICKS = 30;        // repeat the last input for 0.5s, then go neutral
export const HEARTBEAT_SECONDS = 5;
export const TIMEOUT_SECONDS = 15;
export const NAME_MAX = 16;

// Key bitmask carried in every input.
export const KEY = Object.freeze({ FORWARD: 1, LEFT: 2, BACK: 4, RIGHT: 8, JUMP: 16, SPRINT: 32 });

// movePlayer() consumes a Set of KeyboardEvent codes; this is the bridge.
const CODES = [
  [KEY.FORWARD, 'KeyW'], [KEY.LEFT, 'KeyA'], [KEY.BACK, 'KeyS'],
  [KEY.RIGHT, 'KeyD'], [KEY.JUMP, 'Space'], [KEY.SPRINT, 'ShiftLeft'],
];
export function keysFromMask(mask) {
  const set = new Set();
  for (const [bit, code] of CODES) if (mask & bit) set.add(code);
  return set;
}
export function maskFromKeys(keys) {
  let mask = 0;
  for (const [bit, code] of CODES) if (keys.has(code)) mask |= bit;
  if (keys.has('ShiftRight')) mask |= KEY.SPRINT;
  return mask;
}

// Room codes avoid vowels and lookalike glyphs so they survive being read aloud.
const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ23456789';
export function makeRoomCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}
// Deterministic enumeration of the code space, used as a non-spinning fallback when
// random allocation keeps colliding.
export const CODE_SPACE = CODE_ALPHABET.length ** 4;
export function codeFromIndex(index) {
  let n = ((index % CODE_SPACE) + CODE_SPACE) % CODE_SPACE, code = '';
  for (let i = 0; i < 4; i++) { code = CODE_ALPHABET[n % CODE_ALPHABET.length] + code; n = Math.floor(n / CODE_ALPHABET.length); }
  return code;
}

export function isRoomCode(value) {
  return typeof value === 'string' && /^[BCDFGHJKLMNPQRSTVWXZ23456789]{4}$/.test(value.toUpperCase());
}

// Display names are shown to other players, so strip anything usable to impersonate,
// inject markup, or blow out the scoreboard layout. Invisible and bidirectional
// characters go first, since they can hide one name inside another. Built from
// escape sequences so the source file itself stays free of invisible characters.
const INVISIBLE = new RegExp(
  '[\\u0000-\\u001f\\u007f-\\u009f\\u00ad\\u061c\\u180e' +
  '\\u200b-\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2060-\\u2064\\u2066-\\u206f\\ufeff]',
  'g');

export function sanitizeName(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(INVISIBLE, '')
    .replace(/[<>&"'`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

const finite = n => typeof n === 'number' && Number.isFinite(n);
const angle = n => finite(n) && Math.abs(n) <= 1e4;

// Returns a normalized input, or null if the message is malformed. Callers must
// treat null as "drop this message"; it must never throw on hostile input.
export function validateInput(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const { seq, k, yaw, pitch } = msg;
  if (!Number.isInteger(seq) || seq < 0 || seq > 2 ** 31) return null;
  if (!Number.isInteger(k) || k < 0 || k > 63) return null;
  if (!angle(yaw) || !angle(pitch)) return null;
  return {
    seq,
    k,
    // Wrapping yaw keeps replay identical regardless of how far the client has spun.
    yaw: ((yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI,
    pitch: Math.max(-Math.PI * .485, Math.min(Math.PI * .485, pitch)),
    fire: msg.f === true,
    aim: msg.a === true,
  };
}

// Parses one raw WebSocket frame. Never throws.
export function decode(raw, byteLength) {
  const size = byteLength ?? (typeof raw === 'string' ? raw.length : raw?.byteLength ?? 0);
  if (size > MAX_MESSAGE_BYTES) return { t: '__oversize' };
  let msg;
  try { msg = JSON.parse(typeof raw === 'string' ? raw : String(raw)); }
  catch { return { t: '__malformed' }; }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return { t: '__malformed' };
  if (typeof msg.t !== 'string' || msg.t.length > 24) return { t: '__malformed' };
  return msg;
}
