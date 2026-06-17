/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";

import { shouldOpenStartupDevTools } from "../../../src/main/devtools-policy";

describe("devtools startup policy", () => {
  it("keeps DevTools closed by default during dev startup", () => {
    expect(
      shouldOpenStartupDevTools({
        isDev: true,
        isE2E: false,
        env: {},
      }),
    ).toBe(false);
  });

  it("opens DevTools only when explicitly requested", () => {
    expect(
      shouldOpenStartupDevTools({
        isDev: true,
        isE2E: false,
        env: { PROMPTHUB_OPEN_DEVTOOLS: "1" },
      }),
    ).toBe(true);
  });

  it("does not open DevTools in production or E2E mode", () => {
    expect(
      shouldOpenStartupDevTools({
        isDev: false,
        isE2E: false,
        env: { PROMPTHUB_OPEN_DEVTOOLS: "1" },
      }),
    ).toBe(false);
    expect(
      shouldOpenStartupDevTools({
        isDev: true,
        isE2E: true,
        env: { PROMPTHUB_OPEN_DEVTOOLS: "1" },
      }),
    ).toBe(false);
  });
});
