import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  getTemplatePath,
  verifyAgentProject,
  createAgentProject,
  importAgentProject,
} from "@prompthub/core";
import type {
  CreateAgentProjectInput,
  ImportAgentProjectInput,
} from "@prompthub/shared/types";

// ─────────────────────────────────────────────
// Shared test fixtures
// ─────────────────────────────────────────────
let tmpDir: string;
let resourcesDir: string;
let templateDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-test-"));
  resourcesDir = path.join(tmpDir, "resources");
  templateDir = path.join(resourcesDir, "agent-template");
  fs.mkdirSync(templateDir, { recursive: true });

  // Create minimal template files
  fs.writeFileSync(
    path.join(templateDir, "agent.py"),
    '#!/usr/bin/env python3\nprint("hello")',
  );
  fs.writeFileSync(
    path.join(templateDir, "config.json"),
    JSON.stringify({
      provider: "openai",
      api_key: "YOUR_API_KEY_HERE",
      model: "gpt-4",
    }),
  );
  fs.writeFileSync(path.join(templateDir, "SOUL.md"), "# Soul");
  fs.writeFileSync(path.join(templateDir, "AGENTS.md"), "# Agents");
  fs.mkdirSync(path.join(templateDir, "libs"), { recursive: true });
  fs.writeFileSync(path.join(templateDir, "libs", "__init__.py"), "");
  fs.mkdirSync(path.join(templateDir, "backend"), { recursive: true });
  fs.writeFileSync(path.join(templateDir, "backend", "__init__.py"), "");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────
// getTemplatePath
// ─────────────────────────────────────────────
describe("getTemplatePath", () => {
  it("returns the template path when agent-template exists", () => {
    const result = getTemplatePath(resourcesDir);
    expect(result).toBe(templateDir);
    expect(fs.existsSync(result)).toBe(true);
  });

  it("throws when agent-template directory does not exist", () => {
    const missingDir = path.join(tmpDir, "no-such-dir");
    expect(() => getTemplatePath(missingDir)).toThrow("Agent template not found");
  });
});

