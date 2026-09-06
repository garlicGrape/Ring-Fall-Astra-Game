# RINGFALL agent instructions

Read `PROJECT_HANDOFF.md` and `README.md` before editing. `PROJECT_HANDOFF.md` is the shared brief for Codex CLI and Claude Code. Follow the user's current instructions first.

Check `PROGRESS.md` if it exists and continue from the recorded state. Preserve unrelated changes. Keep this a working game through incremental implementation. Record actual verification and remaining limitations. The authored application currently lives in `dist/`; do not delete it as generated output.

## Required GitHub and laptop policy

Read `LOCAL_WORKFLOW.md` before running commands. Follow the GitHub-first, disposable-checkout workflow: no global project installs or startup services, keep caches and generated files under the repository, commit reproducible source and lockfiles, and verify the chosen upstream after pushing. Update PROGRESS.md for the next fresh clone. Never delete the checkout automatically or claim zero laptop footprint. Preserve work if pushing or backup verification fails.

## Required end-of-session documentation update

Before committing at the end of a session, update the Markdown documents so a fresh clone is
never misled. At minimum re-read `PROGRESS.md`, `README.md` and `PROJECT_HANDOFF.md` and
correct anything that has gone stale — feature lists, test counts, run commands, source maps,
milestone status. State plainly what was verified and what was NOT; never let a document
imply a check that did not happen. `LOCAL_WORKFLOW.md` has the full checklist.
