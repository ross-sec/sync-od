# Changelog

All notable changes to `@ross-sec/sync-od` are documented here.

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