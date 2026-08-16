# Changelog

All notable changes to `@ross-sec/sync-od` are documented here.

## [0.1.5] - 2026-08-16

### Fixed

- **`/usr/bin/od` was being mistaken for the Open Design CLI.** `findOdCli()` took the first
  `which od` / `where od` hit on trust — but on every Mac, Linux box, WSL2 and Git Bash install that
  is GNU coreutils' **octal dump**, which Open Design's own README warns about three times. The
  result: `/sync-od` reported `od CLI: ✅ found at /usr/bin/od` and told the user to run `od`
  commands against it, while the connectivity check failed with a nonsense error
  (`od: mcp: No such file or directory`). Every candidate is now probed with `--help` and only
  believed if it identifies as Open Design.
- **Added a bundled-CLI fallback.** The desktop app ships its own CLI and never puts it on PATH, so
  when nothing on PATH qualifies the plugin now looks for the app's `daemon-cli.mjs` (Windows and
  macOS) and runs it with `ELECTRON_RUN_AS_NODE=1`.
- **Removed a nonexistent install instruction.** The failure path advised
  `npm install -g @open-design/cli`; no `@open-design/*` package exists on npm — every one 404s.
  It now points at the desktop app or `pnpm tools-dev`.
- **The publish workflow had never run once.** Its `paths` filter (`plugins/sync-od/**`) and
  `working-directory` were copied from a monorepo layout, but this repository's root *is* the
  package, so nothing ever matched. GitHub Packages was consequently never populated.
- **GitHub Packages publish targeted the wrong registry.** `actions/setup-node` writes
  `@ross-sec:registry=https://registry.npmjs.org/` into `.npmrc`, and a *scoped* mapping beats
  `--registry`. The step now rewrites `.npmrc` first.
- **`test/` was gitignored,** so CI had no tests to run. The 82 tests are now tracked.

### Changed

- README no longer claims the daemon listens on `127.0.0.1:7456`; it binds a random high port.

## [0.1.4] - 2026-07-25

### Added
- **Hooks**: `ods-guard.mjs` (secret guard) and `ods-drift.mjs` (file edit drift logging)
- **Agents**: `sync-od-lead`, `sync-od-worker`, `sync-od-extractor` subagent definitions
- **Assets**: Graphviz diagrams (workflow, sync-loop, decision-tree, task-tree)
- **References**: Complete `agent-system-prompt.md` adapted for OpenDesign + opencode
- **Automation**: GitHub Actions workflow for dual-registry publishing (npmjs.org + GitHub Packages)

### Changed
- **Renamed**: All `open-design-sync` references → `sync-od` throughout codebase
- **Updated**: `/sync-od` command now runs Step A of RE-ANCHOR RITUAL (autonomous `ods-status.js` execution)
- **Version**: Bumped to 0.1.4 in package.json and SKILL.md

### Fixed
- Package.json `files` array now includes `agents/`, `assets/`, `hooks/`
- Command file `commands/sync-od.md` aligned with autonomous pipeline
- Plugin tool description reflects autonomous RE-ANCHOR RITUAL

## [0.1.3] - 2026-07-24

### Added
- MCP connectivity test with `od` CLI fallback
- `/sync-od` command for opencode

## [0.1.2] - 2026-07-20

### Added
- Initial plugin structure with 18 bundled scripts
- Adversarial grading (5-axis rubric)
- Bidirectional sync with managed blocks
- Secret guard and drift detection hooks

## [0.1.1] - 2026-07-19

### Added
- Core scripts: init, detect, extract, build, validate, capture, resync, upload-plan, upload-verify, manifest, pull, push
- RUNBOOK.md (deterministic weak-model-proof command-per-line runbook)
- Mode A (project) / Mode B (design-system) / Both routing

## [0.1.0] - 2026-07-18

### Added
- Initial release of sync-od (ported from open-design-sync / Claude Design pipeline)