/**
 * Resolve the resources path for Agent template and venv.
 *
 * - Packaged: process.resourcesPath (e.g. C:\Users\...\AppData\Local\Programs\PromptHub\resources)
 * - Dev: apps/desktop/resources/
 */

import path from "path";
import fs from "fs";

let cachedResourcesPath: string | null = null;

export function getAgentResourcesPath(): string {
  if (cachedResourcesPath && fs.existsSync(cachedResourcesPath)) {
    return cachedResourcesPath;
  }

  // Packaged app: use Electron's resourcesPath
  if (process.resourcesPath) {
    const packaged = process.resourcesPath;
    if (fs.existsSync(path.join(packaged, "agent-template"))) {
      cachedResourcesPath = packaged;
      return packaged;
    }
  }

  // Dev mode: walk up from __dirname to find apps/desktop/resources
  let current = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(current, "resources");
    if (fs.existsSync(path.join(candidate, "agent-template"))) {
      cachedResourcesPath = candidate;
      return candidate;
    }
    current = path.dirname(current);
  }

  // Fallback: assume relative to app root
  const fallback = path.join(process.cwd(), "apps", "desktop", "resources");
  cachedResourcesPath = fallback;
  return fallback;
}
