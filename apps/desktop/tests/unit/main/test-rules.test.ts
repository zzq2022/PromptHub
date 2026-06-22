import { describe, it, expect } from "vitest";
import { createProjectRule, removeProjectRule, getProjectMetaById } from "../../../src/main/services/rules-workspace";
import fs from "fs";

describe("Scratch test for project rule", () => {
  it("should create project rule successfully", async () => {
    const input = {
      id: "project_test_123456",
      name: "test_project",
      rootPath: "D:\\apps\\test_project"
    };

    console.log("Creating project rule...");
    const descriptor = await createProjectRule(input);
    console.log("Descriptor:", descriptor);

    console.log("Checking meta file existence on disk...");
    console.log("Managed path:", descriptor.managedPath);
    console.log("Exists:", fs.existsSync(descriptor.managedPath));

    const meta = await getProjectMetaById("project:project_test_123456");
    console.log("Retrieved meta:", meta);

    // Clean up
    await removeProjectRule("project_test_123456");
    console.log("Cleaned up.");
  });
});
