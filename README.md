# @ross-sec/sync-od

Sync any codebase to [Open Design](https://open-design.ai) and/or extract its design system. Script-driven, adversarial grading, bidirectional sync with managed blocks.

## What it does

- **Mode A — Project sync.** Turn a codebase into an OD project: build `od-bundle/` OD-safe pages,
  upload, grade, keep in sync.
- **Mode B — Design system sync.** Extract the design system: `DESIGN.md` + tokens (light + dark).
- **Both** (default). Mode B then Mode A.

## Features

- 18 bundled scripts that handle the mechanical work (detect, extract, build, validate, grade, upload)
- Adversarial 5-axis grading rubric (THEME / RTL / FIDELITY / COMPLETENESS / POLISH)
- Bidirectional sync via managed blocks (pull designer edits back safely)
- Secret guard hook (prevents secret-bearing content from reaching OD)
- Drift detection (logs when tracked files are edited)
- Subagent support (lead / worker / extractor agents)

## Install

### From npm

```bash
# Add to your OpenCode config
# opencode.json
{
  "plugin": ["@ross-sec/sync-od"]
}
```

### Local development

```bash
cd plugins/sync-od
npm install
npm run build
```

Then reference the local path in your OpenCode config:

```json
{
  "plugin": ["./plugins/sync-od"]
}
```

## Usage

Once installed, the skill triggers automatically when you ask to sync a codebase to Open Design:

```
/sync-od
sync this project to Open Design
create an OD design system for this repo
```

The plugin provides:
- **Hooks:** Secret guard (blocks secrets in edit/write/bash) and drift detection (logs file edits)
- **Skill:** Full SKILL.md with references, scripts, and agent definitions

## Plugin hooks

| Hook | Purpose |
|------|---------|
| `tool.execute.before` | Secret guard — blocks secret-bearing content from being synced |
| `file.edited` | Drift detection — logs edits to tracked design-sync files |

## Scripts

All scripts live in `scripts/` and are run by the agent (never by the plugin directly):

| Script | Purpose |
|--------|---------|
| `ods-init.js` | Bootstrap `.design-sync/` |
| `ods-detect.js` | Detect stack (Tailwind, CSS vars, etc.) |
| `ods-extract-tokens.js` | Extract light+dark tokens |
| `ods-build-design-system.js` | Build DESIGN.md + tokens |
| `ods-build.js` | Build OD-safe bundle |
| `ods-validate.js` | Validate bundle |
| `ods-capture.js` | Grade lifecycle |
| `ods-resync.js` | The driver (final build) |
| `ods-upload-plan.js` | Generate upload plan |
| `ods-upload-verify.js` | Verify upload |
| `ods-manifest.js` | Track src↔od pairs |
| `ods-pull.js` | Pull designer edits |

## License

MIT © Andre Ross / Ross Technologies
