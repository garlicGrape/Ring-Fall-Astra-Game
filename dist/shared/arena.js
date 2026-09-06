// Single source of truth for Relay Station geometry.
//
// This module must never import a renderer. The browser turns these specs into
// meshes; the authoritative server turns the same specs into collision boxes and
// raycast targets. Visual geometry and collision therefore cannot drift apart,
// and server-side hit detection uses exactly the volumes the player sees.
//
// A spec is [x, y, z, width, height, depth, material, solid].
// Position is the CENTRE of the box, matching Three.js BoxGeometry.

export const ARENA_SIZE = 64;      // playable floor extent
export const WALL_LIMIT = 30;      // drone/AI clamp inside the perimeter
export const KILL_FLOOR = -20;     // below this the player is dead

const specs = [];
const box = (x, y, z, w, h, d, mat, solid = false) => {
  specs.push({ x, y, z, w, h, d, mat, solid });
};

// Ground plate and its inlaid grid trim.
box(0, -.6, 0, 64, 1.2, 64, 'floor', true);
for (let i = -30; i <= 30; i += 4) {
  box(i, .012, 0, .035, .024, 63, 'trim');
  box(0, .015, i, 63, .024, .035, 'trim');
}

for (const s of [-1, 1]) {
  // Perimeter walls with cyan navigation strips.
  box(s * 32, 1.3, 0, 1.4, 2.6, 65, 'dark', true);
  box(0, 1.3, s * 32, 65, 2.6, 1.4, 'dark', true);
  box(s * 31.2, 2.65, 0, .12, .1, 62, 'cyan');
  box(0, 2.65, s * 31.2, 62, .1, .12, 'cyan');

  // Side platforms, reached by low jumpable steps at both ends.
  box(s * 23, 1.5, 0, 11, 3, 30, 'dark', true);
  box(s * 23, 3.03, 0, 11, .08, 30, 'floor');
  for (let n = 0; n < 6; n++) {
    box(s * 23, (n + 1) * .25, 18.5 - n, 7, (n + 1) * .5, 1, 'wall', true);
    box(s * 23, (n + 1) * .25, -18.5 + n, 7, (n + 1) * .5, 1, 'wall', true);
  }
  box(s * 23, 3.1, 0, .1, .08, 27, 'cyan');

  // Upper cover on the platforms.
  for (const z of [-12, 12]) {
    box(s * 23, 4, z, 4, 2, 1.5, 'wall', true);
    box(s * 23, 5.03, z, 4, .06, 1.6, 'orange');
  }

  // Corner bunkers.
  for (const z of [-25, 25]) {
    box(s * 12, 1.25, z, 5, 2.5, 3, 'wall', true);
    box(s * 12, 2.55, z, 5, .1, 3, 'dark');
    box(s * 12 - 2.55, 1, z, .08, 1.4, 1.5, 'orange');
  }

  // Mid-field cover flanking the relay core.
  box(s * 8, 1.1, 5 * s, 4, 2.2, 7, 'wall', true);
  box(s * 8, 2.23, 5 * s, 4, .06, 7, 'dark');
  box(s * 8, 1.6, 5 * s + 3.52, 2.5, .12, .08, 'cyan');
}

// Lane markings at the platform approaches.
for (const x of [-23, 23]) {
  box(x, .02, 24, 6, .03, .18, 'orange');
  box(x, .02, -24, 6, .03, .18, 'orange');
}

// Relay core: plinth, mast, fins and cap.
box(0, .6, 0, 7, 1.2, 7, 'dark', true);
box(0, 1.22, 0, 6.7, .06, 6.7, 'trim');
box(0, 5.5, 0, 2.4, 8.6, 2.4, 'dark', true);
for (const s of [-1, 1]) {
  box(s * 1.23, 5.5, 0, .06, 7.3, .5, 'cyan');
  box(0, 5.5, s * 1.23, .5, 7.3, .06, 'cyan');
  box(s * 3, 2.7, 0, .65, 3, 5, 'wall', true);
}
box(0, 11.2, 0, 4, .65, 4, 'dark');

// Distant sea plate, far below the arena. Decorative, never collided with.
box(0, -18, 0, 500, 1, 500, 'abyss');

// Corner pylons.
for (const x of [-28, 28]) for (const z of [-28, 28]) {
  box(x, 5, z, 1, 10, 1, 'dark', true);
  box(x, 9.7, z, 1.15, .4, 1.15, 'cyan');
}

export const BOXES = Object.freeze(specs.map(Object.freeze));

// Axis-aligned bounds consumed by movePlayer() and by server-side raycasts.
export function buildSolids() {
  return BOXES.filter(b => b.solid).map(b => ({
    minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
    minY: b.y - b.h / 2, maxY: b.y + b.h / 2,
    minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
  }));
}

// Deathmatch spawn points, spread across the arena and both platforms.
export const SPAWNS = Object.freeze([
  [-15, -23], [15, -23], [-15, 12], [15, 12],
  [0, -24], [26, 5], [-26, -5], [10, 22],
].map(Object.freeze));
