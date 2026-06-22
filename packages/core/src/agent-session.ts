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
  const data = (await resp.json()) as { sessions: AgentSessionInfo[] };
  return data.sessions ?? [];
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
  const data = (await resp.json()) as { messages: AgentSessionMessage[] };
  return data.messages ?? [];
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
