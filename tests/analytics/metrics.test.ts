/**
 * Analytics Metrics — Tests for AnalyticsEngine
 *
 * Tests runtime metric computation (static helpers) and queryAll()
 * against an in-memory SessionDB.
 *
 * Schema: session_events, session_meta, session_resume
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { AnalyticsEngine } from "../../src/session/analytics.js";

// ─────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────

/** Schema matching src/session/db.ts */
function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 2,
      data TEXT NOT NULL,
      source_hook TEXT NOT NULL,
      bytes_avoided INTEGER NOT NULL DEFAULT 0,
      bytes_returned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      data_hash TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_session_events_type ON session_events(session_id, type);
    CREATE INDEX IF NOT EXISTS idx_session_events_priority ON session_events(session_id, priority);

    CREATE TABLE IF NOT EXISTS session_meta (
      session_id TEXT PRIMARY KEY,
      project_dir TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_event_at TEXT,
      event_count INTEGER NOT NULL DEFAULT 0,
      compact_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS session_resume (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      snapshot TEXT NOT NULL,
      event_count INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      consumed INTEGER NOT NULL DEFAULT 0
    );
  `);
}

interface InsertEventParams {
  session_id: string;
  type: string;
  category: string;
  priority?: number;
  data: string;
  source_hook?: string;
  created_at?: string;
  data_hash?: string;
  bytes_avoided?: number;
  bytes_returned?: number;
}

function insertEvent(db: Database.Database, params: InsertEventParams): void {
  db.prepare(`
    INSERT INTO session_events (session_id, type, category, priority, data, source_hook, bytes_avoided, bytes_returned, created_at, data_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.session_id,
    params.type,
    params.category,
    params.priority ?? 2,
    params.data,
    params.source_hook ?? "PostToolUse",
    params.bytes_avoided ?? 0,
    params.bytes_returned ?? 0,
    params.created_at ?? new Date().toISOString().replace("T", " ").slice(0, 19),
    params.data_hash ?? "",
  );
}

