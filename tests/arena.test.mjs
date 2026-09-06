import test from 'node:test';
import assert from 'node:assert/strict';
import { BOXES, buildSolids, SPAWNS, KILL_FLOOR } from '../dist/shared/arena.js';
import { movePlayer, EYE } from '../dist/movement.js';

const solids = buildSolids();

test('arena definition is finite, non-degenerate and renderer-free', () => {
  assert.equal(BOXES.length, 120);
  for (const b of BOXES) {
    for (const k of ['x', 'y', 'z', 'w', 'h', 'd']) assert.ok(Number.isFinite(b[k]), `${k} finite`);
    assert.ok(b.w > 0 && b.h > 0 && b.d > 0, 'positive extents');
    assert.equal(typeof b.mat, 'string', 'material is a name, not a renderer object');
  }
});

test('collision bounds are derived from the drawn boxes, never authored separately', () => {
  assert.equal(solids.length, 49);
  for (const b of BOXES.filter(x => x.solid)) {
    const match = solids.find(s =>
      Math.abs(s.minX - (b.x - b.w / 2)) < 1e-12 && Math.abs(s.maxX - (b.x + b.w / 2)) < 1e-12 &&
      Math.abs(s.minY - (b.y - b.h / 2)) < 1e-12 && Math.abs(s.maxY - (b.y + b.h / 2)) < 1e-12 &&
      Math.abs(s.minZ - (b.z - b.d / 2)) < 1e-12 && Math.abs(s.maxZ - (b.z + b.d / 2)) < 1e-12);
    assert.ok(match, `solid box at ${b.x},${b.y},${b.z} has matching bounds`);
  }
  for (const s of solids) assert.ok(s.maxX > s.minX && s.maxY > s.minY && s.maxZ > s.minZ);
});

test('every spawn point is on solid ground, inside the arena and not inside cover', () => {
  assert.equal(SPAWNS.length, 8);
  for (const [x, z] of SPAWNS) {
    assert.ok(Math.abs(x) < 30 && Math.abs(z) < 30, `spawn ${x},${z} inside perimeter`);
    const floor = solids
      .filter(s => x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ)
      .reduce((top, s) => Math.max(top, s.maxY), -Infinity);
    assert.ok(floor > -Infinity, `spawn ${x},${z} has ground beneath it`);
    // Nothing solid may occupy the standing volume above that ground.
    const blocked = solids.some(s =>
      x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ &&
      s.minY < floor + EYE - 1e-9 && s.maxY > floor + 1e-9);
    assert.ok(!blocked, `spawn ${x},${z} is not inside geometry`);
  }
});

test('a player dropped at each spawn settles on the ground and stays inside the arena', () => {
  for (const [x, z] of SPAWNS) {
    const p = { pos: { x, y: 12, z }, vy: 0, ground: false };
    for (let i = 0; i < 480; i++) movePlayer(p, new Set(), 0, 1 / 120, solids);
    assert.ok(p.ground, `settled at ${x},${z}`);
    assert.ok(p.pos.y > KILL_FLOOR, `did not fall through the floor at ${x},${z}`);
    assert.ok(Math.abs(p.pos.x - x) < 1e-9 && Math.abs(p.pos.z - z) < 1e-9, 'no lateral drift');
  }
});

test('the perimeter contains a sprinting player on every heading', () => {
  for (const keys of [['KeyW'], ['KeyS'], ['KeyA'], ['KeyD']]) {
    const p = { pos: { x: 0, y: EYE, z: 0 }, vy: 0, ground: true };
    for (let i = 0; i < 1200; i++) movePlayer(p, new Set([...keys, 'ShiftLeft']), 0, 1 / 120, solids);
    assert.ok(Math.abs(p.pos.x) < 32 && Math.abs(p.pos.z) < 32, `contained running ${keys}`);
  }
});
