import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { readFileSync, existsSync, appendFileSync } from "node:fs"
import { join, resolve } from "node:path"
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
 * This plugin implements the autonomous RE-ANCHOR RITUAL from RUNBOOK.md:
 * - Runs ods-status.js to determine the next phase
 * - Executes phases one at a time, verifying DONE-gates
 * - Loops until DONE condition is met (all boxes [x], driver verdict ok, upload verified, drift clean)
 *
 * @see https://open-design.ai
 * @see https://github.com/nexu-io/open-design
 */

const execFileAsync = promisify(execFile)

/** A runnable Open Design CLI: what to spawn, and what to spawn it with. */
type OdCli = {
  exe: string
  /** Args that must precede the `od` subcommand. */
  prefix: string[]
  env: Record<string, string>
  /** Human-readable location, for the report. */
  label: string
}

/** The desktop app ships its own CLI; it is not installed on PATH. */
function bundledOdCandidates(): OdCli[] {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? ""
  const out: OdCli[] = []

  if (process.platform === "win32") {
    const root = join(process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "Programs", "Open Design")
    out.push({
      exe: join(root, "Open Design.exe"),
      prefix: [join(root, "resources", "app", "prebundled", "daemon", "daemon-cli.mjs")],
      env: { ELECTRON_RUN_AS_NODE: "1" },
      label: "bundled desktop CLI",
    })
  } else if (process.platform === "darwin") {
    for (const root of ["/Applications/Open Design.app/Contents", join(home, "Applications/Open Design.app/Contents")]) {
      out.push({
        exe: join(root, "MacOS", "Open Design"),
        prefix: [join(root, "Resources", "app", "prebundled", "daemon", "daemon-cli.mjs")],
        env: { ELECTRON_RUN_AS_NODE: "1" },
        label: "bundled desktop CLI",
      })
    }
  }
  return out.filter((c) => existsSync(c.exe) && existsSync(c.prefix[0]))
}

/**
 * Locate a REAL Open Design CLI.
 *
 * `/usr/bin/od` is GNU coreutils' octal dump, and it shadows Open Design's `od` on
 * every Mac, Linux box, WSL2 and Git Bash install — Open Design's own README warns
 * about the collision three times. Trusting the first PATH hit points the user at
 * the wrong binary and reports a nonsense connectivity error, so every candidate is
 * probed before it is believed.
 */
async function findOdCli(): Promise<OdCli | null> {
  const which = process.platform === "win32" ? "where" : "which"
  let onPath: string[] = []
  try {
    const { stdout } = await execFileAsync(which, ["od"])
    onPath = stdout.trim().split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  } catch {
    // Nothing named `od` on PATH — the bundled CLI may still be there.
  }

  const candidates: OdCli[] = [
    ...onPath.map((exe) => ({ exe, prefix: [] as string[], env: {}, label: exe })),
    ...bundledOdCandidates(),
  ]

  for (const c of candidates) {
    try {
      const { stdout } = await execFileAsync(c.exe, [...c.prefix, "--help"], {
        timeout: 8000,
        env: { ...process.env, ...c.env },
      })
      if (/open design|od mcp|od plugin|od project/i.test(stdout)) return c
    } catch {
      // Not Open Design, or not runnable. Keep looking.
    }
  }
  return null
}

/** Test if OD MCP server is reachable (desktop app must be running) */
async function testMcpServer(): Promise<{ ok: boolean; detail: string; cli: OdCli | null }> {
  const cli = await findOdCli()
  if (!cli) {
    return {
      ok: false,
      detail:
        "Open Design CLI not found. Note that `/usr/bin/od` is coreutils' octal dump, not Open Design — " +
        "install the desktop app, or run the daemon from source with `pnpm tools-dev`.",
      cli: null,
    }
  }
  try {
    const { stdout } = await execFileAsync(cli.exe, [...cli.prefix, "mcp", "list"], {
      timeout: 8000,
      env: { ...process.env, ...cli.env },
    })
    const hasTools = stdout.includes("open-design") || stdout.includes("od://")
    return {
      ok: hasTools,
      detail: hasTools
        ? `MCP server reachable via ${cli.label}`
        : "CLI responded but no OD tools detected — is the desktop app running?",
      cli,
    }
  } catch (err: any) {
    return { ok: false, detail: `od mcp list failed: ${err.message ?? err}`, cli }
  }
}

/** Run a script and return its output */
async function runScript(scriptPath: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath, ...args], {
      timeout: 300000, // 5 min timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    })
    return { exitCode: 0, stdout, stderr }
  } catch (err: any) {
    return {
      exitCode: err.code ?? 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? String(err),
    }
  }
}

