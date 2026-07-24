import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { readFileSync, existsSync, appendFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"

/**
 * sync-od — OpenDesign Sync Plugin for OpenCode
 *
 * Syncs any codebase to Open Design AND/OR extracts
 * its design system. Script-driven, adversarial grading, bidirectional
 * sync with managed blocks.
 *
 * @see https://open-design.ai
 */
const SyncOd: Plugin = async ({ project, directory, worktree, $, client }) => {
  // Log initialization
  await client.app.log({
    body: {
      service: "sync-od",
      level: "info",
      message: "Plugin initialized",
      extra: { project: project?.id ?? "unknown", directory },
    },
  })

  return {
    // ─── /sync-od command ───
    tool: {
      "sync-od": tool({
        description:
          "Sync a codebase to Open Design and/or extract its design system. " +
          "Modes: 'project' (sync codebase to OD), 'design-system' (extract DESIGN.md + tokens), " +
          "'both' (default — design system first, then project sync).",
        args: {
          mode: z
            .enum(["project", "design-system", "both"])
            .optional()
            .describe("Sync mode (default: both)"),
          target: z
            .string()
            .optional()
            .describe("Target directory or project name in Open Design"),
        },
        async execute(args, ctx) {
          const mode = args.mode ?? "both"
          const target = args.target ?? "current-project"

          // Check for .design-sync directory
          const designSyncDir = join(directory, ".design-sync")
          const hasDesignSync = existsSync(designSyncDir)

          // Check for OD project registration
          const manifestPath = join(designSyncDir, "manifest.json")
          const hasManifest = existsSync(manifestPath)

          let result = `## sync-od — ${mode} mode\n\n`
          result += `**Directory:** \`${directory}\`\n`
          result += `**Target:** \`${target}\`\n`
          result += `**.design-sync:** ${hasDesignSync ? "initialized" : "not found — run `ods-init.js` first"}\n`
          result += `**Manifest:** ${hasManifest ? "found" : "not found"}\n\n`

          if (mode === "project" || mode === "both") {
            result += "### Project Sync\n"
            result += "1. Run `node scripts/ods-detect.js` to detect stack\n"
            result += "2. Run `node scripts/ods-build.js` to build OD-safe bundle\n"
            result += "3. Run `node scripts/ods-validate.js` to validate\n"
            result += "4. Run `node scripts/ods-upload-plan.js` to plan upload\n"
            result += "5. Upload artifacts to Open Design\n\n"
          }

          if (mode === "design-system" || mode === "both") {
            result += "### Design System Sync\n"
            result += "1. Run `node scripts/ods-extract-tokens.js` to extract tokens\n"
            result += "2. Run `node scripts/ods-build-design-system.js` to build DESIGN.md\n"
            result += "3. Upload design system to Open Design\n\n"
          }

          result += "**Next steps:** Execute the scripts above in order. The agent will handle the workflow.\n"

          return {
            title: `sync-od: ${mode}`,
            output: result,
          }
        },
      }),
    },

    // ─── Secret guard (replaces hooks/ods-guard.mjs) ───
    // Blocks secret-bearing content from being synced to Open Design
    "tool.execute.before": async (input, output) => {
      const SECRET =
        /(api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i

      // Check tool inputs for secrets
      if (input.tool === "edit" || input.tool === "write") {
        const content =
          output.args?.content ?? output.args?.newString ?? ""
        if (SECRET.test(content)) {
          throw new Error(
            "[sync-od] Refusing: content looks like it contains a secret. Remove it before syncing to Open Design."
          )
        }
      }

      // Check bash commands for secrets
      if (input.tool === "bash") {
        const cmd = output.args?.command ?? ""
        if (SECRET.test(cmd)) {
          throw new Error(
            "[sync-od] Refusing: command looks like it contains a secret. Remove it before syncing to Open Design."
          )
        }
      }
    },

    // ─── Drift detection (replaces hooks/ods-drift.mjs) ───
    // Logs when tracked design-sync files are edited
    event: async ({ event }) => {
      // Only handle file.edited events
      if (event.type !== "file.edited") return

      const filePath = event.properties?.file ?? ""
      if (!filePath) return

      const manifestPath = join(directory, ".design-sync", "manifest.json")
      if (!existsSync(manifestPath)) return

      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
        const pairs = manifest.pairs ?? []
        const normalizedPath = filePath.replace(/\\/g, "/")

        const isTracked = pairs.some((p: { src: string }) => {
          const srcFile = p.src.replace(/\\/g, "/").split("/").pop() ?? ""
          return normalizedPath.endsWith(srcFile)
        })

        if (isTracked) {
          const journalPath = join(directory, ".design-sync", "JOURNAL.md")
          appendFileSync(journalPath, `drift: ${filePath} edited\n`)
        }
      } catch {
        // Silent fail — manifest parse errors are non-critical
      }
    },
  }
}

export default SyncOd
export { SyncOd }