function insertSession(
  db: Database.Database,
  sessionId: string,
  projectDir: string,
  startedAt: string,
  lastEventAt: string | null = null,
  eventCount: number = 0,
  compactCount: number = 0,
): void {
  db.prepare(`
    INSERT INTO session_meta (session_id, project_dir, started_at, last_event_at, event_count, compact_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, projectDir, startedAt, lastEventAt, eventCount, compactCount);
}

// ═══════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════

describe("Analytics Metrics", () => {
  let db: Database.Database;
  let engine: AnalyticsEngine;
  const SESSION_ID = "test-session-001";
  const PROJECT_DIR = "/Users/dev/my-project";

  beforeEach(() => {
    db = new Database(":memory:");
    createSchema(db);
    engine = new AnalyticsEngine(db);
  });

  afterEach(() => {
    db.close();
  });

  // ─── Runtime Metrics (static helpers) ──────────────────

  describe("Runtime Metrics", () => {
    it("#1 Context savings — computes saved bytes and percentage", () => {
      const savings = AnalyticsEngine.contextSavingsTotal(847_000, 3_600);

      expect(savings.rawBytes).toBe(847_000);
      expect(savings.contextBytes).toBe(3_600);
      expect(savings.savedBytes).toBe(843_400);
      expect(savings.savedPercent).toBe(99.6);
    });

    it("#1 Context savings — 0% when no raw bytes", () => {
      const savings = AnalyticsEngine.contextSavingsTotal(0, 0);
      expect(savings.savedPercent).toBe(0);
      expect(savings.savedBytes).toBe(0);
    });

    it("#1 Context savings — handles edge case where context > raw", () => {
      // This shouldn't happen in practice, but defensive
      const savings = AnalyticsEngine.contextSavingsTotal(100, 200);
      expect(savings.savedBytes).toBe(-100);
      expect(savings.savedPercent).toBe(-100);
    });

    it("#2 Think in Code comparison — computes file-to-output ratio", () => {
      const comparison = AnalyticsEngine.thinkInCodeComparison(50_000, 2_000);

      expect(comparison.fileBytes).toBe(50_000);
      expect(comparison.outputBytes).toBe(2_000);
      expect(comparison.ratio).toBe(25); // 50K/2K = 25x
    });

    it("#2 Think in Code — handles zero output", () => {
      const comparison = AnalyticsEngine.thinkInCodeComparison(10_000, 0);
      expect(comparison.ratio).toBe(0);
    });

    it("#3 Tool-based savings — per-tool breakdown", () => {
      const tools = [
        { tool: "batch_execute", rawBytes: 500_000, contextBytes: 2_000 },
        { tool: "execute", rawBytes: 200_000, contextBytes: 1_000 },
        { tool: "search", rawBytes: 100_000, contextBytes: 500 },
      ];

      const savings = AnalyticsEngine.toolSavings(tools);
      expect(savings).toHaveLength(3);

      expect(savings[0].tool).toBe("batch_execute");
      expect(savings[0].savedBytes).toBe(498_000);

      expect(savings[1].tool).toBe("execute");
      expect(savings[1].savedBytes).toBe(199_000);

      expect(savings[2].tool).toBe("search");
      expect(savings[2].savedBytes).toBe(99_500);
    });

    it("#3 Tool-based savings — empty array when no tools", () => {
      expect(AnalyticsEngine.toolSavings([])).toHaveLength(0);
    });

    it("#19 Sandbox I/O — tracks input and output bytes", () => {
      const io = AnalyticsEngine.sandboxIO(847_000, 3_600);

      expect(io.inputBytes).toBe(847_000);
      expect(io.outputBytes).toBe(3_600);
    });

    it("#19 Sandbox I/O — zero values for unused sandbox", () => {
      const io = AnalyticsEngine.sandboxIO(0, 0);
      expect(io.inputBytes).toBe(0);
      expect(io.outputBytes).toBe(0);
    });
  });

  // ─── queryAll — unified report ─────────────────────────

  describe("queryAll", () => {
    const runtimeStats = {
      bytesReturned: { ctx_execute: 1024, ctx_search: 512 },
      bytesIndexed: 50_000,
      bytesSandboxed: 100_000,
      calls: { ctx_execute: 5, ctx_search: 3 },
      sessionStart: Date.now() - 60_000 * 10, // 10 min ago
      cacheHits: 0,
      cacheBytesSaved: 0,
    };

    it("returns savings from runtime stats", () => {
      const report = engine.queryAll(runtimeStats);

      expect(report.savings.total_calls).toBe(8);
      expect(report.savings.kept_out).toBe(150_000);
      expect(report.savings.total_bytes_returned).toBe(1536);
      expect(report.savings.by_tool).toHaveLength(2);
    });

    it("returns session with uptime_min", () => {
      const report = engine.queryAll(runtimeStats);
      expect(report.session.uptime_min).toBeDefined();
      expect(parseFloat(report.session.uptime_min)).toBeGreaterThan(0);
    });

    it("returns continuity data from DB", () => {
      insertSession(db, SESSION_ID, PROJECT_DIR, "2026-04-04 10:00:00", null, 0, 2);
      insertEvent(db, { session_id: SESSION_ID, type: "tool_use", category: "file", data: "src/app.ts" });
      insertEvent(db, { session_id: SESSION_ID, type: "tool_use", category: "git", data: "git commit" });

      const report = engine.queryAll(runtimeStats);
      expect(report.continuity.total_events).toBe(2);
      expect(report.continuity.compact_count).toBe(2);
      expect(report.continuity.by_category).toHaveLength(2);
    });

    it("includes cache when cache stats are present", () => {
      const statsWithCache = {
        ...runtimeStats,
        cacheHits: 3,
        cacheBytesSaved: 25_000,
      };
      const report = engine.queryAll(statsWithCache);
      expect(report.cache).toBeDefined();
      expect(report.cache!.hits).toBe(3);
      expect(report.cache!.bytes_saved).toBe(25_000);
    });

    it("omits cache when no cache activity", () => {
      const report = engine.queryAll(runtimeStats);
      expect(report.cache).toBeUndefined();
    });

    it("works with empty DB", () => {
      const report = engine.queryAll(runtimeStats);
      expect(report.session.id).toBe("");
      expect(report.continuity.total_events).toBe(0);
      expect(report.continuity.compact_count).toBe(0);
    });
  });

  // ─── MCP tool usage ────────────────────────────────────

  describe("getMcpToolUsage", () => {
    it("returns median+max concurrency for batch tools", () => {
      // Insert mcp_tool_call rows with varied concurrency values for the same
      // tool and one row for a tool without a concurrency param.
      const concurrencies = [4, 8, 6, 8]; // median = (6+8)/2 = 7, max = 8
      for (const c of concurrencies) {
        insertEvent(db, {
          session_id: SESSION_ID,
          type: "mcp_tool_call",
          category: "mcp_tool_call",
          priority: 4,
          data: JSON.stringify({
            tool_name: "mcp__context-mode__ctx_batch_execute",
            params: { commands: [], concurrency: c },
          }),
        });
      }
      // Tool without a concurrency param — should report nulls
      insertEvent(db, {
        session_id: SESSION_ID,
        type: "mcp_tool_call",
        category: "mcp_tool_call",
        priority: 4,
        data: JSON.stringify({
          tool_name: "mcp__context-mode__ctx_search",
          params: { queries: ["foo"] },
        }),
      });
      // Truncated row — must be counted as a call but skipped for concurrency
      insertEvent(db, {
        session_id: SESSION_ID,
        type: "mcp_tool_call",
        category: "mcp_tool_call",
        priority: 4,
        data: JSON.stringify({
          tool_name: "mcp__context-mode__ctx_batch_execute",
          params_raw: '{"commands":[{"label":"x"',
          truncated: true,
        }),
      });

      const usage = engine.getMcpToolUsage();

      const batch = usage.find((u) => u.tool_name === "mcp__context-mode__ctx_batch_execute");
      expect(batch).toBeDefined();
      expect(batch!.calls).toBe(5); // 4 normal + 1 truncated
      expect(batch!.median_concurrency).toBe(7);
      expect(batch!.max_concurrency).toBe(8);

      const search = usage.find((u) => u.tool_name === "mcp__context-mode__ctx_search");
      expect(search).toBeDefined();
      expect(search!.calls).toBe(1);
      expect(search!.median_concurrency).toBeNull();
      expect(search!.max_concurrency).toBeNull();
    });

    it("returns empty array when no mcp_tool_call events exist", () => {
      expect(engine.getMcpToolUsage()).toEqual([]);
    });
  });

  describe("getUsageBreakdown", () => {
    it("attributes bytes per skill, subagent, and MCP server", () => {
      // Size is taken from length(data) — the serialized form the hook
      // captured. We use payload strings sized to test percentage math.

      // Skills — `data` is the bare skill name (extract.ts:503).
      // "write" → 5 bytes, "panel" → 5 bytes. bytes_avoided is honored.
      insertEvent(db, {
        session_id: SESSION_ID, type: "skill", category: "skill",
        data: "write", bytes_avoided: 0,
      });
      insertEvent(db, {
        session_id: SESSION_ID, type: "skill", category: "skill",
        data: "panel", bytes_avoided: 200,
      });

      // Subagents — all bucket as "all" until extractSubagent stores type.
      // Padded to ~2000 bytes so it dominates the breakdown like in real life.
      const subagentBody = "[completed] " + "x".repeat(1988); // length = 2000
      insertEvent(db, {
        session_id: SESSION_ID, type: "subagent_completed", category: "subagent",
        data: subagentBody, bytes_avoided: 0,
      });

      // MCP — `data` is JSON with full tool_name. Server = middle segment.
      const ctxData = JSON.stringify({
        tool_name: "mcp__context-mode__ctx_search",
        params: { queries: ["x".repeat(1400)] }, // pad so length ~1500
      });
      insertEvent(db, {
        session_id: SESSION_ID, type: "mcp_tool_call", category: "mcp_tool_call", priority: 4,
        data: ctxData, bytes_avoided: 8000,
      });
      const phData = JSON.stringify({
        tool_name: "mcp__posthog__exec",
        params: { sql: "x".repeat(4900) }, // pad so length ~5000
      });
      insertEvent(db, {
        session_id: SESSION_ID, type: "mcp_tool_call", category: "mcp_tool_call", priority: 4,
        data: phData, bytes_avoided: 0,
      });

      const breakdown = engine.getUsageBreakdown(SESSION_ID);

      const skills = breakdown.filter((r) => r.kind === "skill");
      expect(skills.map((r) => r.source).sort()).toEqual(["panel", "write"]);
      // length("write") = 5 bytes.
      expect(skills.find((r) => r.source === "write")!.bytesReturned).toBe(5);
      expect(skills.find((r) => r.source === "panel")!.bytesAvoided).toBe(200);

      const subagents = breakdown.filter((r) => r.kind === "subagent");
      expect(subagents).toHaveLength(1);
      expect(subagents[0].source).toBe("all");
      expect(subagents[0].bytesReturned).toBe(2000);

      const mcps = breakdown.filter((r) => r.kind === "mcp");
      expect(mcps.map((r) => r.source).sort()).toEqual(["context-mode", "posthog"]);
      expect(mcps.find((r) => r.source === "context-mode")!.bytesAvoided).toBe(8000);
      expect(mcps.find((r) => r.source === "context-mode")!.bytesReturned).toBe(ctxData.length);
      expect(mcps.find((r) => r.source === "posthog")!.bytesReturned).toBe(phData.length);

      // Subagent dominates by far (~2000 of ~8500 total).
      expect(subagents[0].pctOfReturned).toBeGreaterThan(20);
      // Skills are tiny (just names).
      expect(skills[0].pctOfReturned).toBeLessThan(1);
    });

    it("ignores other sessions and unrelated categories", () => {
      insertEvent(db, {
        session_id: "other-session", type: "skill", category: "skill",
        data: "leak",
      });
      insertEvent(db, {
        session_id: SESSION_ID, type: "file", category: "file",
        data: "/path/to/file",
      });
      expect(engine.getUsageBreakdown(SESSION_ID)).toEqual([]);
    });

    it("returns empty array on malformed mcp_tool_call data", () => {
      insertEvent(db, {
        session_id: SESSION_ID, type: "mcp_tool_call", category: "mcp_tool_call",
        data: "not json {{{",
      });
      const out = engine.getUsageBreakdown(SESSION_ID);
      // The row still counts under kind="mcp" with source="(unknown)".
      expect(out).toHaveLength(1);
      expect(out[0].kind).toBe("mcp");
      expect(out[0].source).toBe("(unknown)");
    });
  });
});
