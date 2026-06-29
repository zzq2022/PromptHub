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
type ConnectionChangeCallback = (connected: boolean) => void;
type ReasoningDeltaCallback = (text: string) => void;

interface AgentConnection {
  ws: WebSocket;
  projectId: string;
  port: number;
  chatId: string;
  deltaCallbacks: Set<DeltaCallback>;
  turnEndCallbacks: Set<TurnEndCallback>;
  errorCallbacks: Set<ErrorCallback>;
  attachedCallbacks: Set<AttachedCallback>;
  connectionChangeCallbacks: Set<ConnectionChangeCallback>;
  reasoningDeltaCallbacks: Set<ReasoningDeltaCallback>;
}

const connections = new Map<string, AgentConnection>();
const connectionChangeListeners = new Map<string, Set<ConnectionChangeCallback>>();

function notifyConnectionChange(projectId: string, connected: boolean): void {
  const listeners = connectionChangeListeners.get(projectId);
  if (listeners) {
    for (const cb of listeners) {
      try {
        cb(connected);
      } catch (err) {
        console.error("Error in connection change callback:", err);
      }
    }
  }
}

let cachedUserId: string | null = null;

/** Maximum delay between reconnection attempts (caps exponential backoff). */
const RECONNECT_DELAY_MS = 2000;
/** Number of reconnection attempts before giving up. */
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
 * Single-shot WebSocket connection attempt.
 * Resolves when the "attached" event is received, rejects on error or close.
 */
function connectOnce(
  projectId: string,
  port: number,
  chatId: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const wsUrl = `ws://127.0.0.1:${port}`;
    const ws = new WebSocket(wsUrl);
    let settled = false;

    const conn: AgentConnection = {
      ws,
      projectId,
      port,
      chatId,
      deltaCallbacks: new Set(),
      turnEndCallbacks: new Set(),
      errorCallbacks: new Set(),
      attachedCallbacks: new Set(),
      connectionChangeCallbacks: new Set(),
      reasoningDeltaCallbacks: new Set(),
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
          if (!settled) {
            settled = true;
            resolve();
          }
          for (const cb of conn.attachedCallbacks) {
            cb(chatId);
          }
          notifyConnectionChange(projectId, true);
          return;
        }

        if (data.event === "delta" && typeof data.text === "string") {
          for (const cb of conn.deltaCallbacks) {
            cb(data.text);
          }
          return;
        }

        // Handle final message event (sent when streaming completes)
        if (data.event === "message" && typeof data.text === "string") {
          for (const cb of conn.deltaCallbacks) {
            cb(data.text);
          }
          return;
        }

        // Handle streaming end signal
        if (data.event === "stream_end") {
          return;
        }

        if (data.event === "turn_end") {
          for (const cb of conn.turnEndCallbacks) {
            cb();
          }
          return;
        }

        if (data.event === "reasoning_delta" && typeof data.text === "string") {
          for (const cb of conn.reasoningDeltaCallbacks) {
            cb(data.text);
          }
          return;
        }

        if (data.event === "reasoning_end") {
          // Reasoning ended — can notify reasoning callbacks with empty string
          for (const cb of conn.reasoningDeltaCallbacks) {
            cb("");
          }
          return;
        }

        // Handle tool execution progress events for display
        if (data.kind === "progress" && Array.isArray(data.tool_events)) {
          const progressText = data.tool_events
            .map((evt: { name?: string; phase?: string; result?: string; error?: string }) => {
              const phase = evt.phase === "start" ? "▶" : evt.phase === "end" ? "✓" : "•";
              const name = evt.name ?? "tool";
              const summary = evt.result
                ? `\n  └ ${evt.result.slice(0, 120)}`
                : evt.error
                  ? `\n  └ ❌ ${evt.error.slice(0, 120)}`
                  : "";
              return `${phase} ${name}${summary}`;
            })
            .join("\n");

          if (progressText) {
            for (const cb of conn.deltaCallbacks) {
              cb(`\n\`\`\`tool\n${progressText}\n\`\`\`\n`);
            }
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
      if (!settled) {
        settled = true;
        reject(new Error(`Failed to connect to Agent Gateway on port ${port}`));
      }
    };

    ws.onclose = () => {
      connections.delete(projectId);
      if (!settled) {
        settled = true;
        reject(new Error("WebSocket closed before connection was established"));
      }
      notifyConnectionChange(projectId, false);
    };
  });
}

