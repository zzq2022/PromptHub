// @vitest-environment node
/**
 * Tests for agent-gateway.ts — start, stop, status of Agent gateway processes.
 *
 * Uses real filesystem and real Python. Gateway scripts are valid Python stubs.
 * All assertions are on the registry/status logic and API shape.
 *
 * Uses node environment (not jsdom) because these tests spawn real Python
 * processes and make real HTTP requests — jsdom's AbortSignal is incompatible
 * with native fetch().
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

import {
  startAgentGateway,
  stopAgentGateway,
  getAgentGatewayStatus,
  stopAllGateways,
} from "@prompthub/core/agent-gateway";

// Detect if system Python is available (needed for venv stub creation)
let systemPython = "";
try {
  const cmd = process.platform === "win32" ? "where python" : "which python3";
  const result = execSync(cmd, { encoding: "utf-8", timeout: 3000 }).trim();
  const firstLine = result.split("\n")[0]?.trim();
  if (firstLine && fs.existsSync(firstLine)) {
    systemPython = firstLine;
  }
} catch {
  // Python not found — tests will be skipped
}

const hasPython = !!systemPython;

let tmpDir: string;
let resourcesDir: string;
let sharedRuntimeDir: string; // resources/agent-runtime/

// Python stubs for gateway tests
const PY_EXIT_IMMEDIATELY = 'import sys; sys.exit(0)';
const PY_KEEPALIVE = 'import time; time.sleep(60)';

/**
 * Minimal HTTP server that responds 200 on GET /health.
 * Used by tests that need a healthy gateway for health-check to pass.
 */
const PY_HEALTHY_GATEWAY = `
from http.server import HTTPServer, BaseHTTPRequestHandler
import os

class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ('/api/health', '/health'):
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'ok')
        else:
            self.send_response(404)
            self.end_headers()
    def log_message(self, *a): pass

_port = int(os.environ.get('AGENT_PORT', '18792'))
_server = HTTPServer(('127.0.0.1', _port), _Handler)
_server.serve_forever()
`;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gateway-test-"));
  resourcesDir = path.join(tmpDir, "resources");
  sharedRuntimeDir = path.join(resourcesDir, "agent-runtime");

  // Create a fake venv so findAgentPython can locate it
  if (hasPython) {
    const venvSubdir = process.platform === "win32" ? "Scripts" : "bin";
    const pythonName = process.platform === "win32" ? "python.exe" : "python3";
    const venvPythonDir = path.join(resourcesDir, "agent-venv", venvSubdir);
    fs.mkdirSync(venvPythonDir, { recursive: true });
    // Copy real system python into fake venv so it can be spawned
    fs.copyFileSync(systemPython, path.join(venvPythonDir, pythonName));

    // Create shared agent-runtime directory with both gateway scripts
    fs.mkdirSync(sharedRuntimeDir, { recursive: true });
    fs.writeFileSync(
      path.join(sharedRuntimeDir, "run_gateway.py"),
      PY_HEALTHY_GATEWAY,
    );
    fs.writeFileSync(
      path.join(sharedRuntimeDir, "stop_gateway.py"),
      'import sys; sys.exit(0)',
    );
    // Also copy python3 executable if it exists (non-Windows)
    if (process.platform !== "win32") {
      const altPython = systemPython.replace("python3", "python");
      if (fs.existsSync(altPython)) {
        fs.copyFileSync(altPython, path.join(venvPythonDir, "python"));
      }
    }
  }
});

