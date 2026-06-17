import type * as fs from "fs";

export interface OpenDirectoryPathDeps {
  appDataPath: string;
  homePath: string;
  lstatSync: typeof fs.lstatSync;
  openPath: (path: string) => Promise<string | void>;
  showItemInFolder: (path: string) => void;
  statSync: typeof fs.statSync;
}

export interface OpenDirectoryPathResult {
  success: boolean;
  error?: string;
}

export function expandShellOpenPath(
  folderPath: string,
  paths: { appDataPath: string; homePath: string },
): string {
  if (folderPath.startsWith("~")) {
    return folderPath.replace("~", paths.homePath);
  }
  if (folderPath.includes("%APPDATA%")) {
    return folderPath.replace("%APPDATA%", paths.appDataPath);
  }
  return folderPath;
}

export async function openDirectoryPath(
  folderPath: string,
  deps: OpenDirectoryPathDeps,
): Promise<OpenDirectoryPathResult> {
  if (typeof folderPath !== "string" || folderPath.trim().length === 0) {
    return {
      success: false,
      error: "shell:openPath requires a non-empty folderPath string",
    };
  }

  const realPath = expandShellOpenPath(folderPath, deps);

  try {
    const lstat = deps.lstatSync(realPath);
    if (lstat.isSymbolicLink()) {
      deps.showItemInFolder(realPath);
      return { success: true };
    }

    if (!deps.statSync(realPath).isDirectory()) {
      return { success: false, error: "Only directories can be opened" };
    }
  } catch {
    // Path may not exist yet. Let Electron return the platform-specific error.
  }

  try {
    const error = await deps.openPath(realPath);
    if (typeof error === "string" && error.trim().length > 0) {
      return { success: false, error };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
