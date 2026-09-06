# RINGFALL: shared development brief

This is the primary handoff for either Codex CLI or Claude Code. Read it with README.md, LOCAL_WORKFLOW.md and the actual source before changing code. Work in the extracted `ringfall` folder.

## The user's goal

Turn this early single-player browser prototype into a good-looking, responsive, Halo-inspired arena FPS that the user can play with friends online. Improve the actual game, especially weapon/character animations and the environment. Keep the original RINGFALL identity and use original or properly licensed assets. Do not copy Halo names, music, models, logos, or maps.

The user specifically reported poor graphics, bad mouse feel, buggy reloads, and bad reload animation. Prioritize those issues alongside functional multiplayer. This is not a request for another marketing page, another prompt, or a multiplayer-looking UI with fake players.

Implement and verify the work rather than stopping at a plan. Make reasonable engineering decisions without routine clarification. Keep the game working at each milestone. If access, a paid resource, or a required capability blocks part of the work, complete everything else and identify the exact remaining step. Do not invent a deployment or claim browser testing that did not happen.

## What is here now

Baseline: prototype v1.2, exported from source revision `fbde9bbbef365d7a38b61e34f12180ee58dc0421`. This export adds handoff documentation and removes the hosted source-download link. It excludes the old Site identity, credentials, Git history, and previous ZIPs. It is a standalone starting point; do not assume this folder is connected to the old hosted Site.

- Plain browser JavaScript ES modules, with locally vendored Three.js 0.160.1.
- No npm dependencies or build pipeline yet. Node.js 22+ serves `dist/` through `server.mjs`.
- `dist/` currently contains the authored source. Do not delete it as “generated output.” If moving to a source/build structure, migrate these files first.
- Single-player waves of hovering drones, static arena collision, two hitscan weapons, shields, health, synthesized audio, pause/death/redeploy.
- A 120 Hz local simulation and interpolated player rendering.
- 21 code-level regression tests passed at handoff. Actual browser visual quality, mouse feel and performance have NOT been verified automatically.
- `server.mjs` is only a static file server. It is NOT a multiplayer server.
- Browser-generated sounds and simple procedural geometry are placeholders, not finished production art.
- This folder has no game accounts, databases, APIs, multiplayer protocol, or room system. Practice progress resets on reload. Preferences are session-only.

### Source map

| File | Responsibility |
| --- | --- |
| `dist/game.js` | Arena, rendering, main loop, drones, combat effects, HUD integration |
| `dist/controls.js` | Pointer lock, keyboard input, aiming and pause lifecycle |
| `dist/movement.js` | Kinematic movement, collision, stairs, gravity and jumping |
| `dist/weapons.js` | Weapon state, reload timeline, cooldowns, swept projectile helper |
| `dist/index.html`, `dist/style.css` | Start/pause screen, settings, HUD |
| `tests/controls.test.mjs` | Input lifecycle and movement regression checks |
| `tests/weapons.test.mjs` | Reload, switching, cooldown, animation and projectile checks |
| `dist/vendor/` | Vendored renderer and MIT license |

## GitHub-first development requirement

The user wants to obtain a fresh copy from GitHub for each session and avoid accumulating project junk on the laptop. `LOCAL_WORKFLOW.md` is the mandatory source of detail for setup, storage, session completion and safe cleanup. Keep dependencies, npm/browser caches, reports and builds local to the disposable checkout. No global package installs, persistent local services, or shell/global-agent configuration changes. Keep all required source/assets/lockfiles and PROGRESS.md recoverable from the chosen repository; verify pushed branch and SHA before calling work backed up. Do not automatically delete the user's checkout. Existing tools/browser/OS data may remain outside the folder, so do not promise zero footprint.

No GitHub repository was created as part of this packaging task. Resolve the real destination and access before the initial upload. Use fresh git clones thereafter, preferably of the recorded working branch. This rule applies throughout all milestones below. A deployment Dockerfile does not authorize running persistent local Docker services.

## First actions

1. Read LOCAL_WORKFLOW.md, inspect repository/branch state and preserve any unpushed work. Inspect the files, run `npm run check` and `npm test`, then run `npm run dev`.
2. Open `http://localhost:3000` in a real desktop browser if browser tooling is available. Exercise deploying, capture/release, movement, shooting, manual/empty reload, weapon switching, pause/resume and death/redeploy. Record actual failures and console errors.
3. Create `PROGRESS.md` with baseline findings, milestones, completed work, remaining work, checks run and the next concrete task. Keep it brief and current so either agent can continue.
4. Implement a coherent improvement, verify it, and continue. Refactor incrementally; do not replace the working prototype with an empty scaffold.

