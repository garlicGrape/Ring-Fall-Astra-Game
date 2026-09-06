# RINGFALL progress

## Current state

- Branch: `shared-arena-foundation`, tracking `origin/` on `garlicGrape/Ring-Fall-Astra-Game`.
- **Online multiplayer is implemented and working.** Authoritative Node + WebSocket server,
  client prediction and reconciliation, remote avatars, rooms, scoreboard and kill feed.
- Solo practice against drones is unchanged and still available.
- Checks pass: `npm run check` and `npm test` — **59 tests**, including 6 that drive two real
  WebSocket clients through a live server.
- Node v24.18.0. First dependency added: `ws` (with `package-lock.json` committed).

## Architecture

| Module | Role |
| --- | --- |
| `dist/shared/arena.js` | Renderer-free arena geometry; client draws it, server collides against it |
| `dist/shared/protocol.js` | Message types, validation, match rules, room codes, name sanitizing |
| `dist/shared/raycast.js` | Ray/AABB hit resolution against the same solids `movePlayer` uses |
| `server/room.js` | Authoritative deathmatch room: movement, shooting, damage, deaths, scores |
| `server/hub.js` | Room registry, join/leave, rate limits, sweep, gated fixed-timestep driver |
| `server.mjs` | Static client + same-origin WebSockets, `/healthz`, graceful shutdown |
| `dist/net.js` | Transport, local prediction/reconciliation, remote interpolation |
| `dist/online.js` | Remote avatars, nameplates, scoreboard, kill feed, match HUD |

`movement.js` and `weapons.js` are imported unchanged by BOTH sides, so prediction and
authority cannot drift apart.

## Defects found and fixed this session

- **Shared drone materials.** Glows and wings wrote onto the shared `mats.cyan`/`mats.dark`,
  repainting every rail, fin and ring in the arena. Each drone now owns cloned materials.
- **Double dispose.** A dissolved drone stayed in `bots`, so `spawnWave()` disposed its
  geometry again. `disposeBot` is idempotent.
- **Infinite loop in room code allocation.** `do {...} while (rooms.has(code))` spun forever
  with a degenerate RNG, hanging the whole process synchronously. Now bounded, with a
  deterministic fallback walk.
- **Double-encoded snapshots.** `Hub.broadcast` sent an already-serialized frame into a
  `send()` that serialized again. A browser would have connected, shown "Connected", and
  then seen nothing ever move. Found by the WebSocket integration test.
- **Stale input ran forever.** A silent client's last input was repeated indefinitely, so a
  disconnected player kept running and firing. Now repeated for a 0.5s grace window, then
  neutralized — the player stays in the world and stays killable.

## Verified

- 59 automated tests, all passing.
- Live two-client session against the real `server.mjs`: room codes, both players visible,
  movement replicated, damage traded, **20 snapshots/sec measured**, match clock, authoritative
  reload (ammo unchanged mid-reload, restored on completion), `/healthz`, clean shutdown.
- Full module graph serves over HTTP (all 200s).

## NOT verified

- **Nothing has been looked at in a browser.** No rendering, no mouse feel, no frame rate,
  no visual check of remote avatars, nameplates, the scoreboard or the drone material fix.
  Two browser windows have not been opened against each other.
- No latency/jitter/packet-loss testing.
- No deployment exists.

## Next task

1. Open two browser windows on `http://localhost:3000`, create a match in one, join by code
   in the other, and confirm remote players render and animate correctly.
2. Then: Milestone 3 art pass, and deploy to Railway (~$5/month Hobby; the tick loop is
   already gated on having players so an idle server costs almost nothing).
