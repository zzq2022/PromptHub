/**
 * Agent Session Proxy — pass-through REST API calls to Agent Gateway.
 *
 * PromptHub main process forwards session/memory requests to the Agent's
 * FastAPI endpoints. The renderer can also connect directly via WebSocket
 * for real-time chat.
 */

import type {
  AgentSessionInfo,
  AgentSessionMessage,
} from "@prompthub/shared/types";

const TIMEOUT_MS = 5000;

/**
 * Build the base URL for an Agent Gateway REST API.
 */
function gatewayBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

/**
 * List all sessions for a given Agent Gateway.
 */
export async function listAgentSessions(
  port: number,
): Promise<AgentSessionInfo[]> {
  const resp = await fetch(`${gatewayBaseUrl(port)}/api/sessions`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`Agent session list failed: ${resp.status} ${resp.statusText}`);
  }
  const data = (await resp.json()) as { sessions: any[] };
  const rawSessions = data.sessions ?? [];
  return rawSessions.map((s) => {
    const createdTime = s.created_at
      ? typeof s.created_at === "number"
        ? s.created_at
        : Math.floor(new Date(s.created_at).getTime() / 1000)
      : 0;
    const updatedTime = s.updated_at
      ? typeof s.updated_at === "number"
        ? s.updated_at
        : Math.floor(new Date(s.updated_at).getTime() / 1000)
      : 0;
    return {
      session_id: s.session_id || s.key || "",
      title: s.title || s.session_id || s.key || "Unnamed Session",
      created_at: isNaN(createdTime) ? 0 : createdTime,
      updated_at: isNaN(updatedTime) ? 0 : updatedTime,
      message_count: s.message_count ?? 0,
    };
  });
}

/**
 * Get messages for a specific session.
 */
export async function getAgentSessionMessages(
  port: number,
  sessionKey: string,
): Promise<AgentSessionMessage[]> {
  const encoded = encodeURIComponent(sessionKey);
  const resp = await fetch(
    `${gatewayBaseUrl(port)}/api/sessions/${encoded}/messages`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!resp.ok) {
    throw new Error(`Agent session get failed: ${resp.status} ${resp.statusText}`);
  }
  const data = (await resp.json()) as { messages: any[] };
  const rawMessages = data.messages ?? [];
  return rawMessages.map((m) => {
    let ts = 0;
    if (m.timestamp) {
      if (typeof m.timestamp === "number") {
        ts = m.timestamp;
      } else {
        const parsed = Date.parse(m.timestamp);
        ts = isNaN(parsed) ? 0 : parsed;
      }
    }
    return {
      role: m.role,
      content: m.content,
      timestamp: ts,
    };
  });
}

/**
 * Load user memory from the Agent Gateway.
 */
export async function loadAgentMemory(port: number): Promise<string> {
  try {
    const resp = await fetch(`${gatewayBaseUrl(port)}/api/settings`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) {
      return "";
    }
    // Memory is read directly from the filesystem by PromptHub
    // This endpoint is a placeholder for future memory API
    return "";
  } catch {
    return "";
  }
}
