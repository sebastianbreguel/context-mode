/**
 * batch_execute concurrency benchmark — wall-clock at concurrency=1,2,4,8.
 *
 * Drives `runBatchCommands` from src/server.ts with N portable sleep commands,
 * measures wall-clock at each concurrency level, prints a speedup table.
 *
 * Usage:
 *   npm run bench:batch-parallel
 *   N=10 SLEEP_MS=500 LEVELS=1,2,4,8 npm run bench:batch-parallel
 *
 * What it measures:
 *   The N independent shell commands of equal duration scenario — the
 *   batch_execute production shape (e.g., gh / cat / find / curl in one batch).
 *
 * Sleep command:
 *   Uses `node -e "setTimeout(()=>process.exit(0), MS)"` so the bench is
 *   cross-platform (macOS/Linux/Windows). `sleep 0.5` would skip Windows.
 *
 * Caveats:
 *   - Wall-clock noise on shared CI runners is real. Run locally for
 *     headline numbers; CI runs are informational.
 *   - Each iteration spawns N node subprocesses. At concurrency=8, that's
 *     8 simultaneous spawns — fine on a workstation, may strain CI.
 */
import { PolyglotExecutor } from "../../src/executor.js";
import { detectRuntimes } from "../../src/runtime.js";
import { runBatchCommands, type BatchCommand } from "../../src/server.js";

const N = Number(process.env.N ?? 5);
const SLEEP_MS = Number(process.env.SLEEP_MS ?? 500);
const LEVELS = (process.env.LEVELS ?? "1,2,4,8")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n) && n >= 1 && n <= 8);
const WARMUP = Number(process.env.WARMUP ?? 1);

const runtimes = detectRuntimes();
const executor = new PolyglotExecutor({ runtimes });

function makeCommands(n: number, sleepMs: number): BatchCommand[] {
  const sleepCode = `node -e "setTimeout(()=>process.exit(0),${sleepMs})"`;
  return Array.from({ length: n }, (_, i) => ({
    label: `cmd_${i}`,
    command: sleepCode,
  }));
}

async function measure(concurrency: number): Promise<number> {
  const commands = makeCommands(N, SLEEP_MS);
  const start = performance.now();
  const { outputs, timedOut } = await runBatchCommands(
    commands,
    { timeout: 30000, concurrency, nodeOptsPrefix: "" },
    executor,
  );
  const elapsed = performance.now() - start;
  if (timedOut) {
    console.warn(`  ! concurrency=${concurrency}: timeout reported`);
  }
  if (outputs.length !== N) {
    console.warn(`  ! concurrency=${concurrency}: outputs=${outputs.length}, expected ${N}`);
  }
  return elapsed;
}

async function main(): Promise<void> {
  console.log("Context Mode — batch_execute Concurrency Benchmark");
  console.log("===================================================");
  console.log(`Node:        ${process.version}`);
  console.log(`Platform:    ${process.platform} (${process.arch})`);
  console.log(`N commands:  ${N}`);
  console.log(`Sleep/cmd:   ${SLEEP_MS}ms`);
  console.log(`Levels:      ${LEVELS.join(", ")}`);
  console.log(`Warmup:      ${WARMUP} run${WARMUP === 1 ? "" : "s"} (discarded)`);
  console.log("");

  // Warmup — primes the runtime/JIT and disk caches.
  for (let i = 0; i < WARMUP; i++) {
    await measure(LEVELS[0]);
  }

  const results: { concurrency: number; ms: number }[] = [];
  for (const c of LEVELS) {
    const ms = await measure(c);
    results.push({ concurrency: c, ms });
    console.log(`  concurrency=${String(c).padStart(2)}: ${ms.toFixed(1)}ms`);
  }

  const baseline = results.find((r) => r.concurrency === 1)?.ms ?? results[0].ms;

  console.log("");
  console.log("=== Summary ===");
  console.log("| concurrency | wall-clock (ms) | speedup vs c=1 |");
  console.log("|-------------|-----------------|----------------|");
  for (const r of results) {
    const speedup = (baseline / r.ms).toFixed(2);
    console.log(
      `| ${String(r.concurrency).padStart(11)} | ${r.ms.toFixed(1).padStart(15)} | ${speedup.padStart(13)}x |`,
    );
  }
  console.log("");
  console.log(`Theoretical max @ concurrency=${LEVELS[LEVELS.length - 1]}: ` +
    `~${SLEEP_MS}ms (one slot of work). ` +
    `Theoretical serial: ~${N * SLEEP_MS}ms.`);
}

main().catch((err) => {
  console.error("Bench error:", err);
  process.exit(1);
});