afterEach(async () => {
  try { stopAllGateways(); } catch { /* ignore cleanup errors */ }
  // Wait for spawned processes to fully exit before deleting
  await new Promise((resolve) => setTimeout(resolve, 500));
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // On Windows, retries may be needed if processes linger
    await new Promise((resolve) => setTimeout(resolve, 500));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

// ─────────────────────────────────────────────
// startAgentGateway
// ─────────────────────────────────────────────
describe("startAgentGateway", () => {
  it("throws if run_gateway.py does not exist", async () => {
    const projectDir = path.join(tmpDir, "empty-project");
    fs.mkdirSync(projectDir, { recursive: true });

    // Use a separate resources dir that HAS a fake venv but NO agent-runtime/run_gateway.py
    const noScriptResourcesDir = path.join(tmpDir, "no-script-resources");
    fs.mkdirSync(noScriptResourcesDir, { recursive: true });

    if (!hasPython) {
      // Without Python, findAgentPython throws before the gateway script check
      await expect(startAgentGateway(projectDir, noScriptResourcesDir)).rejects.toThrow(
        /Agent venv Python not found/,
      );
      return;
    }

    // Create a fake venv so findAgentPython succeeds, but don't create run_gateway.py
    const venvSubdir = process.platform === "win32" ? "Scripts" : "bin";
    const pythonName = process.platform === "win32" ? "python.exe" : "python3";
    const venvPythonDir = path.join(noScriptResourcesDir, "agent-venv", venvSubdir);
    fs.mkdirSync(venvPythonDir, { recursive: true });
    fs.copyFileSync(systemPython, path.join(venvPythonDir, pythonName));

    await expect(startAgentGateway(projectDir, noScriptResourcesDir)).rejects.toThrow(
      /Gateway script not found/,
    );
  });

  it("throws if agent-venv does not exist", async () => {
    const projectDir = path.join(tmpDir, "no-venv-project");
    fs.mkdirSync(projectDir, { recursive: true });
    // Empty resources — no agent-runtime/run_gateway.py present

    const emptyResourcesDir = path.join(tmpDir, "empty-resources");
    fs.mkdirSync(emptyResourcesDir, { recursive: true });

    await expect(startAgentGateway(projectDir, emptyResourcesDir)).rejects.toThrow(
      /Agent venv Python not found/,
    );
  });

  it.skipIf(!hasPython)("returns a result with port and pid > 0", { timeout: 20000 }, async () => {
    const projectDir = path.join(tmpDir, "project-ok");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(sharedRuntimeDir, { recursive: true });
    fs.writeFileSync(path.join(sharedRuntimeDir, "run_gateway.py"), PY_HEALTHY_GATEWAY);

    const result = await startAgentGateway(projectDir, resourcesDir);

    expect(result.port).toBeGreaterThan(0);
    expect(result.pid).toBeGreaterThan(0);
  });

  it.skipIf(!hasPython)("returns existing gateway if already running for the same project", { timeout: 30000 }, async () => {
    const projectDir = path.join(tmpDir, "project-unique");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(sharedRuntimeDir, { recursive: true });
    fs.writeFileSync(path.join(sharedRuntimeDir, "run_gateway.py"), PY_HEALTHY_GATEWAY);

    const first = await startAgentGateway(projectDir, resourcesDir);
    const second = await startAgentGateway(projectDir, resourcesDir);

    expect(first.port).toBe(second.port);
    expect(first.pid).toBe(second.pid);
  });

  it.skipIf(!hasPython)("uses provided port if existingPort is specified", { timeout: 30000 }, async () => {
    const projectDir = path.join(tmpDir, "project-custom-port");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(sharedRuntimeDir, { recursive: true });
    fs.writeFileSync(path.join(sharedRuntimeDir, "run_gateway.py"), PY_HEALTHY_GATEWAY);

    const result = await startAgentGateway(projectDir, resourcesDir, 9999);
    expect(result.port).toBe(9999);
  });

  it.skipIf(!hasPython)("generates distinct ports for different projects", { timeout: 30000 }, async () => {
    const dir1 = path.join(tmpDir, "proj-a");
    const dir2 = path.join(tmpDir, "proj-b");
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });
    fs.mkdirSync(sharedRuntimeDir, { recursive: true });
    fs.writeFileSync(path.join(sharedRuntimeDir, "run_gateway.py"), PY_HEALTHY_GATEWAY);

    const r1 = await startAgentGateway(dir1, resourcesDir);
    const r2 = await startAgentGateway(dir2, resourcesDir);

    expect(r1.pid).not.toBe(r2.pid);
  });
});

// ─────────────────────────────────────────────
// getAgentGatewayStatus
// ─────────────────────────────────────────────
describe("getAgentGatewayStatus", () => {
  it("returns isRunning: false for unknown project", () => {
    const status = getAgentGatewayStatus("/nonexistent/path");
    expect(status.isRunning).toBe(false);
  });

  it.skipIf(!hasPython)("returns isRunning: true after starting (process exists)", { timeout: 30000 }, async () => {
    const projectDir = path.join(tmpDir, "status-project");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(sharedRuntimeDir, { recursive: true });
    fs.writeFileSync(path.join(sharedRuntimeDir, "run_gateway.py"), PY_HEALTHY_GATEWAY);

    await startAgentGateway(projectDir, resourcesDir);

    const status = getAgentGatewayStatus(projectDir);
    expect(status.isRunning).toBe(true);
    expect(status.port).toBeGreaterThan(0);
    expect(status.pid).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// stopAgentGateway
// ─────────────────────────────────────────────
describe("stopAgentGateway", () => {
  it.skipIf(!hasPython)("stops a running gateway and removes from status", { timeout: 30000 }, async () => {
    const projectDir = path.join(tmpDir, "stop-project");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(sharedRuntimeDir, { recursive: true });
    fs.writeFileSync(path.join(sharedRuntimeDir, "run_gateway.py"), PY_HEALTHY_GATEWAY);

    await startAgentGateway(projectDir, resourcesDir);
    stopAgentGateway(projectDir);

    // stopAgentGateway removes from the in-memory registry immediately
    expect(getAgentGatewayStatus(projectDir).isRunning).toBe(false);
  });

  it("does not throw when stopping a non-running project", () => {
    expect(() => stopAgentGateway("/nonexistent")).not.toThrow();
  });
});

// ─────────────────────────────────────────────
// stopAllGateways
// ─────────────────────────────────────────────
describe("stopAllGateways", () => {
  it.skipIf(!hasPython)("stops all running gateways", { timeout: 30000 }, async () => {
    const projectDir1 = path.join(tmpDir, "all-stop-1");
    const projectDir2 = path.join(tmpDir, "all-stop-2");
    fs.mkdirSync(sharedRuntimeDir, { recursive: true });
    fs.writeFileSync(path.join(sharedRuntimeDir, "run_gateway.py"), PY_HEALTHY_GATEWAY);

    await startAgentGateway(projectDir1, resourcesDir);
    await startAgentGateway(projectDir2, resourcesDir);

    expect(getAgentGatewayStatus(projectDir1).isRunning).toBe(true);
    expect(getAgentGatewayStatus(projectDir2).isRunning).toBe(true);

    stopAllGateways();

    expect(getAgentGatewayStatus(projectDir1).isRunning).toBe(false);
    expect(getAgentGatewayStatus(projectDir2).isRunning).toBe(false);
  });

  it("does not throw when no gateways running", () => {
    expect(() => stopAllGateways()).not.toThrow();
  });
});