/**
 * Connect to an Agent Gateway via WebSocket with exponential backoff retry.
 *
 * Retry pattern (up to MAX_RECONNECT_ATTEMPTS):
 *   Attempt 1: immediate
 *   Attempt 2: ~200ms
 *   Attempt 3: ~600ms
 *   (total window ≈ 800ms before MAX_RECONNECT_DELAY_MS kicks in)
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

  // Resolve chat ID
  let chatId: string;
  if (sessionId && sessionId.startsWith("websocket:")) {
    // Existing session from nanobot — strip the "websocket:" prefix
    // so the server finds the existing session key
    chatId = sessionId.slice("websocket:".length);
  } else {
    const resolvedUserId = userId ?? getCachedUserId();
    const resolvedSessionId = sessionId ?? generateSessionId();
    chatId = buildChatId(resolvedUserId, resolvedSessionId);
  }

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
    try {
      return await connectOnce(projectId, port, chatId);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RECONNECT_ATTEMPTS - 1) {
        // Exponential backoff: 200ms, 600ms, 1400ms, ...
        const delay = Math.min(
          RECONNECT_DELAY_MS,
          200 * Math.pow(3, attempt),
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError ?? new Error("Failed to connect to Agent Gateway");
}

/**
 * Disconnect from an Agent Gateway.
 * Closes the WebSocket connection and cleans up all registered callbacks.
 */
export function disconnectFromAgent(projectId: string): void {
  const conn = connections.get(projectId);
  if (!conn) return;

  // Properly close the WebSocket
  try {
    conn.ws.close(1000, "Client disconnect");
  } catch {
    // WebSocket already closed — ignore
  }

  // Clear all callbacks
  conn.deltaCallbacks.clear();
  conn.turnEndCallbacks.clear();
  conn.errorCallbacks.clear();
  conn.attachedCallbacks.clear();
  conn.reasoningDeltaCallbacks.clear();

  connections.delete(projectId);
  notifyConnectionChange(projectId, false);
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

  conn.chatId = sessionId.startsWith("websocket:")
    ? sessionId.slice("websocket:".length)
    : buildChatId(userId, sessionId);

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
 * Subscribe to reasoning_delta events (thinking process).
 * Returns an unsubscribe function.
 */
export function onAgentReasoningDelta(
  projectId: string,
  callback: ReasoningDeltaCallback,
): () => void {
  const conn = connections.get(projectId);
  if (!conn) return () => {};

  conn.reasoningDeltaCallbacks.add(callback);
  return () => {
    conn.reasoningDeltaCallbacks.delete(callback);
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
 * Subscribe to connection status changes (connected/disconnected).
 * Fires immediately with the current status, then on every change.
 * Returns an unsubscribe function.
 */
export function onAgentConnectionChange(
  projectId: string,
  callback: ConnectionChangeCallback,
): () => void {
  let listeners = connectionChangeListeners.get(projectId);
  if (!listeners) {
    listeners = new Set();
    connectionChangeListeners.set(projectId, listeners);
  }
  listeners.add(callback);

  // Fire immediately with current status
  const connected = isAgentConnected(projectId);
  callback(connected);

  return () => {
    const sets = connectionChangeListeners.get(projectId);
    if (sets) {
      sets.delete(callback);
      if (sets.size === 0) {
        connectionChangeListeners.delete(projectId);
      }
    }
  };
}

/**
 * Check if a project is currently connected.
 */
export function isAgentConnected(projectId: string): boolean {
  const conn = connections.get(projectId);
  if (!conn) return false;
  return conn.ws.readyState === WebSocket.OPEN;
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
