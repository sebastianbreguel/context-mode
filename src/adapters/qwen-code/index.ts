/**
 * adapters/qwen-code — Qwen Code platform adapter.
 *
 * Extends ClaudeCodeBaseAdapter (shared wire-protocol parse/format methods)
 * with Qwen Code-specific configuration, diagnostics, and session ID logic.
 *
 * Differences from Claude Code:
 *   - Config dir: ~/.qwen/ (not ~/.claude/)
 *   - Env vars: QWEN_PROJECT_DIR, QWEN_SESSION_ID (not CLAUDE_*)
 *   - Session ID priority: session_id field first (Claude: transcript_path first)
 *   - No plugin registry (Qwen uses settings.json directly)
 *   - MCP clientInfo: qwen-cli-mcp-client-* (pattern)
 *   - 12 hook events (superset of Claude's 5, but context-mode uses the shared 5)
 */

import {
  readFileSync,
  existsSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

import { ClaudeCodeBaseAdapter, type ClaudeCodeWireInput } from "../claude-code-base.js";

import type {
  HookAdapter,
  HookParadigm,
  PlatformCapabilities,
  DiagnosticResult,
  HookRegistration,
} from "../types.js";

// ─────────────────────────────────────────────────────────
// Adapter implementation
// ─────────────────────────────────────────────────────────

export class QwenCodeAdapter extends ClaudeCodeBaseAdapter implements HookAdapter {
  constructor() {
    super([".qwen"]);
  }

  readonly name = "Qwen Code";
  readonly paradigm: HookParadigm = "json-stdio";
  protected readonly projectDirEnvVar = "QWEN_PROJECT_DIR";

  readonly capabilities: PlatformCapabilities = {
    preToolUse: true,
    postToolUse: true,
    preCompact: true,
    sessionStart: true,
    canModifyArgs: true,
    canModifyOutput: true,
    canInjectSessionContext: true,
  };

  // ── Configuration (differs from Claude Code) ───────────

  getSettingsPath(): string {
    return resolve(homedir(), ".qwen", "settings.json");
  }

  generateHookConfig(pluginRoot: string): HookRegistration {
    // Qwen Code passes native tool names in hook stdin (verified from
    // packages/core/src/tools/tool-names.ts). Claude-style names (Bash, Read)
    // are only accepted in permission configs, NOT in hook tool_name payloads.
    const preToolUseMatcher = [
      // Qwen-native names (canonical tool_name in hook stdin)
      "run_shell_command", "read_file", "read_many_files", "grep_search",
      "web_fetch", "agent",
      // MCP tools (same naming convention as Claude Code)
      "mcp__plugin_context-mode_context-mode__ctx_execute",
      "mcp__plugin_context-mode_context-mode__ctx_execute_file",
      "mcp__plugin_context-mode_context-mode__ctx_batch_execute",
    ].join("|");

    return {
      PreToolUse: [
        {
          matcher: preToolUseMatcher,
          hooks: [
            { type: "command", command: `node ${pluginRoot}/hooks/pretooluse.mjs` },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: "",
          hooks: [
            { type: "command", command: `node ${pluginRoot}/hooks/posttooluse.mjs` },
          ],
        },
      ],
      SessionStart: [
        {
          matcher: "",
          hooks: [
            { type: "command", command: `node ${pluginRoot}/hooks/sessionstart.mjs` },
          ],
        },
      ],
      PreCompact: [
        {
          matcher: "",
          hooks: [
            { type: "command", command: `node ${pluginRoot}/hooks/precompact.mjs` },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          matcher: "",
          hooks: [
            { type: "command", command: `node ${pluginRoot}/hooks/userpromptsubmit.mjs` },
          ],
        },
      ],
    };
  }

  // ── Settings read/write ────────────────────────────────

  readSettings(): Record<string, unknown> | null {
    try {
      const raw = readFileSync(this.getSettingsPath(), "utf-8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  writeSettings(settings: Record<string, unknown>): void {
    const { writeFileSync } = require("node:fs");
    writeFileSync(this.getSettingsPath(), JSON.stringify(settings, null, 2));
  }

  // ── Diagnostics (doctor) ───────────────────────────────

  validateHooks(_pluginRoot: string): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    const settings = this.readSettings();
    const hooks = (settings?.hooks ?? {}) as Record<string, unknown>;

    for (const hookName of ["PreToolUse", "PostToolUse", "SessionStart", "PreCompact", "UserPromptSubmit"]) {
      const configured = Array.isArray(hooks[hookName]) && (hooks[hookName] as unknown[]).length > 0;
      results.push({
        check: `${hookName} hook`,
        status: configured ? "pass" : "fail",
        message: configured
          ? `${hookName} hook configured in ~/.qwen/settings.json`
          : `${hookName} hook not found in ~/.qwen/settings.json`,
        ...(configured ? {} : { fix: `Add ${hookName} hook to ~/.qwen/settings.json` }),
      });
    }

    return results;
  }

  checkPluginRegistration(): DiagnosticResult {
    // Qwen Code has no plugin registry — check for MCP config instead
    try {
      const settings = this.readSettings();
      if (settings?.mcpServers && typeof settings.mcpServers === "object") {
        const servers = settings.mcpServers as Record<string, unknown>;
        if (Object.keys(servers).some(k => k.includes("context-mode"))) {
          return {
            check: "Plugin registration",
            status: "pass",
            message: "context-mode found in mcpServers",
          };
        }
        return {
          check: "Plugin registration",
          status: "fail",
          message: "mcpServers exists but context-mode not found",
          fix: "Add context-mode to mcpServers in ~/.qwen/settings.json",
        };
      }
      return {
        check: "Plugin registration",
        status: "warn",
        message: "No mcpServers in ~/.qwen/settings.json",
      };
    } catch {
      return {
        check: "Plugin registration",
        status: "warn",
        message: "Could not read ~/.qwen/settings.json",
      };
    }
  }

  getInstalledVersion(): string {
    return "not installed";
  }

  configureAllHooks(_pluginRoot: string): string[] {
    return [];
  }

  setHookPermissions(_pluginRoot: string): string[] {
    return [];
  }

  updatePluginRegistry(_pluginRoot: string, _version: string): void {
    // No plugin registry in Qwen Code
  }

  getRoutingInstructionsConfig() {
    const instructionsPath = resolve(
      join(homedir(), ".qwen", "QWEN.md"),
    );
    return {
      instructionsPath,
      targetPath: "QWEN.md",
      platformName: "Qwen Code",
    };
  }

  // ── Session ID extraction (differs from Claude Code) ───
  // Qwen Code prioritizes session_id field, then QWEN_SESSION_ID env var.
  // Claude Code prioritizes transcript_path UUID first.

  protected extractSessionId(input: ClaudeCodeWireInput): string {
    if (input.session_id) return input.session_id;
    if (input.transcript_path) {
      const match = input.transcript_path.match(
        /([a-f0-9-]{36})\.jsonl$/,
      );
      if (match) return match[1];
    }
    if (process.env.QWEN_SESSION_ID) return process.env.QWEN_SESSION_ID;
    return `pid-${process.ppid}`;
  }
}
