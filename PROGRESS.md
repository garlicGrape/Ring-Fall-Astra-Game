# RINGFALL progress

## Current baseline

- Branch: `main`, tracking `origin/main` (`git@github.com:garlicGrape/Ring-Fall-Astra-Game.git`).
- Prototype is a local single-player Three.js arena FPS. `dist/` is authored source.
- Checks pass: `npm run check` and `npm test` — **26 tests** (21 baseline + 5 new arena tests).
- No browser playtest yet this session. Multiplayer is not implemented yet.
- Node v24.18.0 used locally; package.json still has no dependencies and no lockfile.

## This session

- Finished the drone presentation work that was in flight (hover, wing motion, pulsing
  lights, death dissolve).
- **Fixed a shared-material defect** in that work: drone glow panels and wings wrote
  `emissiveIntensity` / `opacity` onto the shared `mats.cyan` and `mats.dark` instances,
  which are also used by the perimeter rails, relay-core fins, core ring and orbital ring
  edge. Every cyan surface in the arena pulsed in sync with the last drone in the loop.
  Each drone now owns cloned armor/eye/wing/glow materials, disposed with it.
- Fixed a double-dispose: a dissolved drone stayed in `bots`, so `spawnWave()` disposed
  its geometry a second time. `disposeBot` is now idempotent.
- Blending for the dissolve is configured once in `killBot()` instead of every frame.
- **Extracted the arena into `dist/shared/arena.js`** — a renderer-free module exporting
  `BOXES`, `buildSolids()`, `SPAWNS` and `KILL_FLOOR`. `game.js` now builds meshes from it
  and derives `solids`/`shotMeshes` from the same specs. This is the prerequisite for an
  authoritative server: it can collide and raycast against exactly what the client draws.
  - Verified faithful by mechanically replaying the original imperative `box()` calls from
    the committed `game.js` and diffing: **120 boxes, 49 solids, identical**.
- Added `tests/arena.test.mjs`: finite/non-degenerate specs, collision bounds derived from
  drawn boxes, all 8 spawns on solid ground and clear of geometry, a player dropped at each
  spawn settles without drift, and the perimeter contains a sprinting player on all headings.
- Removed the `supabase` entry from `.claude/settings.local.json` (agent tooling only; the
  project never referenced Supabase). That file is git-ignored, so it never reached GitHub.

## Next task

Build the authoritative server (Milestone 2), in this order:

1. `dist/shared/protocol.js` — message types, size/shape validation, sequence rules.
2. `server/room.js` — room state, capacity 2–8, join/leave, code generation, isolation.
3. `server/sim.js` — fixed 60 Hz tick reusing `movement.js` + `weapons.js` + `arena.js`
   unchanged. **Gate the tick loop on rooms having players** so an idle server burns no CPU
   (this materially affects hosting cost on per-second-metered hosts).
4. Add `ws`, commit `package-lock.json`, extend `server.mjs` to serve same-origin WebSockets.
5. Client: prediction, reconciliation against acknowledged input sequences, remote
   interpolation. Keep solo practice working throughout.

Server tests to write alongside: room isolation/capacity, fire/reload timing under authority,
collision/hit agreement, shield regeneration, kill deduplication, respawn, timer/reset,
malformed input, disconnect cleanup.

## Remaining limitations

- `server.mjs` is still only a static file server; no rooms, no online matches.
- Browser performance, visual quality and pointer feel still need manual verification.
  The arena extraction was verified by spec diff and by HTTP module-graph load (all modules
  return 200), **not** by looking at the rendered scene.
- No deployment exists. Hosting is researched but nothing is provisioned.
