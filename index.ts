import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { readFileSync, existsSync, appendFileSync } from "node:fs"
import { join } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { z } from "zod"

/**
 * sync-od — OpenDesign Sync Plugin for OpenCode
 *
 * Syncs any codebase to Open Design AND/OR extracts
 * its design system. Script-driven, adversarial grading, bidirectional
 * sync with managed blocks.
 *
 * Includes MCP server connectivity test with `od` CLI fallback.
 *
 * @see https://open-design.ai
 * @see https://github.com/nexu-io/open-design
 */

const execFileAsync = promisify(execFile)

/** Cross-platform: detect `od` binary on PATH */
async function findOdCli(): Promise<string | null> {
  const cmd = process.platform === "win32" ? "where" : "which"
  try {
    const { stdout } = await execFileAsync(cmd, ["od"])
    return stdout.trim().split("\n")[0] ?? null
  } catch {
    return null
  }
}

/** Test if OD MCP server is reachable (desktop app must be running) */
async function testMcpServer(): Promise<{ ok: boolean; detail: string }> {
  const odPath = await findOdCli()
  if (!odPath) {
    return { ok: false, detail: "od CLI not found on PATH" }
  }
  try {
    const { stdout } = await execFileAsync(odPath, ["mcp", "list"], {
      timeout: 8000,
    })
    const hasTools = stdout.includes("open-design") || stdout.includes("od://")
    return {
      ok: hasTools,
      detail: hasTools
        ? "MCP server reachable"
        : "od CLI responded but no OD tools detected — is the desktop app running?",
    }
  } catch (err: any) {
    return {
      ok: false,
      detail: `od mcp list failed: ${err.message ?? err}`,
    }
  }
}

const SyncOd: Plugin = async ({ project, directory, worktree, $, client }) => {
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
          "'both' (default — design system first, then project sync). " +
          "Tests MCP server connectivity and falls back to od CLI if needed.",
        args: {
          mode: (z.enum(["project", "design-system", "both"]).optional() as any),
          target: (z.string().optional() as any),
          test: (z.boolean().optional() as any),
        },
        async execute(args, ctx) {
          const mode = args.mode ?? "both"
          const target = args.target ?? "current-project"
          const testOnly = args.test ?? false

          // ── Connectivity test ──
          const mcpResult = await testMcpServer()

          let result = `## sync-od — ${mode} mode\n\n`
          result += `**Directory:** \`${directory}\`\n`
          result += `**Target:** \`${target}\`\n`

          // MCP / CLI status
          result += `\n### Open Design Connectivity\n`
          if (mcpResult.ok) {
            result += `- **MCP server:** ✅ ${mcpResult.detail}\n`
          } else {
            result += `- **MCP server:** ❌ ${mcpResult.detail}\n`
            const odPath = await findOdCli()
            if (odPath) {
              result += `- **od CLI:** ✅ found at \`${odPath}\`\n`
              result += `- **Fallback:** Use \`od\` CLI commands directly\n`
            } else {
              result += `- **od CLI:** ❌ not found on PATH\n`
              result += `- **Install:** \`npm install -g @open-design/cli\` or download from https://open-design.ai\n`
            }
          }

          if (testOnly) {
            return { title: "sync-od: connectivity test", output: result }
          }

          // ── .design-sync status ──
          const designSyncDir = join(directory, ".design-sync")
          const hasDesignSync = existsSync(designSyncDir)
          const manifestPath = join(designSyncDir, "manifest.json")
          const hasManifest = existsSync(manifestPath)

          result += `\n### Local State\n`
          result += `- **.design-sync:** ${hasDesignSync ? "initialized" : "not found — run \`node scripts/ods-init.js\` first"}\n`
          result += `- **Manifest:** ${hasManifest ? "found" : "not found"}\n`

          // ── Sync steps ──
          if (mode === "project" || mode === "both") {
            result += `\n### Project Sync\n`
            result += "1. Run `node scripts/ods-detect.js` to detect stack\n"
            result += "2. Run `node scripts/ods-build.js` to build OD-safe bundle\n"
            result += "3. Run `node scripts/ods-validate.js` to validate\n"
            result += "4. Run `node scripts/ods-upload-plan.js` to plan upload\n"
            if (mcpResult.ok) {
              result += "5. Upload via MCP server tools\n"
            } else {
              result += "5. Upload via `od` CLI or manual paste into OD desktop app\n"
            }
          }

          if (mode === "design-system" || mode === "both") {
            result += `\n### Design System Sync\n`
            result += "1. Run `node scripts/ods-extract-tokens.js` to extract tokens\n"
            result += "2. Run `node scripts/ods-build-design-system.js` to build DESIGN.md\n"
            if (mcpResult.ok) {
              result += "3. Upload via MCP server tools\n"
            } else {
              result += "3. Upload via `od` CLI or manual paste into OD desktop app\n"
            }
          }

          result += "\n**Next steps:** Execute the scripts above in order.\n"

          return {
            title: `sync-od: ${mode}`,
            output: result,
          }
        },
      }),
    },

    // ─── Secret guard ───
    "tool.execute.before": async (input, output) => {
      const SECRET =
        /(api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i

      if (input.tool === "edit" || input.tool === "write") {
        const content =
          output.args?.content ?? output.args?.newString ?? ""
        if (SECRET.test(content)) {
          throw new Error(
            "[sync-od] Refusing: content looks like it contains a secret. Remove it before syncing to Open Design."
          )
        }
      }

      if (input.tool === "bash") {
        const cmd = output.args?.command ?? ""
        if (SECRET.test(cmd)) {
          throw new Error(
            "[sync-od] Refusing: command looks like it contains a secret. Remove it before syncing to Open Design."
          )
        }
      }
    },

    // ─── Drift detection ───
    event: async ({ event }) => {
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