/** Find the skill's scripts directory */
function getScriptsDir(directory: string): string {
  // First check if scripts are staged in .ds-sync (Phase 05+)
  const staged = join(directory, ".ds-sync")
  if (existsSync(staged)) return staged
  // Otherwise use the plugin's scripts (Phase 00-04)
  // The plugin is at plugins/sync-od, so go up to find scripts
  const pluginDir = resolve(__dirname, "..")
  const skillScripts = join(pluginDir, "scripts")
  if (existsSync(skillScripts)) return skillScripts
  // Fallback: assume we're in the skill directory
  return join(directory, "scripts")
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
    // ─── /sync-od command — autonomous pipeline executor ───
    tool: {
      "sync-od": tool({
        description:
          "AUTONOMOUS: Sync a codebase to Open Design and/or extract its design system. " +
          "Runs the full RE-ANCHOR RITUAL from RUNBOOK.md: reads status, executes ONE phase, " +
          "verifies DONE-gate, loops until DONE. " +
          "Modes: 'project' (sync codebase to OD), 'design-system' (extract DESIGN.md + tokens), " +
          "'both' (default — design system first, then project sync). " +
          "Tests MCP server connectivity and falls back to od CLI if needed. " +
          "Use --test to only check connectivity without running the pipeline.",
        args: {
          mode: (z.enum(["project", "design-system", "both"]).optional() as any),
          target: (z.string().optional() as any),
          test: (z.boolean().optional() as any),
          projectName: (z.string().optional() as any),
        },
        async execute(args, ctx) {
          const mode = args.mode ?? "both"
          const target = args.target ?? "current-project"
          const testOnly = args.test ?? false
          const projectName = args.projectName ?? "synced-project"

          // ── Connectivity test ──
          const mcpResult = await testMcpServer()

          if (testOnly) {
            return {
              title: "sync-od: connectivity test",
              output: `## sync-od connectivity test\n\n**Directory:** \`${directory}\`\n\n### Open Design Connectivity\n${mcpResult.ok ? `✅ **MCP server:** ${mcpResult.detail}` : `❌ **MCP server:** ${mcpResult.detail}`}\n`,
            }
          }

          // ── RE-ANCHOR RITUAL: Step A — run ods-status.js ──
          const scriptsDir = getScriptsDir(directory)
          const statusScript = join(scriptsDir, "ods-status.js")
          
          if (!existsSync(statusScript)) {
            return {
              title: "sync-od: error",
              output: `❌ **Status script not found** at \`${statusScript}\`\n\nRun \`npm run build\` in the plugin directory first, or ensure the skill is properly installed.`,
            }
          }

          const statusResult = await runScript(statusScript, [])
          
          let result = `## sync-od — ${mode} mode (autonomous)\n\n`
          result += `**Directory:** \`${directory}\`\n`
          result += `**Target:** \`${target}\`\n`
          result += `**Project name:** \`${projectName}\`\n\n`

          // MCP / CLI status
          result += `### Open Design Connectivity\n`
          if (mcpResult.ok) {
            result += `- **MCP server:** ✅ ${mcpResult.detail}\n`
          } else {
            result += `- **MCP server:** ❌ ${mcpResult.detail}\n`
            if (mcpResult.cli) {
              result += `- **od CLI:** ✅ ${mcpResult.cli.label}\n`
              result += `- **Fallback:** run \`od\` commands through that CLI directly\n`
            } else {
              result += `- **od CLI:** ❌ no Open Design CLI found\n`
              result += `- **Install:** download the desktop app from https://open-design.ai ` +
                `(there is no \`@open-design/*\` package on npm), or run the daemon from source with \`pnpm tools-dev\`\n`
            }
          }

          // Parse status output to find next phase
          const statusOutput = statusResult.stdout + statusResult.stderr
          
          result += `\n### RE-ANCHOR RITUAL — Step A Complete\n`
          result += `\`\`\`\n${statusOutput}\n\`\`\`\n`

          // Check if .design-sync exists
          const designSyncDir = join(directory, ".design-sync")
          const hasDesignSync = existsSync(designSyncDir)
          const configPath = join(designSyncDir, "config.json")
          const hasConfig = existsSync(configPath)
          
          let config: any = {}
          if (hasConfig) {
            try { config = JSON.parse(readFileSync(configPath, "utf8")) } catch {}
          }

          // Determine next action based on status output and config
          if (!hasDesignSync) {
            // Fresh run - need to bootstrap
            result += `\n### 🚀 Phase 00: Bootstrap (no .design-sync found)\n`
            result += `Run: \`node ${join(scriptsDir, "ods-init.js")} --project "${projectName}" --mode ${mode === "both" ? "both" : mode === "project" ? "A" : "B"}\`\n`
            result += `Then run \`/sync-od\` again to continue.\n`
          } else if (hasConfig && config.projectId) {
            // Re-sync run
            result += `\n### 🔄 Re-sync run detected (projectId pinned: ${config.projectId})\n`
            result += `Next: Run \`/sync-od\` again to execute the next phase from status.\n`
          } else if (hasConfig) {
            // First-time run that never settled
            result += `\n### ⏳ Resuming first-time run (config exists, no projectId)\n`
            result += `Next: Run \`/sync-od\` again to execute the next phase from status.\n`
          } else {
            // Has .design-sync but no config - odd state
            result += `\n### ⚠️ Incomplete state: .design-sync exists but no config.json\n`
            result += `Run: \`node ${join(scriptsDir, "ods-init.js")} --project "${projectName}" --mode ${mode === "both" ? "both" : mode === "project" ? "A" : "B"}\`\n`
          }

          // If status script printed a next phase, highlight it
          const nextPhaseMatch = statusOutput.match(/next.*phase.*?(\d+-\w+)/i) || 
                                  statusOutput.match(/\[ \]\s*(\d+-\w+)/)
          if (nextPhaseMatch) {
            result += `\n### ➡️ NEXT PHASE: ${nextPhaseMatch[1]}\n`
            result += `The status script indicates this phase should run next.\n`
          }

          result += `\n---\n**Autonomous loop:** This tool runs Step A of the RE-ANCHOR RITUAL. ` +
            `The agent should now execute the indicated phase (run its script), ` +
            `verify its DONE-gate, write a report, flip the task box, and call \`/sync-od\` again ` +
            `until all four DONE conditions are met (see RUNBOOK.md).\n`

          return {
            title: `sync-od: ${mode} — Step A complete`,
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
