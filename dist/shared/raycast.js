// Renderer-free ray casting against the arena's axis-aligned boxes.
//
// The server has no Three.js, but must resolve shots against exactly the volumes
// movePlayer() collides with. These helpers take the same {minX..maxZ} bounds
// produced by buildSolids(), so cover on the client is cover on the server.

import { EYE, RADIUS } from '../movement.js';

// Standing hitbox, expressed in the same terms as the movement collider.
export const HITBOX_HALF_WIDTH = RADIUS;
export const HITBOX_HEIGHT = EYE + .12;   // a little headroom above the eye line

// Slab method. Returns the entry distance along dir, or null when there is no hit.
// dir does not need to be normalized, but distances are then in units of |dir|.
export function rayBox(ox, oy, oz, dx, dy, dz, box, maxDist = Infinity) {
  let near = 0, far = maxDist;
  const axes = [
    [ox, dx, box.minX, box.maxX],
    [oy, dy, box.minY, box.maxY],
    [oz, dz, box.minZ, box.maxZ],
  ];
  for (const [origin, delta, lo, hi] of axes) {
    if (Math.abs(delta) < 1e-12) {
      if (origin < lo || origin > hi) return null;   // parallel and outside the slab
      continue;
    }
    const inv = 1 / delta;
    let t0 = (lo - origin) * inv, t1 = (hi - origin) * inv;
    if (t0 > t1) { const swap = t0; t0 = t1; t1 = swap; }
    if (t0 > near) near = t0;
    if (t1 < far) far = t1;
    if (near > far) return null;
  }
  return near <= far ? near : null;
}

// Nearest solid along the ray, or null. Used for cover tests and shot stopping.
export function raycastSolids(origin, dir, maxDist, solids) {
  let best = null;
  for (const box of solids) {
    const t = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, box, maxDist);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}

// A player's hitbox derived from their eye position, matching the movement collider's
// footprint so you cannot be shot through a wall you are flush against.
export function playerBox(pos) {
  const feet = pos.y - EYE;
  return {
    minX: pos.x - HITBOX_HALF_WIDTH, maxX: pos.x + HITBOX_HALF_WIDTH,
    minY: feet, maxY: feet + HITBOX_HEIGHT,
    minZ: pos.z - HITBOX_HALF_WIDTH, maxZ: pos.z + HITBOX_HALF_WIDTH,
  };
}

// Resolves one hitscan pellet. Cover always wins ties, so a shot that clips a wall
// before reaching a player deals no damage.
export function resolveShot(origin, dir, maxDist, solids, targets) {
  const wall = raycastSolids(origin, dir, maxDist, solids);
  const limit = wall === null ? maxDist : wall;
  let hit = null;
  for (const target of targets) {
    const t = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, playerBox(target.pos), limit);
    if (t === null || t > limit) continue;
    if (hit === null || t < hit.distance) hit = { target, distance: t };
  }
  return { hit, wallDistance: wall, distance: hit ? hit.distance : limit };
}
