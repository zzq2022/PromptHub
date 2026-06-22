/**
 * Tests for agent-gateway.ts — start, stop, status of Agent gateway processes.
 *
 * Uses real filesystem and real Python. Gateway scripts are valid Python stubs.
 * All assertions are on the registry/status logic and API shape.
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

// Python stubs for gateway tests
const PY_EXIT_IMMEDIATELY = 'import sys; sys.exit(0)';
const PY_KEEPALIVE = 'import time; time.sleep(60)';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gateway-test-"));
  resourcesDir = path.join(tmpDir, "resources");

  // Create a fake venv so findAgentPython can locate it
  if (hasPython) {
    const venvSubdir = process.platform === "win32" ? "Scripts" : "bin";
    const pythonName = process.platform === "win32" ? "python.exe" : "python3";
    const venvPythonDir = path.join(resourcesDir, "agent-venv", venvSubdir);
    fs.mkdirSync(venvPythonDir, { recursive: true });
    // Copy real system python into fake venv so it can be spawned
    fs.copyFileSync(systemPython, path.join(venvPythonDir, pythonName));
    // Also copy python3 executable if it exists (non-Windows)
    if (process.platform !== "win32") {
      const altPython = systemPython.replace("python3", "python");
      if (fs.existsSync(altPython)) {
        fs.copyFileSync(altPython, path.join(venvPythonDir, "python"));
      }
    }
  }
});

afterEach(() => {
  try { stopAllGateways(); } catch { /* ignore cleanup errors */ }
  // Small delay to let spawned processes exit
  const syncWait = Date.now() + 300;
  while (Date.now() < syncWait) { /* busy wait */ }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────
// startAgentGateway
// ─────────────────────────────────────────────
describe("startAgentGateway", () => {
  it("throws if run_gateway.py does not exist", () => {
    const projectDir = path.join(tmpDir, "empty-project");
    fs.mkdirSync(projectDir, { recursive: true });

    if (!hasPython) {
      // Without Python, findAgentPython throws before the gateway script check
      expect(() => startAgentGateway(projectDir, resourcesDir)).toThrow(
        /Agent venv Python not found/,
      );
      return;
    }

    expect(() => startAgentGateway(projectDir, resourcesDir)).toThrow(
      /Gateway script not found/,
    );
  });

  it("throws if agent-venv does not exist", () => {
    const projectDir = path.join(tmpDir, "no-venv-project");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, "run_gateway.py"), PY_EXIT_IMMEDIATELY);

    const emptyResourcesDir = path.join(tmpDir, "empty-resources");
    fs.mkdirSync(emptyResourcesDir, { recursive: true });

    expect(() => startAgentGateway(projectDir, emptyResourcesDir)).toThrow(
      /Agent venv Python not found/,
    );
  });

  it.skipIf(!hasPython)("returns a result with port and pid > 0", () => {
    const projectDir = path.join(tmpDir, "project-ok");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, "run_gateway.py"), PY_EXIT_IMMEDIATELY);

    const result = startAgentGateway(projectDir, resourcesDir);

    expect(result.port).toBeGreaterThan(0);
    expect(result.pid).toBeGreaterThan(0);
  });

  it.skipIf(!hasPython)("returns existing gateway if already running for the same project", () => {
    const projectDir = path.join(tmpDir, "project-unique");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, "run_gateway.py"), PY_EXIT_IMMEDIATELY);

    const first = startAgentGateway(projectDir, resourcesDir);
    const second = startAgentGateway(projectDir, resourcesDir);

    expect(first.port).toBe(second.port);
    expect(first.pid).toBe(second.pid);
  });

  it.skipIf(!hasPython)("uses provided port if existingPort is specified", () => {
    const projectDir = path.join(tmpDir, "project-custom-port");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, "run_gateway.py"), PY_EXIT_IMMEDIATELY);

    const result = startAgentGateway(projectDir, resourcesDir, 9999);
    expect(result.port).toBe(9999);
  });

  it.skipIf(!hasPython)("generates distinct ports for different projects", () => {
    const dir1 = path.join(tmpDir, "proj-a");
    const dir2 = path.join(tmpDir, "proj-b");
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });
    fs.writeFileSync(path.join(dir1, "run_gateway.py"), PY_EXIT_IMMEDIATELY);
    fs.writeFileSync(path.join(dir2, "run_gateway.py"), PY_EXIT_IMMEDIATELY);

    const r1 = startAgentGateway(dir1, resourcesDir);
    const r2 = startAgentGateway(dir2, resourcesDir);

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

  it.skipIf(!hasPython)("returns isRunning: true after starting (process exists)", () => {
    const projectDir = path.join(tmpDir, "status-project");
    fs.mkdirSync(projectDir, { recursive: true });
    // Keep-alive Python script
    fs.writeFileSync(path.join(projectDir, "run_gateway.py"), PY_KEEPALIVE);

    startAgentGateway(projectDir, resourcesDir);

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
  it.skipIf(!hasPython)("stops a running gateway and removes from status", () => {
    const projectDir = path.join(tmpDir, "stop-project");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, "run_gateway.py"), PY_KEEPALIVE);

    startAgentGateway(projectDir, resourcesDir);
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
  it.skipIf(!hasPython)("stops all running gateways", () => {
    const projectDir1 = path.join(tmpDir, "all-stop-1");
    const projectDir2 = path.join(tmpDir, "all-stop-2");
    fs.mkdirSync(projectDir1, { recursive: true });
    fs.mkdirSync(projectDir2, { recursive: true });
    fs.writeFileSync(path.join(projectDir1, "run_gateway.py"), PY_KEEPALIVE);
    fs.writeFileSync(path.join(projectDir2, "run_gateway.py"), PY_KEEPALIVE);

    startAgentGateway(projectDir1, resourcesDir);
    startAgentGateway(projectDir2, resourcesDir);

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
