# RINGFALL

An original sci-fi arena FPS: online free-for-all deathmatch on the Relay Station, plus a solo drone practice mode. Plain browser ES modules with vendored Three.js, and an authoritative Node + WebSocket server.

Start here, then read **PROGRESS.md** for current state, **LOCAL_WORKFLOW.md** for the session workflow and **PROJECT_HANDOFF.md** for the full brief. `AGENTS.md` and `CLAUDE.md` point both agents to the same documents.

## GitHub is the source of truth

The repository is **`garlicGrape/Ring-Fall-Astra-Game`**; `main` is the integration branch. Clone the repository's current working branch into a fresh folder whenever you want to develop. Prefer git clone over Download ZIP so your agent can commit and push changes normally.

All project dependencies, caches, logs and generated outputs should stay inside that disposable folder. The included .npmrc redirects npm cache/logs to .cache/, and .gitignore excludes local artifacts while preserving the authored dist/ source. Existing Git/Node/agent installations and browser/OS data can still remain outside it; this is not a zero-footprint guarantee.

At session end: stop project processes, test, update PROGRESS.md, commit, push and verify the remote branch. Only then, after preserving ignored files you need, may you move the checkout to Trash. The agent must never delete the checkout automatically. If a push fails, keep the folder. **LOCAL_WORKFLOW.md has the exact checks and safeguards.**

## Run the game

Install Node.js 22 or newer, open a terminal in this folder, and run:

```sh
npm ci        # installs ws, the only dependency
npm run dev
```

Open http://localhost:3000 in a desktop browser. Do not open `dist/index.html` as a file URL — the client is ES modules and needs the server. `npm start` runs the same server.

### Playing online

`server.mjs` serves the client AND runs the authoritative game server on the same origin and port.

1. Enter a callsign in the multiplayer panel.
2. **Create Match** makes a room and shows a four-character code plus an invite link.
3. Friends open the invite link (or enter the code and press **Join**).
4. Free-for-all: first to 15 eliminations or eight minutes. 2–8 players per room.

Rooms are in-memory. Restarting the server ends any match in progress. **Deploy** still runs the original solo drone practice with no connection needed.

Checks:

```sh
npm run check
npm test
```

## Begin agent work

Launch your installed Codex CLI or Claude Code from this folder. Give it this instruction:

> Read LOCAL_WORKFLOW.md, PROJECT_HANDOFF.md, PROGRESS.md and README.md. Run `npm ci`, `npm run check` and `npm test`, then continue from the next task in PROGRESS.md. Keep caches and artifacts inside this checkout, avoid global installs and background services. At the end of the session update PROGRESS.md **and every other document whose statements have gone stale**, then commit, push and verify the branch before saying this folder is safe to remove. Do not stop at a plan.

Use one agent at a time in this folder so they do not overwrite each other's work.

## Current controls

WASD move, mouse look, left click fire, right click precision aim, Space jump, Shift sprint, R reload, 1/2 switch weapons, Escape release mouse. If capture is blocked in an embedded view, open the game in its own browser tab.

In solo practice Escape pauses. **Online, Escape only opens your local menu — the match keeps running and you can still be shot.**

## Baseline and limits

Online free-for-all deathmatch (2–8 players, rooms by code, authoritative server) plus solo drone practice with rifle/scattergun, shields, health and local collision.

**59 automated checks pass**, including integration tests that drive real WebSocket clients through a live server. **No part of the game has been verified in a browser** — rendering, mouse feel, frame rate and the look of remote players are all still unconfirmed. See PROGRESS.md for the current verified/unverified split.

`dist/` contains authored source, not disposable build output; `dist/shared/` is imported by both the browser and the server. `server/` holds the authoritative simulation. Three.js 0.160.1 is vendored with its MIT license. `ws` is the only npm dependency. Google Fonts is an optional cosmetic request; system fonts are used if unavailable. The game itself works with local assets.

This export contains no hosting account configuration, credentials, Git history, or nested source ZIP. Running it locally does not require OpenAI sign-in. The existing hosted game has not been changed by preparing this package.
