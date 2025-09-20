# Repository Guidelines

## Project Structure & Module Organization

`lawn-lapse.js` is the CLI entry point and orchestrates prompts, camera access, and timelapse assembly. `capture-and-timelapse.js` handles the capture + encode loop when invoked from cron. `config.js` centralizes reads/writes for `lawn.config.json`. Shared utilities and hooks live in `scripts/`, while longform docs and GitHub Pages assets are under `docs/`. Generated media lands in `snapshots/` and `timelapses/`; keep these out of commits unless they illustrate a change. Logs are rotated into `logs/` for debugging sessions.

## Build, Test, and Development Commands

- `npm run capture` runs the capture + encode pipeline end to end.
- `npm run lint` applies ESLint rules (ESM, Node 18+) with autofix.
- `npm run format` runs Prettier across the repo; use before opening a PR.
- `npm test` runs Node's built-in test runner against `tests/` and still performs syntax checks on the entry points.
  Install dependencies with `npm install` and verify you are on Node 18.0.0 or later, per `package.json`.

## Coding Style & Naming Conventions

All code is modern ECMAScript modules. Prettier enforces 2-space indentation, semicolons, and double quotes. Keep filenames kebab-cased (e.g., `capture-and-timelapse.js`). Follow the ESLint config: prefer `const`, avoid unused variables, and reserve leading underscores for intentionally unused arguments. Log output is acceptable; avoid wrapping console helpers.

## Testing Guidelines

Tests live in `tests/` and run with `node --test`. Add fixtures that isolate filesystem access by setting `LAWN_LAPSE_CONFIG_DIR` to a temp directory. When adding behavior that touches UniFi APIs, supply mockable helpers or environment toggles so tests can run without credentials. Name ad-hoc scripts after the capability they verify (e.g., `scripts/test-mp4-stitch.sh`).

## Commit & Pull Request Guidelines

Commits in history use short, imperative subjects ("Prevent modules from auto-executing when imported"). Group related changes together and leave generated media out of the diff. Pull requests should link any issue, describe reproducible steps, and mention required environment variables or new artifacts. Include footage samples or log excerpts only when essential; otherwise reference the path in `logs/` or `snapshots/`. Run lint, format, and tests before pushing so hooks stay quiet.

## Configuration & Security Notes

Load credentials via `lawn.config.json`; `config.js` will migrate any legacy `.env.local` automatically. Never commit `lawn.config.json`, `.env*` files, or UniFi exports. If you enable custom schedules cron-side, document them in PR notes so maintainers can reproduce the timing locally.
