/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  configureRuntimePaths,
  getDatabasePath,
  resetRuntimePaths,
  getUserDataPath,
  setActiveAccountId,
  getOSUsername,
} from "../../../src/main/runtime-paths";

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("runtime-paths database selection and account isolation", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = makeTmpDir("runtime-paths-");
  });

  afterEach(() => {
    resetRuntimePaths();
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it("uses legacy root db for old users before db migration is marked complete", () => {
    configureRuntimePaths({ userDataPath: tmpBase });
    const userDataPath = getUserDataPath();
    fs.mkdirSync(path.join(userDataPath, "data"), { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "root-db", "utf8");
    fs.writeFileSync(path.join(userDataPath, "data", "prompthub.db"), "stale-db", "utf8");
    fs.writeFileSync(
      path.join(userDataPath, ".data-layout-v0.5.5.json"),
      JSON.stringify({ version: "0.5.5", movedEntries: ["skills", "images"] }),
      "utf8",
    );

    expect(getDatabasePath()).toBe(path.join(userDataPath, "prompthub.db"));
  });

  it("uses unified data db after db migration marker is complete", () => {
    configureRuntimePaths({ userDataPath: tmpBase });
    const userDataPath = getUserDataPath();
    fs.mkdirSync(path.join(userDataPath, "data"), { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "root-db", "utf8");
    fs.writeFileSync(path.join(userDataPath, "data", "prompthub.db"), "data-db", "utf8");
    fs.writeFileSync(
      path.join(userDataPath, ".data-layout-v0.5.5.json"),
      JSON.stringify({
        version: "0.5.5",
        movedEntries: ["skills", "images", "prompthub.db"],
        dbLayoutVersion: "0.5.7",
      }),
      "utf8",
    );

    expect(getDatabasePath()).toBe(path.join(userDataPath, "data", "prompthub.db"));
  });

  it("uses unified data db for new users when no legacy root db exists", () => {
    configureRuntimePaths({ userDataPath: tmpBase });
    const userDataPath = getUserDataPath();
    fs.mkdirSync(path.join(userDataPath, "data"), { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "data", "prompthub.db"), "data-db", "utf8");

    expect(getDatabasePath()).toBe(path.join(userDataPath, "data", "prompthub.db"));
  });

  it("routes user data path to users/<OS_Username> by default", () => {
    configureRuntimePaths({ userDataPath: tmpBase });
    const osUsername = getOSUsername();
    expect(getUserDataPath()).toBe(path.join(tmpBase, "users", osUsername));
  });

  it("routes user data path to users/<accountId> when activeAccountId is set", () => {
    configureRuntimePaths({ userDataPath: tmpBase });
    setActiveAccountId("test_account_123");
    expect(getUserDataPath()).toBe(path.join(tmpBase, "users", "test_account_123"));
  });

  it("falls back to users/<OS_Username> when activeAccountId is cleared", () => {
    configureRuntimePaths({ userDataPath: tmpBase });
    setActiveAccountId("test_account_123");
    expect(getUserDataPath()).toBe(path.join(tmpBase, "users", "test_account_123"));

    setActiveAccountId(null);
    const osUsername = getOSUsername();
    expect(getUserDataPath()).toBe(path.join(tmpBase, "users", osUsername));
  });
});
