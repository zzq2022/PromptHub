#!/usr/bin/env -S node --experimental-strip-types
/**
 * Bundle size budget check.
 *
 * Reads `apps/desktop/bundle-budget.json` and compares each declared budget
 * against the actual gzipped size of files matching its glob in
 * `apps/desktop/out/renderer/`. Exits with a non-zero status when any actual
 * size exceeds its budget.
 *
 * Usage:
 *   pnpm --filter @prompthub/desktop bundle:budget
 *
 * The script intentionally has zero runtime dependencies beyond Node's built
 * ins so it can run in CI without an extra install step. Match patterns use
 * a tiny shell-glob style with `*` mapping to "anything except /".
 *
 * Exit codes:
 *   0 — all budgets satisfied
 *   1 — at least one budget exceeded or no matching files for a required entry
 *   2 — usage / IO error
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface BudgetEntry {
  /** Human-readable name printed in reports */
  name: string;
  /** Glob-ish pattern relative to `out/renderer/`, e.g. `assets/index-*.js` */
  pattern: string;
  /** Maximum allowed gzipped size in bytes */
  maxGzipBytes: number;
  /**
   * If true, missing files are reported as a budget failure. Defaults to true.
   * Use `false` for entries that legitimately disappear after a build (e.g. an
   * old chunk we just split out).
   */
  required?: boolean;
}

interface BudgetFile {
  /** Optional human comment, ignored at runtime */
  $comment?: string;
  rendererOutDir?: string;
  entries: BudgetEntry[];
}

interface ResolvedMatch {
  filePath: string;
  relPath: string;
  gzipBytes: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopRoot = path.resolve(__dirname, "..");
const budgetPath = path.join(desktopRoot, "bundle-budget.json");

async function loadBudget(): Promise<BudgetFile> {
  let raw: string;
  try {
    raw = await readFile(budgetPath, "utf-8");
  } catch (err) {
    console.error(`[bundle-budget] cannot read ${budgetPath}: ${(err as Error).message}`);
    process.exit(2);
  }
  try {
    return JSON.parse(raw) as BudgetFile;
  } catch (err) {
    console.error(`[bundle-budget] invalid JSON in ${budgetPath}: ${(err as Error).message}`);
    process.exit(2);
  }
}

async function listAllFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const stats = await stat(full);
      if (stats.isDirectory()) {
        await walk(full);
      } else if (stats.isFile()) {
        out.push(full);
      }
    }
  }
  await walk(root);
  return out;
}

/**
 * Convert a glob-ish pattern to a RegExp. Supports `*` (anything except `/`)
 * and `**` (anything including `/`). All other characters are escaped.
 */
function patternToRegex(pattern: string): RegExp {
  // Use a placeholder strategy to avoid escape collisions
  const STAR = "\u0000STAR\u0000";
  const DOUBLESTAR = "\u0000DOUBLESTAR\u0000";
  const escaped = pattern
    .replace(/\*\*/g, DOUBLESTAR)
    .replace(/\*/g, STAR)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(new RegExp(DOUBLESTAR, "g"), ".*")
    .replace(new RegExp(STAR, "g"), "[^/]*");
  return new RegExp(`^${escaped}$`);
}

async function gzipSize(filePath: string): Promise<number> {
  const buf = await readFile(filePath);
  return gzipSync(buf).byteLength;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function resolveEntry(
  entry: BudgetEntry,
  rendererRoot: string,
  allFiles: string[],
): Promise<ResolvedMatch[]> {
  const re = patternToRegex(entry.pattern);
  const matches: ResolvedMatch[] = [];
  for (const filePath of allFiles) {
    const relPath = path.relative(rendererRoot, filePath).replaceAll(path.sep, "/");
    if (re.test(relPath)) {
      const gzipBytes = await gzipSize(filePath);
      matches.push({ filePath, relPath, gzipBytes });
    }
  }
  return matches;
}

async function main(): Promise<void> {
  const budget = await loadBudget();
  const rendererRoot = path.resolve(
    desktopRoot,
    budget.rendererOutDir ?? "out/renderer",
  );

  let rendererStat;
  try {
    rendererStat = await stat(rendererRoot);
  } catch {
    console.error(
      `[bundle-budget] renderer output not found at ${rendererRoot}. ` +
        `Run "pnpm --filter @prompthub/desktop build" first.`,
    );
    process.exit(2);
  }
  if (!rendererStat.isDirectory()) {
    console.error(`[bundle-budget] ${rendererRoot} is not a directory`);
    process.exit(2);
  }

  const allFiles = await listAllFiles(rendererRoot);

  let hasFailure = false;
  console.log(`[bundle-budget] checking against ${budgetPath}`);
  console.log(`[bundle-budget] renderer output: ${rendererRoot}`);
  console.log("");

  for (const entry of budget.entries) {
    const matches = await resolveEntry(entry, rendererRoot, allFiles);
    const required = entry.required !== false;

    if (matches.length === 0) {
      if (required) {
        hasFailure = true;
        console.log(
          `  ✗ ${entry.name}: no files match pattern "${entry.pattern}" (required)`,
        );
      } else {
        console.log(
          `  ⚠ ${entry.name}: no files match pattern "${entry.pattern}" (skipped)`,
        );
      }
      continue;
    }

    const totalGzip = matches.reduce((sum, m) => sum + m.gzipBytes, 0);
    const overBudget = totalGzip > entry.maxGzipBytes;
    if (overBudget) hasFailure = true;
    const status = overBudget ? "✗" : "✓";
    const fileList = matches.length === 1
      ? matches[0].relPath
      : matches.map((m) => m.relPath).join(", ");
    console.log(
      `  ${status} ${entry.name}: ${formatBytes(totalGzip)} gzip ` +
        `(budget ${formatBytes(entry.maxGzipBytes)}) — ${fileList}`,
    );
  }

  console.log("");
  if (hasFailure) {
    console.error("[bundle-budget] FAIL: one or more budgets exceeded.");
    process.exit(1);
  }
  console.log("[bundle-budget] OK");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(`[bundle-budget] unexpected error: ${message}`);
  process.exit(2);
});
