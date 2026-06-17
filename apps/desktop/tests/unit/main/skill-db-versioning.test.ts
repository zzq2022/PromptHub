import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import Database from "../../../src/main/database/sqlite";
import { SCHEMA } from "../../../src/main/database/schema";
import { SkillDB } from "../../../src/main/database/skill";

describe("SkillDB versioning", () => {
  let tempDir: string;
  let db: Database.Database;
  let skillDb: SkillDB;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-skill-db-"));
    db = new Database(path.join(tempDir, "prompthub.db"));
    db.exec(SCHEMA);
    skillDb = new SkillDB(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("persists currentVersion when creating a snapshot", () => {
    const created = skillDb.create({
      name: "write",
      description: "Write better",
      content: "# Write",
      instructions: "# Write",
      protocol_type: "skill",
      author: "Test",
      tags: ["general"],
      is_favorite: false,
      currentVersion: 0,
      versionTrackingEnabled: true,
    });

    const snapshot = skillDb.createVersion(created.id, "initial snapshot", [
      { relativePath: "SKILL.md", content: "# Write" },
    ]);

    expect(snapshot).toEqual(
      expect.objectContaining({
        skillId: created.id,
        version: 1,
        note: "initial snapshot",
      }),
    );
    expect(skillDb.getById(created.id)?.currentVersion).toBe(1);
    expect(skillDb.getVersions(created.id)).toHaveLength(1);
  });
});
