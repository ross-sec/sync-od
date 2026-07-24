---
description: Sync current codebase to Open Design — extract tokens, push files, pull edits
---

Use the open-design-sync skill to sync the current project to Open Design. Follow the skill's pipeline:

1. **Detect** — run `node .ds-sync/ods-detect.js` to identify the project type and existing design state
2. **Extract** — run `node .ds-sync/ods-extract-tokens.js` to pull design tokens (colors, fonts, spacing) from the codebase
3. **Build** — run `node .ds-sync/ods-build.js` to create the OD-safe bundle
4. **Push** — upload to Open Design via the MCP (use `open-design_start_run` or `open-design_write_file`)
5. **Verify** — run `node .ds-sync/ods-verify.js` to confirm the sync succeeded

If `.ds-sync/` doesn't exist yet, run `node .ds-sync/ods-init.js` first to scaffold it.

Always work one phase at a time and report results after each step.
