/**
 * AgentService — WebSocket connection manager for Agent Gateway.
 *
 * Runs in the renderer process. Uses the browser-native WebSocket API
 * to connect directly to Agent Gateway (ws://localhost:PORT), bypassing
 * Electron IPC for real-time streaming.
 */

type DeltaCallback = (text: string) => void;
type TurnEndCallback = () => void;
type ErrorCallback = (error: string) => void;
type AttachedCallback = (chatId: string) => void;

interface AgentConnection {
  ws: WebSocket;
  projectId: string;
  port: number;
  chatId: string;
  deltaCallbacks: Set<DeltaCallback>;
  turnEndCallbacks: Set<TurnEndCallback>;
  errorCallbacks: Set<ErrorCallback>;
  attachedCallbacks: Set<AttachedCallback>;
}

const connections = new Map<string, AgentConnection>();
let cachedUserId: string | null = null;

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 3;

/**
 * Generate a session ID with timestamp: "session_YYYYMMDD_HHmmss"
 */
export function generateSessionId(): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return [
    "session",
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
  ].join("_");
}

/**
 * Get the default user ID, cached after first call.
 */
export async function getDefaultUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  try {
    cachedUserId = await window.api.agent.getUserId();
  } catch {
    cachedUserId = "user";
  }
  return cachedUserId;
}

/**
 * Synchronous cached user ID (call after getDefaultUserId has been awaited at least once).
 */
export function getCachedUserId(): string {
  return cachedUserId ?? "user";
}

/**
 * Build a chat ID matching Tpa_RuYiBot's format: "{userId}__{sessionId}"
 */
export function buildChatId(userId: string, sessionId: string): string {
  return `${userId}__${sessionId}`;
}

/**
 * Connect to an Agent Gateway via WebSocket.
 */
export async function connectToAgent(
  projectId: string,
  port: number,
  userId?: string,
  sessionId?: string,
): Promise<void> {
  // Disconnect existing connection for this project
  if (connections.has(projectId)) {
    disconnectFromAgent(projectId);
  }

  const resolvedUserId = userId ?? getCachedUserId();
  const resolvedSessionId = sessionId ?? generateSessionId();
  const chatId = buildChatId(resolvedUserId, resolvedSessionId);
  const wsUrl = `ws://127.0.0.1:${port}`;

  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let resolved = false;

    const conn: AgentConnection = {
      ws,
      projectId,
      port,
      chatId,
      deltaCallbacks: new Set(),
      turnEndCallbacks: new Set(),
      errorCallbacks: new Set(),
      attachedCallbacks: new Set(),
    };

    ws.onopen = () => {
      // Send attach message to bind this WebSocket to the chat ID
      ws.send(JSON.stringify({ type: "attach", chat_id: chatId }));
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        if (data.event === "attached") {
          connections.set(projectId, conn);
          if (!resolved) {
            resolved = true;
            resolve();
          }
          for (const cb of conn.attachedCallbacks) {
            cb(chatId);
          }
          return;
        }

        if (data.event === "delta" && typeof data.text === "string") {
          for (const cb of conn.deltaCallbacks) {
            cb(data.text);
          }
          return;
        }

        if (data.event === "turn_end") {
          for (const cb of conn.turnEndCallbacks) {
            cb();
          }
          return;
        }

        if (data.event === "error") {
          const errorMsg = data.data?.message ?? "Unknown error";
          for (const cb of conn.errorCallbacks) {
            cb(errorMsg);
          }
          return;
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onerror = () => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Failed to connect to Agent Gateway on port ${port}`));
      }
    };

    ws.onclose = () => {
      connections.delete(projectId);
      if (!resolved) {
        resolved = true;
        reject(new Error("WebSocket closed before connection was established"));
      }
    };
  });
}

/**
 * Disconnect from an Agent Gateway.
 */
export function disconnectFromAgent(projectId: string): void {
  const conn = connections.get(projectId);
  if (!conn) return;

  try {
    conn.ws.send(
      JSON.stringify({
        type: "attach",
        chat_id: conn.chatId,
      }),
    );
  } catch {
    // WebSocket may be closed — connection will be re-established on next use
  }
}

/**
 * Send a message to the connected Agent.
 */
export function sendAgentMessage(projectId: string, content: string): void {
  const conn = connections.get(projectId);
  if (!conn) {
    throw new Error(`No connection for project ${projectId}`);
  }

  conn.ws.send(
    JSON.stringify({
      type: "message",
      chat_id: conn.chatId,
      content,
    }),
  );
}

/**
 * Switch the active session (re-attaches with a new chat ID).
 */
export function switchAgentSession(
  projectId: string,
  userId: string,
  sessionId: string,
): void {
  const conn = connections.get(projectId);
  if (!conn) return;

  conn.chatId = buildChatId(userId, sessionId);

  // Send new attach message
  conn.ws.send(
    JSON.stringify({
      type: "attach",
      chat_id: conn.chatId,
    }),
  );
}

/**
 * Subscribe to delta events (streaming text).
 * Returns an unsubscribe function.
 */
export function onAgentDelta(
  projectId: string,
  callback: DeltaCallback,
): () => void {
  const conn = connections.get(projectId);
  if (!conn) return () => {};

  conn.deltaCallbacks.add(callback);
  return () => {
    conn.deltaCallbacks.delete(callback);
  };
}

/**
 * Subscribe to turn_end events (agent finished responding).
 * Returns an unsubscribe function.
 */
export function onAgentTurnEnd(
  projectId: string,
  callback: TurnEndCallback,
): () => void {
  const conn = connections.get(projectId);
  if (!conn) return () => {};

  conn.turnEndCallbacks.add(callback);
  return () => {
    conn.turnEndCallbacks.delete(callback);
  };
}

/**
 * Subscribe to error events.
 * Returns an unsubscribe function.
 */
export function onAgentError(
  projectId: string,
  callback: ErrorCallback,
): () => void {
  const conn = connections.get(projectId);
  if (!conn) return () => {};

  conn.errorCallbacks.add(callback);
  return () => {
    conn.errorCallbacks.delete(callback);
  };
}

/**
 * Subscribe to attached events (connection ready).
 * Returns an unsubscribe function.
 */
export function onAgentAttached(
  projectId: string,
  callback: AttachedCallback,
): () => void {
  const conn = connections.get(projectId);
  if (!conn) return () => {};

  conn.attachedCallbacks.add(callback);
  return () => {
    conn.attachedCallbacks.delete(callback);
  };
}

/**
 * Check if a project is currently connected.
 */
export function isAgentConnected(projectId: string): boolean {
  return connections.has(projectId);
}

/**
 * Get the WebSocket URL for a project.
 */
export function getAgentWebSocketUrl(projectId: string): string | null {
  const conn = connections.get(projectId);
  if (!conn) return null;
  return `ws://127.0.0.1:${conn.port}`;
}

/**
 * Disconnect all connections (call on cleanup/unmount).
 */
export function disconnectAll(): void {
  for (const [projectId] of connections) {
    disconnectFromAgent(projectId);
  }
}
