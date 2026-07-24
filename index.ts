import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync, existsSync, appendFileSync } from "node:fs"
import { join } from "node:path"

/**
 * sync-od — OpenDesign Sync Plugin for OpenCode
 *
 * Syncs any codebase to your self-hosted Open Design MCP AND/OR extracts
 * its design system. Script-driven, adversarial grading, bidirectional
 * sync with managed blocks.
 *
 * @see https://skills.ross-developers.com
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
