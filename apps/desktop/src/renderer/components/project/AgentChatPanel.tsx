/**
 * AgentChatPanel — Real-time chat panel connected to Agent Gateway via WebSocket.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  BotIcon,
  UserIcon,
  SendIcon,
  StopCircleIcon,
  RefreshCwIcon,
  Loader2Icon,
  WifiIcon,
  WifiOffIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SkillProject, AgentSessionInfo } from "@prompthub/shared/types";
import {
  connectToAgent,
  disconnectFromAgent,
  sendAgentMessage,
  onAgentDelta,
  onAgentTurnEnd,
  onAgentError,
  isAgentConnected,
  switchAgentSession,
  getCachedUserId,
  getDefaultUserId,
} from "../../services/agent-service";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface AgentChatPanelProps {
  project: SkillProject;
  activeSession: AgentSessionInfo | null;
}

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function AgentChatPanel({
  project,
  activeSession,
}: AgentChatPanelProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [connectionError, setConnectionError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const assistantIdRef = useRef<string | null>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Connect to gateway when project changes
  useEffect(() => {
    if (!project.rootPath) return;

    let cancelled = false;

    async function connect() {
      if (isAgentConnected(project.id)) return;

      setConnectionStatus("connecting");
      setConnectionError("");
      try {
        // Ensure userId is cached before connecting
        await getDefaultUserId();
        await connectToAgent(project.id, project.gatewayPort ?? 18792);
        if (!cancelled) {
          setConnectionStatus("connected");
        }
      } catch (err) {
        if (!cancelled) {
          setConnectionStatus("error");
          setConnectionError(
            err instanceof Error ? err.message : "Connection failed",
          );
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      disconnectFromAgent(project.id);
      setConnectionStatus("disconnected");
    };
  }, [project.id, project.rootPath, project.gatewayPort]);

  // Re-attach WebSocket when activeSession changes
  const prevSessionRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = activeSession?.session_id ?? null;
    if (currentId === prevSessionRef.current) return;
    prevSessionRef.current = currentId;

    if (!project.gatewayPort || !currentId) return;

    // Clear messages for the new session
    setMessages([]);
    setIsStreaming(false);
    assistantIdRef.current = null;

    // If already connected, switch session; otherwise establish a new connection
    if (isAgentConnected(project.id)) {
      switchAgentSession(project.id, getCachedUserId(), currentId);
    } else {
      setConnectionStatus("connecting");
      setConnectionError("");
      connectToAgent(project.id, project.gatewayPort ?? 18792, getCachedUserId(), currentId)
        .then(() => setConnectionStatus("connected"))
        .catch((err) => {
          setConnectionStatus("error");
          setConnectionError(err instanceof Error ? err.message : "Connection failed");
        });
    }
  }, [activeSession?.session_id, project.id, project.gatewayPort]);

  // Subscribe to agent events
  useEffect(() => {
    if (connectionStatus !== "connected") return;

    const unsubDelta = onAgentDelta(project.id, (text) => {
      setMessages((prev) => {
        const currentId = assistantIdRef.current;
        if (!currentId) return prev;
        return prev.map((m) =>
          m.id === currentId ? { ...m, content: m.content + text } : m,
        );
      });
    });

    const unsubEnd = onAgentTurnEnd(project.id, () => {
      setIsStreaming(false);
      assistantIdRef.current = null;
    });

    const unsubError = onAgentError(project.id, (error) => {
      setIsStreaming(false);
      assistantIdRef.current = null;
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `⚠️ ${error}`,
          timestamp: Date.now(),
        },
      ]);
    });

    return () => {
      unsubDelta();
      unsubEnd();
      unsubError();
    };
  }, [project.id, connectionStatus]);

  const sendMessage = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || connectionStatus !== "connected") return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };

    const assistantMsg: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    assistantIdRef.current = assistantMsg.id;
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsStreaming(true);

    try {
      sendAgentMessage(project.id, trimmed);
    } catch (err) {
      setIsStreaming(false);
      assistantIdRef.current = null;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? {
                ...m,
                content: `⚠️ ${err instanceof Error ? err.message : "Send failed"}`,
              }
            : m,
        ),
      );
    }
  }, [input, isStreaming, connectionStatus, project.id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  const handleReconnect = useCallback(async () => {
    disconnectFromAgent(project.id);
    setConnectionStatus("connecting");
    setConnectionError("");
    try {
      await connectToAgent(project.id, project.gatewayPort ?? 18792);
      setConnectionStatus("connected");
    } catch (err) {
      setConnectionStatus("error");
      setConnectionError(
        err instanceof Error ? err.message : "Connection failed",
      );
    }
  }, [project.id, project.gatewayPort]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/50">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <BotIcon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-medium">{project.name}</div>
            <div className="text-[11px] text-muted-foreground truncate max-w-[300px]">
              {activeSession?.title ?? t("agentProject.noSession")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            {connectionStatus === "connected" && (
              <>
                <WifiIcon className="h-3.5 w-3.5 text-green-500" />
                <span className="text-[11px] text-green-600">
                  {t("agentProject.connected")}
                </span>
              </>
            )}
            {connectionStatus === "connecting" && (
              <>
                <Loader2Icon className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">
                  {t("agentProject.connecting")}
                </span>
              </>
            )}
            {connectionStatus === "disconnected" && (
              <>
                <WifiOffIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">
                  {t("agentProject.disconnected")}
                </span>
              </>
            )}
            {connectionStatus === "error" && (
              <button
                className="flex items-center gap-1.5 hover:opacity-80"
                onClick={handleReconnect}
              >
                <WifiOffIcon className="h-3.5 w-3.5 text-red-500" />
                <span className="text-[11px] text-red-600">
                  {t("agentProject.reconnect")}
                </span>
              </button>
            )}
          </div>
          <button
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
            onClick={() => setMessages([])}
            title={t("agentProject.clearChat")}
          >
            <RefreshCwIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scroll-shadow">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-4 border border-primary/10">
              <BotIcon className="h-7 w-7 text-primary/40" />
            </div>
            <h2 className="text-base font-semibold text-foreground mb-1">
              {t("agentProject.welcomeTitle", { name: project.name })}
            </h2>
            <p className="text-[13px] text-muted-foreground max-w-xs text-center leading-relaxed">
              {connectionStatus === "connected"
                ? t("agentProject.welcomeDesc")
                : t("agentProject.waitingForGateway")}
            </p>
            {connectionStatus === "connected" && (
              <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-sm">
                {(t("agentProject.suggestedQuestions", {
                  returnObjects: true,
                }) as string[]).map((q) => (
                  <button
                    key={q}
                    className="px-3 py-1.5 text-xs rounded-full border border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => {
                      setInput(q);
                      textareaRef.current?.focus();
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="py-4">
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              return (
                <div key={msg.id} className="px-4 py-1.5">
                  <div className="max-w-2xl mx-auto">
                    {isUser ? (
                      <div className="flex justify-end gap-2">
                        <div>
                          <div className="bg-primary text-primary-foreground px-4 py-2.5 rounded-2xl rounded-tr-md text-sm leading-relaxed shadow-sm">
                            {msg.content}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1 text-right pr-1">
                            {formatTime(msg.timestamp)}
                          </div>
                        </div>
                        <div className="shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center mt-0.5">
                          <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2.5">
                        <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center mt-0.5 shadow-sm">
                          <BotIcon className="w-3.5 h-3.5 text-primary-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="bg-muted/50 px-4 py-2.5 rounded-2xl rounded-tl-md text-sm leading-relaxed shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-border">
                            {msg.content ? (
                              <div className="markdown-content">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {msg.content}
                                </ReactMarkdown>
                              </div>
                            ) : (
                              <span className="text-muted-foreground animate-pulse">
                                ...
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1 pl-1">
                            {formatTime(msg.timestamp)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <textarea
            ref={textareaRef}
            className="flex-1 resize-none rounded-xl border border-border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 max-h-[200px]"
            rows={1}
            placeholder={
              connectionStatus === "connected"
                ? t("agentProject.chatPlaceholder")
                : t("agentProject.waitingForGateway")
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming || connectionStatus !== "connected"}
          />
          {isStreaming ? (
            <button
              className="px-4 py-3 rounded-xl text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              onClick={() => setIsStreaming(false)}
            >
              <StopCircleIcon className="h-4 w-4" />
            </button>
          ) : (
            <button
              className="px-4 py-3 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              onClick={sendMessage}
              disabled={!input.trim() || connectionStatus !== "connected"}
            >
              <SendIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