// ─────────────────────────────────────────────
// verifyAgentProject
// ─────────────────────────────────────────────
describe("verifyAgentProject", () => {
  it("returns valid for a directory with agent.py and config.json", () => {
    const result = verifyAgentProject(templateDir);
    expect(result.isValid).toBe(true);
    expect(result.name).toBe("agent-template");
  });

  it("returns invalid when directory does not exist", () => {
    const result = verifyAgentProject(path.join(tmpDir, "nonexistent"));
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  it("returns invalid when agent.py is missing", () => {
    fs.unlinkSync(path.join(templateDir, "agent.py"));
    const result = verifyAgentProject(templateDir);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("agent.py");
  });

  it("returns invalid when config.json is missing", () => {
    fs.unlinkSync(path.join(templateDir, "config.json"));
    const result = verifyAgentProject(templateDir);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("config.json");
  });

  it("extracts name from directory basename", () => {
    const customDir = path.join(tmpDir, "my-cool-agent");
    fs.mkdirSync(customDir, { recursive: true });
    fs.writeFileSync(path.join(customDir, "agent.py"), "");
    fs.writeFileSync(path.join(customDir, "config.json"), "{}");

    const result = verifyAgentProject(customDir);
    expect(result.isValid).toBe(true);
    expect(result.name).toBe("my-cool-agent");
  });

  it("handles trailing slashes in directory path", () => {
    const dirWithSlash = templateDir + path.sep;
    const result = verifyAgentProject(dirWithSlash);
    expect(result.isValid).toBe(true);
  });
});

// ─────────────────────────────────────────────
// createAgentProject
// ─────────────────────────────────────────────
describe("createAgentProject", () => {
  it("copies template to target directory and returns result", () => {
    const targetDir = path.join(tmpDir, "projects");
    fs.mkdirSync(targetDir, { recursive: true });

    const result = createAgentProject(
      { name: "test-bot", targetDir, config: {} },
      resourcesDir,
    );

    expect(result.name).toBe("test-bot");
    expect(result.origin).toBe("template");
    expect(result.rootPath).toBe(path.join(targetDir, "test-bot"));

    // Verify files were copied
    const projectPath = result.rootPath;
    expect(fs.existsSync(path.join(projectPath, "agent.py"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "config.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "SOUL.md"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "libs", "__init__.py"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "backend", "__init__.py"))).toBe(true);

    // Verify sessions/ and memory/ directories created
    expect(fs.existsSync(path.join(projectPath, "sessions"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "memory"))).toBe(true);
  });

  it("applies config.json modifications when config provided", () => {
    const targetDir = path.join(tmpDir, "projects");
    fs.mkdirSync(targetDir, { recursive: true });

    const result = createAgentProject(
      {
        name: "custom-bot",
        targetDir,
        config: {
          model: "claude-3-opus",
          apiKey: "sk-test-123",
          apiBase: "https://custom.api.com/v1",
        },
      },
      resourcesDir,
    );

    const configContent = JSON.parse(
      fs.readFileSync(path.join(result.rootPath, "config.json"), "utf-8"),
    );
    expect(configContent.agents.defaults.model).toBe("claude-3-opus");
    expect(configContent.providers.custom.api_key).toBe("sk-test-123");
    expect(configContent.providers.custom.api_base).toBe("https://custom.api.com/v1");
  });

  it("throws when name is empty", () => {
    const targetDir = path.join(tmpDir, "projects");
    expect(() =>
      createAgentProject({ name: "  ", targetDir }, resourcesDir),
    ).toThrow("Project name is required");
  });

  it("throws when target directory already has a project with same name", () => {
    const targetDir = path.join(tmpDir, "projects");
    fs.mkdirSync(path.join(targetDir, "existing-bot"), { recursive: true });

    expect(() =>
      createAgentProject({ name: "existing-bot", targetDir }, resourcesDir),
    ).toThrow("Directory already exists");
  });

  it("generates unique projectId", () => {
    const targetDir1 = path.join(tmpDir, "projects1");
    const targetDir2 = path.join(tmpDir, "projects2");
    fs.mkdirSync(targetDir1, { recursive: true });
    fs.mkdirSync(targetDir2, { recursive: true });

    const r1 = createAgentProject({ name: "bot1", targetDir: targetDir1 }, resourcesDir);
    const r2 = createAgentProject({ name: "bot2", targetDir: targetDir2 }, resourcesDir);

    expect(r1.projectId).not.toBe(r2.projectId);
    expect(r1.projectId).toMatch(/^agent_bot1_\d+$/);
  });

  it("creates nested directory structure for target", () => {
    const targetDir = path.join(tmpDir, "deep", "nested", "path");
    // Don't create it beforehand — createAgentProject should handle recursive creation
    const result = createAgentProject(
      { name: "deep-bot", targetDir },
      resourcesDir,
    );

    expect(fs.existsSync(result.rootPath)).toBe(true);
    expect(fs.existsSync(path.join(result.rootPath, "agent.py"))).toBe(true);
  });
});

// ─────────────────────────────────────────────
// importAgentProject
// ─────────────────────────────────────────────
describe("importAgentProject", () => {
  it("imports a valid Agent project directory", () => {
    const projectDir = path.join(tmpDir, "existing-agent");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, "agent.py"), "print('hi')");
    fs.writeFileSync(path.join(projectDir, "config.json"), "{}");

    const result = importAgentProject({ dirPath: projectDir });

    expect(result.origin).toBe("imported");
    expect(result.name).toBe("existing-agent");
    expect(result.rootPath).toBe(projectDir);
  });

  it("throws when directory is not a valid Agent project", () => {
    const projectDir = path.join(tmpDir, "bad-project");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, "readme.md"), "not an agent");

    expect(() => importAgentProject({ dirPath: projectDir })).toThrow(
      "Invalid Agent project",
    );
  });

  it("throws when directory does not exist", () => {
    expect(() =>
      importAgentProject({ dirPath: path.join(tmpDir, "ghost") }),
    ).toThrow("Invalid Agent project");
  });

  it("handles trailing slashes", () => {
    const projectDir = path.join(tmpDir, "trailing");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, "agent.py"), "");
    fs.writeFileSync(path.join(projectDir, "config.json"), "{}");

    const result = importAgentProject({ dirPath: projectDir + "\\" });
    expect(result.origin).toBe("imported");
    expect(result.name).toBe("trailing");
  });
});