## Preserve these repaired behaviors

- Request pointer lock synchronously from a user click, before awaiting audio or network promises. Start local gameplay only when capture succeeds. Capture failure must not silently become drag-to-look.
- Clear held keys, firing and aim when focus is lost or pointer lock exits. A late capture response after cancellation must not restart the game.
- Relative mouse aim must not depend on framerate or use smoothing that introduces noticeable lag. Keep sensitivity adjustable. Keep a stable horizon and restrained weapon bob.
- Normalize diagonal movement; handle walls, ceilings, stairs, falling and respawns consistently.
- Reload is an explicit state. A previous negative countdown was truthy and permanently blocked firing. Never reintroduce that pattern.
- Ammo refills only when a reload completes. Repeated R does not restart the timer. Switching cancels reload without free ammo. A weapon's firing cooldown survives switching.
- Pause freezes solo simulation. Reset clears weapon state, projectiles, effects, damage overlays and FOV.
- Cover impacts take precedence over later projectile/player intersections. Invisible dead targets cannot absorb subsequent shotgun pellets. Dispose removed geometry/materials safely without disposing shared assets.
- Preserve meaningful tests as architecture changes. Add regressions for reproduced defects rather than tests that merely repeat implementation details.

## Milestone 1: animation and playable baseline

Replace crude weapon motion with clearly readable, coherent animations. Use proper first-person arms, distinct weapon silhouettes and suitable models if available. A simple well-animated original model is better than a detailed broken one.

- Separate gameplay state from animation state. Gameplay timers own reload completion and fire eligibility; animation samples those timers.
- Rifle reload: raise/tilt, support-hand approach, magazine extraction/insertion, charging action when appropriate, return to ready.
- Give the scattergun a distinct reload and pump/bolt motion appropriate to its design. If changing to per-shell reload, implement ammo increments and fire interruption deliberately, with tests. Otherwise use a clear sci-fi cell replacement.
- Handle cancellation, switching during reload, reload while aiming, empty reload, held fire, pause, death and respawn without snapping, floating magazines, clipped arms or stale transforms.
- Align muzzle flashes, tracers, shell ejection, mechanical audio and impacts with visible actions. Return recoil smoothly; do not shake the whole camera excessively.
- Add a small equip/holster transition, restrained movement sway, jump/landing feedback and consistent precision aiming.
- Keep a practice mode so controls and weapons can be tested alone.

## Milestone 2: real online multiplayer

Use a persistent Node.js server with WebSockets and an authoritative simulation. A practical target architecture is TypeScript, a Vite browser client, a Node WebSocket server and shared protocol/map/movement types. Migrate only as needed, keep clear run commands, and commit a lockfile once dependencies exist. Verify current package APIs before adopting them.

### Player flow and match rules

- Enter a safe display name; create a room or join by code/invite URL. No OpenAI or other account should be required for the proposed externally hosted game.
- 2–8 human players per room, with capacity enforcement and isolation between rooms.
- Copy-invite action, join-in-progress, readable connection status, useful errors for invalid/full rooms, and graceful disconnect behavior.
- Free-for-all deathmatch: first to 15 kills or eight minutes; timer tie is a draw; scoreboard, kill feed, results, then automatic new round.
- Three-second respawn, safer spawn selection away from enemies, and brief visible spawn protection that ends when firing.
- Each player has 100 health and 100 shield. Shields take damage first and regenerate after five seconds without damage.
- Spawn with rifle (30-round magazine) and scattergun (6 rounds), with generous reserves. If preserving unlimited reserves as a prototype choice, label/document it consistently.
- Solo practice remains available. Distinguish practice drones from human players and keep them out of online deathmatch unless a bot option is intentionally implemented.

### Authority and networking

- The server owns identity, room membership, positions, collision, health, shields, weapon/reload state, hit detection, deaths, respawns, scores and timers.
- Clients send sequenced movement/look inputs and action requests. Never accept arbitrary trusted position, damage or hit reports.
- Use a fixed server timestep (60 Hz is a reasonable starting point) and about 20 snapshots/second. If changing the existing 120 Hz movement integration, make prediction and authority use consistent rules and verify the change.
- Predict local movement immediately; reconcile from authoritative state and acknowledged input sequences; replay pending inputs. Interpolate remote players. Bound buffered inputs and snapshots.
- Render local firing feedback immediately but confirm damage/kills on the server. Do server-side raycasts against the same arena collider data used by movement. Avoid duplicate local effects when acknowledgments arrive.
- Add bounded server-side rewind/lag compensation only after basic authority works. Document any remaining high-latency shooting limitation.
- Validate message types, sizes, finite numbers, sequence order, input rates, names and room capacity. Prevent duplicate death scoring and ammo/fire-rate exploits. Malformed messages must not crash the process.
- Heartbeats, disconnect cleanup, empty-room expiry and sensible reconnect or explicit rejoin behavior. The creator leaving must not end other players' matches.
- In multiplayer, Escape/blur opens a local menu and sends neutral input; it DOES NOT pause the server. A living idle player can still be hit. Respawn and round transitions must work while the menu is open.
- Start with one server instance and in-memory rooms. Do not add a database or distributed scaling before a real requirement exists. Document that restart/redeploy ends active matches.

