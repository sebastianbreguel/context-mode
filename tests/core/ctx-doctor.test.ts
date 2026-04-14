/**
 * Regression tests for ctx_doctor resource cleanup (#247).
 *
 * Reported bug: calling ctx_doctor mid-session caused MCP error -32000
 * "Connection closed" on Linux under concurrent context-mode processes.
 * Fix bb6552d wrapped the FTS5 test DB and testExecutor in finally blocks
 * so they are always cleaned up, even on exception paths.
 *
 * These tests lock that behavior by spawning the real MCP server over stdio
 * (same as Claude Code does) and invoking the ctx_doctor tool:
 *   1. Once — must return a markdown checklist and not crash the server.
 *   2. Three times concurrently — the exact repro scenario from the issue
 *      (3 context-mode processes were running at time of crash).
 *
 * Run: npx vitest run tests/core/ctx-doctor.test.ts
 */

import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { describe, test, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const entry = resolve(projectRoot, "start.mjs");

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: {
    content?: Array<{ type: string; text: string }>;
    isError?: boolean;
    serverInfo?: { name: string; version: string };
  };
  error?: { code: number; message: string };
}

function startServer(): ChildProcess {
  return spawn("node", [entry], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, CONTEXT_MODE_DISABLE_VERSION_CHECK: "1" },
  });
}

function send(proc: ChildProcess, msg: Record<string, unknown>): void {
  proc.stdin!.write(JSON.stringify(msg) + "\n");
}

function collectResponses(proc: ChildProcess, timeoutMs: number): Promise<JsonRpcResponse[]> {
  return new Promise((resolveCollect) => {
    let buffer = "";
    proc.stdout!.on("data", (d: Buffer) => {
      buffer += d.toString();
    });
    setTimeout(() => {
      try {
        proc.kill("SIGTERM");
      } catch {
        /* best effort */
      }
      const responses = buffer
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => {
          try {
            return JSON.parse(l) as JsonRpcResponse;
          } catch {
            return null;
          }
        })
        .filter((r): r is JsonRpcResponse => r !== null && typeof r.id === "number");
      resolveCollect(responses);
    }, timeoutMs);
  });
}

async function initAndCallDoctor(proc: ChildProcess, invocations: number, windowMs = 8000): Promise<JsonRpcResponse[]> {
  send(proc, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "ctx-doctor-regression", version: "1.0" },
    },
  });
  send(proc, { jsonrpc: "2.0", method: "notifications/initialized" });
  for (let i = 0; i < invocations; i++) {
    send(proc, {
      jsonrpc: "2.0",
      id: 100 + i,
      method: "tools/call",
      params: { name: "ctx_doctor", arguments: {} },
    });
  }
  return collectResponses(proc, windowMs);
}

// ═══════════════════════════════════════════════════════════════════════════
// ctx_doctor regression suite (#247)
// ═══════════════════════════════════════════════════════════════════════════

describe("ctx_doctor — resource cleanup regression (#247)", () => {
  test.skipIf(!existsSync(entry))("entry point start.mjs exists", () => {
    expect(existsSync(entry)).toBe(true);
  });

  test("single ctx_doctor call returns a markdown checklist", async () => {
    const proc = startServer();
    const responses = await initAndCallDoctor(proc, 1);
    const call = responses.find((r) => r.id === 100);
    expect(call).toBeDefined();
    expect(call!.error).toBeUndefined();
    const text = call!.result?.content?.[0]?.text ?? "";
    expect(text).toContain("context-mode doctor");
    // Core checks the fix guards against leaks for:
    expect(text).toMatch(/Server test:/);
    expect(text).toMatch(/FTS5 \/ SQLite:/);
  }, 20_000);

  test("three concurrent ctx_doctor calls all succeed without crashing the server", async () => {
    const proc = startServer();
    const responses = await initAndCallDoctor(proc, 3, 12_000);
    const calls = [100, 101, 102].map((id) => responses.find((r) => r.id === id));
    // All three must return. If the fix regresses, better-sqlite3 segfaults
    // tear down the MCP stdio process and at least one response is missing.
    for (const c of calls) {
      expect(c, "missing ctx_doctor response — server likely crashed").toBeDefined();
      expect(c!.error).toBeUndefined();
      expect(c!.result?.content?.[0]?.text).toContain("context-mode doctor");
    }
  }, 25_000);
});
