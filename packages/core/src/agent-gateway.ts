/**
 * Agent Gateway Process Manager — start, stop, and monitor Agent gateway processes.
 *
 * Each Agent project runs its own FastAPI+uvicorn gateway process.
 * PromptHub spawns these as child processes and tracks them by project ID.
 */

import { spawn, type ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import type {
  AgentGatewayStatus,
  AgentGatewayStartResult,
} from "@prompthub/shared/types";

interface ManagedProcess {
  child?: ChildProcess;
  port: number;
  pid: number;
}

/** In-memory registry of running gateway processes */
const runningGateways = new Map<string, ManagedProcess>();

/** Next port to assign (incremental from base) */
let nextPort = 18792;

/**
 * Locate the shared venv Python executable.
 *
 * The agent-venv is bundled in the app's resources directory and provides
 * all Python dependencies needed by the gateway. System Python is intentionally
 * NOT used as a fallback because it may lack required packages and
 * using a wrong interpreter (e.g. Electron's node) causes crashes.
 */
function findAgentPython(resourcesPath: string): string {
  const isWin = process.platform === "win32";
  const pythonName = isWin ? "python.exe" : "python3";
  const subdir = isWin ? "Scripts" : "bin";

  const venvPython = path.join(resourcesPath, "agent-venv", subdir, pythonName);
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }

  throw new Error(
    `Agent venv Python not found at: ${venvPython}. ` +
    `Ensure the agent-venv directory exists in the resources path: ${resourcesPath}`,
  );
}

/**
 * Health check timeout (ms) before considering gateway startup failed.
 * FastAPI/uvicorn typically starts in under 3s on modern hardware.
 * Exported so tests can reduce the timeout.
 */
export const GATEWAY_HEALTH_TIMEOUT_MS = 15_000;
export const GATEWAY_HEALTH_POLL_MS = 500;

/**
 * Poll a health endpoint until it responds 200 or timeout expires.
 * Uses HTTP HEAD-like fetch to minimise overhead.
 */
async function waitForGatewayReady(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  let lastError: string | undefined;
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) return;
      lastError = `HTTP ${resp.status}`;
    } catch (err: unknown) {
      // Service not ready yet – swallow and retry
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, GATEWAY_HEALTH_POLL_MS));
  }
  throw new Error(
    `Agent Gateway did not become healthy within ${timeoutMs}ms. Last error: ${lastError ?? "unknown"}`,
  );
}

/**
 * Start an Agent gateway process for a given project.
 *
 * Sets up environment so that:
 * - PATH includes venv/Scripts (for nanobot ExecTool subprocess isolation)
 * - PYTHONPATH points to venv site-packages
 * - PROMPTHUB_PYTHON points to the venv Python (for agent internal use)
 *
 * This function is **async**: after spawning the process it waits for the
 * HTTP health endpoint to respond before returning. If the gateway does not
 * become healthy within `GATEWAY_HEALTH_TIMEOUT_MS`, the child process is
 * killed and an error is thrown.
 */
function normalizePath(p: string): string {
  return path.resolve(p).toLowerCase().replace(/[\\/]+/g, "/").replace(/\/$/, "");
}

interface HealthCheckResult {
  isRunning: boolean;
  workspace?: string;
  pid?: number;
}

async function checkPortHealth(port: number): Promise<HealthCheckResult> {
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1000),
    });
    if (resp.ok) {
      try {
        const data = await resp.json() as any;
        if (data && data.status === "ok") {
          return {
            isRunning: true,
            workspace: data.workspace,
            pid: data.pid,
          };
        }
      } catch {
        // Not a JSON response, but the port is active
        return { isRunning: true };
      }
    }
    // Responded, but not successful or not our API
    return { isRunning: true };
  } catch {
    return { isRunning: false };
  }
}