## Milestone 3: art and performance

Make this feel like a cohesive arena shooter rather than a set of boxes. Retain the original Relay Station direction: an open-air alien relay, orbital structure, metal/concrete architecture, cyan navigation lighting and warm orange accents.

- Improve arena composition, cover shapes, elevation routes, sightlines, spawn safety, and route recognition. Visual geometry and collision must agree.
- Use coherent PBR materials, sensible texture density, edge detail, sky/terrain, contact shadows and restrained post-processing. Avoid bloom obscuring enemies or flattening the palette.
- Add readable armored remote characters with facing direction and idle/run/jump/fire/death animation. Use team-independent player color accents for free-for-all.
- Improve weapon/arm materials, animation silhouettes and environmental audio. Make shield breaks and incoming damage clear.
- Keep HUD legible, use distinct weapon icons/models, and make online state and invitations easy to use. Do not build a promotional landing page in front of the game.
- Use licensed assets, record source/author/license and modifications in `ASSETS.md`, and retain required attribution. Do not invent license claims. Keep downloaded runtime assets local where permitted.
- Add quality controls if useful: render scale, shadows and effects. Cap device pixel ratio, control draw calls and allocations, and clean up resources.
- Target 60 fps at 1080p on a typical laptop, but measure and report actual hardware/browser/results instead of claiming the target is achieved without evidence.

## Milestone 4: verification and deployment

Before claiming completion:

- Pass regression tests and add meaningful server tests for room isolation/capacity, authority, fire/reload timing, collision/hits, shield regeneration, kill deduplication, respawn, timer/reset, malformed input and disconnect cleanup.
- Run at least two independent browser clients. Verify visible remote movement, damage, death, score agreement, join-in-progress, disconnect/rejoin and separate-room isolation. Protocol clients alone do not establish browser correctness.
- Test both weapons through repeated manual and automatic reloads, switching, pause/blur, death and respawn. Inspect animations in the browser, including intermediate magazine/hand poses.
- Exercise latency/jitter and packet interruption if tooling permits. Record the conditions tested. Do not assert “lag-free.”
- Check console errors, asset failures, resource cleanup and a sustained session. Inspect relevant desktop viewport sizes. Mobile can show a clear desktop-controls message; mobile gameplay is not required.
- If browser tooling is unavailable, finish code-level tests and explicitly list the required manual browser checks. Never fabricate screenshots or successful playtests.

Package a single Node service that serves the built client and same-origin WebSockets. Bind to `0.0.0.0`, honor `PORT`, use HTTPS/WSS in production, and provide health checks and graceful shutdown. Add a Dockerfile, `.dockerignore`, `.env.example` with placeholders only, and exact build/start commands.

Document a concrete deployment path for a host supporting persistent Node processes and WebSockets, such as Railway or Render. Verify current host documentation and configuration; do not rely on old pricing assumptions. Choose a region near players, run one replica initially, and explain how to obtain a public URL that friends can open. Static-only hosting is insufficient for the authoritative server.

Prepare deployable artifacts autonomously. Do not purchase services or change external access without authorization. If hosting credentials/authorization are unavailable, report exact remaining steps. Do not claim localhost is internet-accessible. Do not reconnect this standalone export to the old private ChatGPT Site without the user's request.

## Working across Codex and Claude

Both agents should use this document and `PROGRESS.md` as the shared record. Run one agent at a time in a checkout unless work is explicitly isolated. Before switching agents, finish or checkpoint changes and state what is currently broken or untested. Do not overwrite another agent's uncommitted changes or reset the repository to this baseline.

At completion, report what changed, what actually passed, unresolved limits, local run commands and the verified public URL or deployment steps. Also report the GitHub branch and pushed SHA, backup-verification result, project processes stopped, any files created outside the checkout, and whether the user can safely remove the checkout. The intended result is a working, attractive online game, not just a plan.
