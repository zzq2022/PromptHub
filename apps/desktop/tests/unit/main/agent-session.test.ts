/**
 * Tests for agent-session.ts — REST API pass-through to Agent Gateway.
 *
 * Uses global fetch mock (vi.stubGlobal) to avoid real HTTP calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  listAgentSessions,
  getAgentSessionMessages,
  loadAgentMemory,
} from "@prompthub/core";

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────
// listAgentSessions
// ─────────────────────────────────────────────
describe("listAgentSessions", () => {
  it("returns session list on success", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        sessions: [
          { session_id: "s1", title: "Test session", created_at: 1000, message_count: 5 },
          { session_id: "s2", title: "Another", created_at: 2000, message_count: 0 },
        ],
      }),
    );

    const sessions = await listAgentSessions(18792);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].session_id).toBe("s1");
    expect(sessions[1].title).toBe("Another");

    // Verify URL
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:18792/api/sessions",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("returns empty array if sessions field missing", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));

    const sessions = await listAgentSessions(18792);
    expect(sessions).toEqual([]);
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: "not found" }, 404));

    await expect(listAgentSessions(18792)).rejects.toThrow(
      /session list failed.*404/,
    );
  });

  it("throws on network error", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(listAgentSessions(18792)).rejects.toThrow("ECONNREFUSED");
  });
});

// ─────────────────────────────────────────────
// getAgentSessionMessages
// ─────────────────────────────────────────────
describe("getAgentSessionMessages", () => {
  it("returns messages for a valid session key", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        messages: [
          { role: "user", content: "Hello", timestamp: 1000 },
          { role: "assistant", content: "Hi there!", timestamp: 1001 },
        ],
      }),
    );

    const messages = await getAgentSessionMessages(18792, "session_abc123");
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe("Hello");

    // Verify URL-encoded session key
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/sessions/session_abc123/messages"),
      expect.anything(),
    );
  });

  it("encodes special characters in session key", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ messages: [] }));

    await getAgentSessionMessages(18792, "key/with spaces");

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain(encodeURIComponent("key/with spaces"));
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: "fail" }, 500));

    await expect(getAgentSessionMessages(18792, "s1")).rejects.toThrow(
      /session get failed.*500/,
    );
  });
});

// ─────────────────────────────────────────────
// loadAgentMemory
// ─────────────────────────────────────────────
describe("loadAgentMemory", () => {
  it("returns empty string on success (placeholder implementation)", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));

    const result = await loadAgentMemory(18792);
    expect(result).toBe("");
  });

  it("returns empty string on fetch failure (graceful fallback)", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await loadAgentMemory(18792);
    expect(result).toBe("");
  });

  it("returns empty string on non-ok response", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: "fail" }, 503));

    const result = await loadAgentMemory(18792);
    expect(result).toBe("");
  });
});
