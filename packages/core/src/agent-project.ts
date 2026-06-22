/**
 * Agent Project Manager — create, import, and verify Agent projects.
 *
 * Operates on the filesystem: copies template files, validates project structure,
 * and delegates persistence to the settings store (renderer side).
 */

import fs from "fs";
import path from "path";
import type {
  CreateAgentProjectInput,
  ImportAgentProjectInput,
  AgentProjectResult,
  AgentConfig,
} from "@prompthub/shared/types";

/** Required files that must exist for a directory to be a valid Agent project */
const REQUIRED_FILES = ["agent.py", "config.json"];

/**
 * Locate the agent-template directory.
 * - Dev: apps/desktop/resources/agent-template/
 * - Packaged: {resources}/agent-template/
 */
export function getTemplatePath(resourcesPath: string): string {
  const candidate = path.join(resourcesPath, "agent-template");
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  throw new Error(`Agent template not found at: ${candidate}`);
}

/**
 * Validate that a directory contains a valid Agent project.
 */
export function verifyAgentProject(
  dirPath: string,
): { isValid: boolean; name?: string; error?: string } {
  if (!fs.existsSync(dirPath)) {
    return { isValid: false, error: "Directory does not exist" };
  }

  for (const file of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(dirPath, file))) {
      return {
        isValid: false,
        error: `Missing required file: ${file}`,
      };
    }
  }

  // Extract project name from directory name
  const name = path.basename(dirPath.replace(/[\\/]+$/, ""));

  return { isValid: true, name };
}

/**
 * Create a new Agent project by copying from the template.
 */
export function createAgentProject(
  input: CreateAgentProjectInput,
  resourcesPath: string,
): AgentProjectResult {
  const { name, targetDir, config } = input;

  if (!name.trim()) {
    throw new Error("Project name is required");
  }

  const templatePath = getTemplatePath(resourcesPath);
  const projectPath = path.join(targetDir, name);

  if (fs.existsSync(projectPath)) {
    throw new Error(`Directory already exists: ${projectPath}`);
  }

  // Create target directory
  fs.mkdirSync(projectPath, { recursive: true });

  // Copy template files recursively
  copyDirSync(templatePath, projectPath);

  // Create empty sessions/ and memory/ directories (in case .gitkeep was skipped)
  fs.mkdirSync(path.join(projectPath, "sessions"), { recursive: true });
  fs.mkdirSync(path.join(projectPath, "memory"), { recursive: true });

  // Apply user config to config.json
  if (config) {
    applyConfig(projectPath, config);
  }

  return {
    projectId: `agent_${name}_${Date.now()}`,
    name,
    rootPath: projectPath,
    origin: "template",
  };
}

/**
 * Import an existing Agent project directory.
 */
export function importAgentProject(
  input: ImportAgentProjectInput,
): AgentProjectResult {
  const { dirPath } = input;
  const normalizedPath = dirPath.replace(/[\\/]+$/, "");

  const validation = verifyAgentProject(normalizedPath);
  if (!validation.isValid) {
    throw new Error(`Invalid Agent project: ${validation.error}`);
  }

  return {
    projectId: `agent_imported_${validation.name}_${Date.now()}`,
    name: validation.name!,
    rootPath: normalizedPath,
    origin: "imported",
  };
}

// ── Private helpers ─────────────────────────────────────────────

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip .git, __pycache__, .venv, node_modules
    if ([".git", "__pycache__", ".venv", "node_modules"].includes(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function applyConfig(projectPath: string, config: AgentConfig): void {
  const configPath = path.join(projectPath, "config.json");
  if (!fs.existsSync(configPath)) {
    return;
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  const configData: Record<string, unknown> = JSON.parse(raw);

  // Ensure nested paths exist
  const agents = (configData.agents ??= {}) as Record<string, unknown>;
  const defaults = (agents.defaults ??= {}) as Record<string, unknown>;
  const providers = (configData.providers ??= {}) as Record<string, unknown>;
  const custom = (providers.custom ??= {}) as Record<string, unknown>;

  if (config.model) {
    defaults.model = config.model;
  }
  if (config.apiKey) {
    custom.api_key = config.apiKey;
  }
  if (config.apiBase) {
    custom.api_base = config.apiBase;
  }
  if (config.maxTokens) {
    defaults.max_tokens = config.maxTokens;
  }
  if (config.temperature !== undefined) {
    defaults.temperature = config.temperature;
  }
  if (config.memoryBackend) {
    configData.memory_backend = config.memoryBackend;
  }

  fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), "utf-8");
}