export async function startAgentGateway(
  projectRootPath: string,
  resourcesPath: string,
  existingPort?: number,
): Promise<AgentGatewayStartResult> {
  const projectId = projectRootPath; // Use path as key

  if (runningGateways.has(projectId)) {
    const existing = runningGateways.get(projectId)!;
    return { port: existing.port, pid: existing.pid };
  }

  const normProjectRoot = normalizePath(projectRootPath);

  const pythonPath = findAgentPython(resourcesPath);

  // Always venv — compute paths from the venv location
  const venvScripts = path.dirname(pythonPath);
  const venvSitePackages = path.join(
    path.dirname(venvScripts),
    process.platform === "win32" ? "Lib" : "lib",
    "site-packages",
  );

  let port = existingPort;
  const configPath = path.join(projectRootPath, "config.json");
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const gatewayPort = cfg?.gateway?.port;
      if (gatewayPort) {
        port = parseInt(gatewayPort, 10);
      }
    } catch { /* ignore */ }
  }

  // If a port is candidate, check if it's occupied by the current project or someone else
  if (port) {
    const health = await checkPortHealth(port);
    if (health.isRunning) {
      if (health.workspace && normalizePath(health.workspace) === normProjectRoot) {
        // Already running for this project! Reuse it
        const pid = health.pid ?? 0;
        runningGateways.set(projectId, { port, pid });
        return { port, pid };
      } else {
        // Occupied by someone else. Discard it so we scan for a new one
        port = undefined;
      }
    }
  }

  // If no port or candidate port is occupied by someone else, scan for a free one
  if (!port) {
    while (true) {
      const candidate = nextPort++;
      const health = await checkPortHealth(candidate);
      if (health.isRunning) {
        if (health.workspace && normalizePath(health.workspace) === normProjectRoot) {
          port = candidate;
          const pid = health.pid ?? 0;
          runningGateways.set(projectId, { port, pid });
          return { port, pid };
        }
        // Occupied by another workspace/service, continue scanning
      } else {
        port = candidate;
        break;
      }
    }
  }

  // Shared runtime: run_gateway.py now lives in agent-runtime/ alongside the app
  // The per-agent workspace is passed via AGENT_WORKSPACE env var
  const runtimeDir = path.join(resourcesPath, "agent-runtime");
  const gatewayScript = path.join(runtimeDir, "run_gateway.py");

  if (!fs.existsSync(gatewayScript)) {
    throw new Error(`Gateway script not found: ${gatewayScript}`);
  }

  // PATH injection: venv Scripts first, then system PATH
  const currentPath = process.env.PATH || "";
  const pythonDir = path.dirname(pythonPath);
  const venvPath = `${pythonDir}${path.delimiter}${currentPath}`;

  let child: ChildProcess;
  // Spawn Python directly on all platforms.
  // Previously, Windows used `cmd.exe /c start` to show a console window,
  // but this caused orphan zombie processes: cmd.exe exits immediately,
  // `child.on("exit")` fires removing the entry from runningGateways,
  // while the actual Python process lives on in its own console window.
  // Spawning Python directly gives us the real PID and proper lifecycle.
  child = spawn(pythonPath, [gatewayScript], {
    cwd: runtimeDir,
    env: {
      ...process.env,
      PATH: venvPath,
      AGENT_WORKSPACE: projectRootPath,
      PROMPTHUB_PYTHON: pythonPath,
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
      PYTHONUNBUFFERED: "1",
      PYTHONPATH: venvSitePackages,
      AGENT_PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    windowsHide: true,
  });

  let pid = child.pid ?? 0;

  // Collect stderr for error diagnostics (keep last 500 chars)
  let stderrBuffer = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf-8");
    stderrBuffer = (stderrBuffer + text).slice(-500);
  });

  child.on("error", (err) => {
    console.error(`[AgentGateway] Process error for ${projectRootPath}:`, err);
    runningGateways.delete(projectId);
  });

  child.on("exit", () => {
    runningGateways.delete(projectId);
  });

  // Register immediately so getAgentGatewayStatus works during startup
  runningGateways.set(projectId, { child, port, pid });

  try {
    await waitForGatewayReady(
      `http://127.0.0.1:${port}/api/health`,
      GATEWAY_HEALTH_TIMEOUT_MS,
    );
  } catch (err) {
    // Health check failed — kill the process and clean up
    try {
      child.kill("SIGTERM");
    } catch { /* ignore */ }
    runningGateways.delete(projectId);

    const detail = stderrBuffer
      ? `\nProcess stderr (tail):\n${stderrBuffer}`
      : "";
    throw new Error(
      `${(err instanceof Error ? err.message : String(err))}${detail}`,
    );
  }

  // Update PID in registry (use the real Python PID from child.pid)
  const managed = runningGateways.get(projectId);
  if (managed) {
    managed.pid = pid;
  }

  return { port, pid };
}

/**
 * Stop a running Agent gateway process.
 */
export function stopAgentGateway(projectRootPath: string): void {
  const projectId = projectRootPath;
  const managed = runningGateways.get(projectId);

  if (!managed) {
    return;
  }

  try {
    if (managed.child) {
      managed.child.kill("SIGTERM");
    } else if (managed.pid) {
      process.kill(managed.pid, "SIGTERM");
    }
  } catch { /* ignore */ }

  runningGateways.delete(projectId);
}

/**
 * Check if an Agent gateway is running.
 */
export function getAgentGatewayStatus(
  projectRootPath: string,
): AgentGatewayStatus {
  const managed = runningGateways.get(projectRootPath);

  if (!managed) {
    return { isRunning: false };
  }

  // Verify the process is actually alive
  try {
    process.kill(managed.pid, 0); // Signal 0 = check existence
    return {
      isRunning: true,
      port: managed.port,
      pid: managed.pid,
    };
  } catch {
    runningGateways.delete(projectRootPath);
    return { isRunning: false };
  }
}

/**
 * Check if a given PID is still running on the system.
 * Uses signal 0 which doesn't actually send a signal — just checks existence.
 */
export function verifyProcessPid(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop all running gateways (call on app quit).
 */
export function stopAllGateways(): void {
  for (const [projectId] of runningGateways) {
    stopAgentGateway(projectId);
  }
}

/**
 * Verify whether a gateway port belongs to a specific project workspace.
 *
 * Hits the `/api/health` endpoint and compares the reported workspace
 * against the expected project root path. Returns `{ match: true }` if
 * they agree, `{ match: false }` if the port is running a different
 * project's gateway, or `{ match: false, isRunning: false }` if the
 * port is not serving at all.
 */
export async function verifyGatewayPort(
  port: number,
  expectedProjectRootPath: string,
): Promise<{ match: boolean; isRunning: boolean; workspace?: string; pid?: number }> {
  const health = await checkPortHealth(port);
  if (!health.isRunning) {
    return { match: false, isRunning: false };
  }
  if (!health.workspace) {
    // Running but no workspace info — can't verify ownership
    return { match: false, isRunning: true };
  }
  const match =
    normalizePath(health.workspace) === normalizePath(expectedProjectRootPath);
  return {
    match,
    isRunning: true,
    workspace: health.workspace,
    pid: health.pid,
  };
}
