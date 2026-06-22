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
  child: ChildProcess;
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
 * Start an Agent gateway process for a given project.
 *
 * Sets up environment so that:
 * - PATH includes venv/Scripts (for nanobot ExecTool subprocess isolation)
 * - PYTHONPATH points to venv site-packages
 * - PROMPTHUB_PYTHON points to the venv Python (for agent internal use)
 */
export function startAgentGateway(
  projectRootPath: string,
  resourcesPath: string,
  existingPort?: number,
): AgentGatewayStartResult {
  const projectId = projectRootPath; // Use path as key

  if (runningGateways.has(projectId)) {
    const existing = runningGateways.get(projectId)!;
    return { port: existing.port, pid: existing.pid };
  }

  const pythonPath = findAgentPython(resourcesPath);

  // Always venv — compute paths from the venv location
  const venvScripts = path.dirname(pythonPath);
  const venvSitePackages = path.join(
    path.dirname(venvScripts),
    process.platform === "win32" ? "Lib" : "lib",
    "site-packages",
  );

  const port = existingPort ?? nextPort++;
  const gatewayScript = path.join(projectRootPath, "run_gateway.py");

  if (!fs.existsSync(gatewayScript)) {
    throw new Error(`Gateway script not found: ${gatewayScript}`);
  }

  // PATH injection: venv Scripts first, then system PATH
  const currentPath = process.env.PATH || "";
  const pythonDir = path.dirname(pythonPath);
  const venvPath = `${pythonDir}${path.delimiter}${currentPath}`;

  const child = spawn(pythonPath, [gatewayScript], {
    cwd: projectRootPath,
    env: {
      ...process.env,
      PATH: venvPath,
      PROMPTHUB_PYTHON: pythonPath,
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
      PYTHONPATH: venvSitePackages,
      AGENT_PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  const pid = child.pid ?? 0;

  child.on("error", (err) => {
    console.error(`[AgentGateway] Process error for ${projectRootPath}:`, err);
    runningGateways.delete(projectId);
  });

  child.on("exit", () => {
    runningGateways.delete(projectId);
  });

  runningGateways.set(projectId, { child, port, pid });

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
    managed.child.kill("SIGTERM");
  } catch {
    // Process may already be dead
  }

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
 * Stop all running gateways (call on app quit).
 */
export function stopAllGateways(): void {
  for (const [projectId] of runningGateways) {
    stopAgentGateway(projectId);
  }
}
