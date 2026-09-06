# GitHub-first, disposable development

This is a project requirement for both Codex CLI and Claude Code. Keep the repository reproducible from GitHub and minimize files outside the checkout. GitHub stores source, assets, lockfiles, tests and development notes. Your laptop is a temporary workspace, not the only copy of any required work.

## What this can and cannot guarantee

Deleting a disposable checkout removes its project dependencies, project caches, logs and build outputs when those paths follow this policy. It does not uninstall existing Node/Git/agent tools, erase browser site data, clear operating-system temporary files, or remove Codex/Claude authentication and conversation data. Those tools may maintain their own files outside the repository. Never wipe their global data automatically. No zero-footprint claim is permitted.

For no local project checkout, use a remote development environment if you choose one. Its lifecycle, storage and charges are separate from this package; do not provision it automatically.

## One-time GitHub setup

No GitHub repository has been created for this export. Choose an actual repository and its visibility before uploading; private is the default preference. Never guess the account, repository URL, access policy or remote.

Use this ZIP once as the bootstrap. The repository root must contain package.json, README.md and these instruction files, rather than an unnecessary extra ringfall directory. Review the files, initialize Git if necessary, add the selected GitHub remote, commit the source and push. Keep credentials and local .env files out of the commit. The existing dist/ folder is authored source and MUST be included.

The development agent should complete this setup with the user's chosen repository and authenticated Git access when available. If missing, finish local work and report exactly what is needed. Do not say work is backed up until the remote branch is verified.

## Each new development session

1. Clone the chosen repository into a fresh, dedicated folder. Prefer git clone to GitHub's Download ZIP: a clone retains branches, history and the remote needed to push changes.
2. Use the branch containing the latest work. Unmerged work may be on a development branch, not the default branch. Read PROGRESS.md before coding.
3. Run the documented checks. The current baseline needs only Node.js 22+, with no dependency installation:

```sh
npm run check
npm test
npm run dev
```

4. After future development adds dependencies and a committed package-lock.json, use npm ci from the repository root. Do not use npm install -g. Preserve the package manager and lockfile once chosen.
5. Use the installed agent from this folder, one agent at a time. All generated project artifacts must remain inside the checkout.

Clone template, replacing both placeholders with the real chosen values:

```sh
git clone <YOUR_GITHUB_REPOSITORY_URL> ringfall-work
cd ringfall-work
git switch <YOUR_WORK_BRANCH>
```

If you download a GitHub ZIP instead, it has no .git history or upstream. Do not treat it as a synchronized checkout or delete it assuming local changes have reached GitHub.

## File placement rules

- Dependencies: node_modules/ inside this checkout only.
- npm cache and logs: .npmrc routes them to .cache/npm and .cache/npm-logs. Keep that file tracked. Environment/CLI overrides can change npm behavior; verify effective paths if needed.
- Temporary files: .tmp/ inside the checkout; command-specific temporary-directory overrides may be used after creating the directory. Never repurpose HOME or overwrite global environment configuration.
- Screenshots, recordings, test reports and generated assets awaiting review: artifacts/, test-results/ or playwright-report/ inside the checkout.
- Browser automation downloads: use a project-local browser cache. If adopting Playwright, set PLAYWRIGHT_BROWSERS_PATH to an absolute path under this checkout's .cache/ms-playwright for both installation AND execution. Do not silently download browsers to a global user cache. Document the commands you actually use.
- Future compiled outputs: build/ or another explicitly documented generated folder. Do not ignore or delete today's dist/ source; first migrate it safely if adopting a build pipeline.
- Secrets: ignored local .env files; commit only .env.example placeholders. Required secret values should be recoverable from the user's chosen secure store, never only this temporary folder.
- Required assets, code, test fixtures and instructions must be committed, including licenses. Do not depend on absolute paths to the developer's laptop. If large assets require Git LFS or an external store, explicitly document and verify fresh-clone retrieval.
- Do not install background startup jobs, launch agents, login items, cron tasks, system daemons or global development packages.
- Do not modify shell startup files, global Git config or agent-global instructions for this project. Use repository-local or per-command configuration.
- Do not introduce Docker by default for local development. If explicitly chosen, scope container names and storage to this project, document cleanup, and never prune unrelated containers/images/volumes. Deployment Dockerfiles may still be supplied.

## End of each session

1. Stop the foreground development server with Ctrl+C. Stop only project-owned test runners and other processes started during this session; never kill every Node process.
2. Run relevant tests, update PROGRESS.md, and review git diff and git status. Include source, required assets, package manifests/lockfiles, docs and tests. Inspect new files for credentials before staging.
3. Commit and push to the chosen repository and branch. Record the branch name, full commit SHA, test results and next task. If push fails, KEEP the checkout and say the work is not backed up.
4. Verify the upstream after a successful push:

```sh
git fetch origin
git status --short
git branch -vv
git log --oneline '@{upstream}..HEAD'
git rev-parse HEAD
git rev-parse '@{upstream}'
```

There should be no unstaged/staged/untracked work, no local-only commits in the log, and the two SHAs should match for the pushed branch. If upstream is missing or any command fails, stop and resolve it. These checks assume the chosen remote is origin; use its actual name if different.

5. Inspect ignored local files too: git status --short does not show them. Preserve anything irreplaceable, especially secrets or uncommitted asset originals, through the appropriate secure route. Do not upload secrets just to make cleanup convenient.
6. After successful verification, the USER may move the entire dedicated checkout folder to Trash using Finder/Explorer. This removes its project-local node_modules and caches as well. The agent must not automatically delete the active checkout, downloaded source ZIP or any unrelated folder. No broad rm -rf, git clean -fdx or global cache wipe commands.
7. Next time, clone the recorded branch again. Reinstall reproducible dependencies only if the project now needs them.

A clean working tree alone is not proof of backup: commits can still be local. A successful push alone is not proof that untracked or ignored work was preserved. Check both before removing the folder.

## Agent completion report

Always state: chosen GitHub repository/branch; whether changes were pushed and verified; tests run; files/services created outside the checkout (ideally none); project processes stopped or still running; and whether the checkout is safe for the user to remove. Do not claim automatic cleanup or GitHub upload occurred when it did not.

Keep this policy in sync with README.md, PROJECT_HANDOFF.md, AGENTS.md and CLAUDE.md as the stack evolves. A fresh clone must remain enough to resume development using the documented prerequisites and secret setup.
