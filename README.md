# RINGFALL development package

Start here, then read **LOCAL_WORKFLOW.md** and **PROJECT_HANDOFF.md**. It contains the multiplayer, animation and visual-improvement brief for Codex CLI or Claude Code. `AGENTS.md` and `CLAUDE.md` point both agents to that same brief.

## GitHub is the source of truth

Use this ZIP once to bootstrap your chosen GitHub repository. No GitHub upload has been performed yet. After setup, clone the repository's current working branch into a fresh folder whenever you want to develop. Prefer git clone over Download ZIP so your agent can commit and push changes normally.

All project dependencies, caches, logs and generated outputs should stay inside that disposable folder. The included .npmrc redirects npm cache/logs to .cache/, and .gitignore excludes local artifacts while preserving the authored dist/ source. Existing Git/Node/agent installations and browser/OS data can still remain outside it; this is not a zero-footprint guarantee.

At session end: stop project processes, test, update PROGRESS.md, commit, push and verify the remote branch. Only then, after preserving ignored files you need, may you move the checkout to Trash. The agent must never delete the checkout automatically. If a push fails, keep the folder. **LOCAL_WORKFLOW.md has the exact checks and safeguards.**

## Run the current game

Install Node.js 22 or newer, open a terminal in this extracted `ringfall` folder, and run:

```sh
npm run dev
```

Open http://localhost:3000 in a desktop browser. No dependency installation or API key is needed for this baseline. Do not open `dist/index.html` as a file URL. `npm start` runs the same static server.

Checks:

```sh
npm run check
npm test
```

## Begin agent work

Launch your installed Codex CLI or Claude Code from this folder. Give it this instruction:

> Read LOCAL_WORKFLOW.md, PROJECT_HANDOFF.md and README.md. Inspect the existing game, run its baseline checks, then implement the multiplayer, animation and visual improvements in the brief. Keep caches and artifacts inside this checkout, avoid global installs and background services, and keep PROGRESS.md current. Commit and push to the chosen GitHub branch, then verify backup before saying this folder is safe to remove. Do not stop at a plan.

Use one agent at a time in this folder so they do not overwrite each other's work.

## Current controls

WASD move, mouse look, left click fire, right click precision aim, Space jump, Shift sprint, R reload, 1/2 switch weapons, Escape pause/release mouse. Click Deploy to capture the mouse. If capture is blocked in an embedded view, open the game in its own browser tab.

## Baseline and limits

Prototype v1.2: single-player drone waves with rifle/scattergun, shields, health and local collision. No online features exist yet. 21 code-level regression checks passed before export. Browser animation quality and subjective control feel still need real playtesting.

`dist/` contains authored source, not disposable build output. Three.js 0.160.1 is vendored with its MIT license. Google Fonts is an optional cosmetic request; system fonts are used if unavailable. The game itself works with local assets.

This export contains no hosting account configuration, credentials, Git history, or nested source ZIP. Running it locally does not require OpenAI sign-in. The existing hosted game has not been changed by preparing this package.
