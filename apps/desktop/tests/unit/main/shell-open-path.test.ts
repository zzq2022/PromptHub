/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDirectoryPath } from "../../../src/main/shell-open-path";

function createDeps() {
  return {
    appDataPath: "/Users/test/Library/Application Support",
    homePath: "/Users/test",
    lstatSync: vi.fn(),
    openPath: vi.fn().mockResolvedValue(""),
    showItemInFolder: vi.fn(),
    statSync: vi.fn(),
  };
}

describe("openDirectoryPath", () => {
  let deps: ReturnType<typeof createDeps>;

  beforeEach(() => {
    deps = createDeps();
  });

  it("reveals a symlink directory entry instead of opening its resolved target", async () => {
    deps.lstatSync.mockReturnValue({ isSymbolicLink: () => true });

    const result = await openDirectoryPath(
      "/Users/test/.cline/skills/unity-project",
      deps,
    );

    expect(result).toEqual({ success: true });
    expect(deps.showItemInFolder).toHaveBeenCalledWith(
      "/Users/test/.cline/skills/unity-project",
    );
    expect(deps.openPath).not.toHaveBeenCalled();
  });

  it("opens normal directories after expanding home tokens", async () => {
    deps.lstatSync.mockReturnValue({ isSymbolicLink: () => false });
    deps.statSync.mockReturnValue({ isDirectory: () => true });

    const result = await openDirectoryPath("~/skills", deps);

    expect(result).toEqual({ success: true });
    expect(deps.openPath).toHaveBeenCalledWith("/Users/test/skills");
  });

  it("rejects existing non-directory paths", async () => {
    deps.lstatSync.mockReturnValue({ isSymbolicLink: () => false });
    deps.statSync.mockReturnValue({ isDirectory: () => false });

    await expect(openDirectoryPath("/tmp/file.txt", deps)).resolves.toEqual({
      success: false,
      error: "Only directories can be opened",
    });
    expect(deps.openPath).not.toHaveBeenCalled();
  });
});
