/**
 * AgentSessionList — Middle column showing Agent sessions.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  MessageSquareIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import type { SkillProject, AgentSessionInfo } from "@prompthub/shared/types";
import { useSettingsStore } from "../../stores/settings.store";

interface AgentSessionListProps {
  project: SkillProject;
  activeSessionId: string | null;
  onSelectSession: (session: AgentSessionInfo) => void;
  onNewChat: () => void;
  retryDelayMs?: number;
  maxRetryCount?: number;
  refreshTrigger?: number;
}

function formatSessionTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) return d.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export function AgentSessionList({
  project,
  activeSessionId,
  onSelectSession,
  onNewChat,
  retryDelayMs = 1500,
  maxRetryCount = 20,
  refreshTrigger,
}: AgentSessionListProps) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<AgentSessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isWaitingForGateway, setIsWaitingForGateway] = useState(false);

  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sessionsRef = useRef<AgentSessionInfo[]>([]);
  sessionsRef.current = sessions;

  const fetchSessions = useCallback(async (retryCount = 0) => {
    if (!project.gatewayPort) return;

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // Only show loading spinner on initial load, not on background retries
    if (sessionsRef.current.length === 0 && retryCount === 0) {
      setLoading(true);
    }
    setError("");

    try {
      const list = await window.api.agent.listSessions(project.gatewayPort);
      setSessions(list);
      setIsWaitingForGateway(false);
      setError("");
      setLoading(false);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "";
      const isConnectionError =
        errMsg.includes("fetch failed") ||
        errMsg.includes("ECONNREFUSED") ||
        errMsg.includes("TypeError");

      if (isConnectionError && retryCount < maxRetryCount) {
        setIsWaitingForGateway(true);
        setLoading(false);
        retryTimeoutRef.current = setTimeout(() => {
          fetchSessions(retryCount + 1);
        }, retryDelayMs);
      } else {
        setIsWaitingForGateway(false);
        setError(
          err instanceof Error
            ? err.message
            : t("agentProject.sessionLoadFailed"),
        );
        setLoading(false);

        // If gateway is unreachable after max retries, clear the stale gateway state
        if (isConnectionError) {
          console.warn(`[AgentSessionList] Gateway on port ${project.gatewayPort} is unreachable. Clearing stale gateway state.`);
          const updateAgentGateway = useSettingsStore.getState().updateAgentGateway;
          updateAgentGateway(project.id, null);
        }
      }
    }
  }, [project.gatewayPort, t, retryDelayMs, maxRetryCount]);

  // Fetch sessions when project changes or gateway port updates
  useEffect(() => {
    if (project.gatewayPort) {
      fetchSessions(0);
    }
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [project.id, project.gatewayPort, fetchSessions, refreshTrigger]);

  const displaySessions = useMemo(() => {
    if (!activeSessionId) return sessions;
    const exists = sessions.some((s) => s.session_id === activeSessionId);
    if (exists) return sessions;
    return [
      {
        session_id: activeSessionId,
        title: activeSessionId,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        message_count: 0,
      },
      ...sessions,
    ];
  }, [sessions, activeSessionId]);

  const handleDeleteSession = useCallback(
    async (sessionKey: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!project.gatewayPort) return;
      try {
        await window.api.agent.deleteSession(project.gatewayPort, sessionKey);
        setSessions((prev) => prev.filter((s) => s.session_id !== sessionKey));
      } catch (err) {
        // Silent fail — session may already be deleted
      }
    },
    [project.gatewayPort],
  );

  return (
    <div className="flex flex-col h-full border-r border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {t("agentProject.sessions")}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            onClick={onNewChat}
            title={t("agentProject.newChat")}
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
          <button
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            onClick={() => fetchSessions(0)}
            title={t("agentProject.refreshSessions")}
          >
            <RefreshCwIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {loading && displaySessions.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isWaitingForGateway ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground mb-3" />
            <p className="text-xs text-muted-foreground">
              {t("agentProject.waitingForGateway")}
            </p>
          </div>
        ) : error ? (
          <div className="p-3 text-xs text-red-500">{error}</div>
        ) : displaySessions.length === 0 ? (
          <div className="p-4 text-center">
            <MessageSquareIcon className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              {t("agentProject.noSessions")}
            </p>
          </div>
        ) : (
          <div className="p-1.5">
            {displaySessions.map((session) => {
              const isActive = session.session_id === activeSessionId;
              const title = session.title || session.session_id;
              const timeStr = formatSessionTime(
                session.updated_at ?? session.created_at,
              );

              return (
                <button
                  key={session.session_id}
                  className={`w-full text-left px-3 py-2 rounded-lg mb-0.5 group transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted/50 text-foreground"
                  }`}
                  onClick={() => onSelectSession(session)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {title}
                      </div>
                      {timeStr && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {timeStr}
                          {session.message_count > 0 && (
                            <span className="ml-1.5">
                              · {session.message_count}{" "}
                              {t("agentProject.messages")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleDeleteSession(session.session_id, e)}
                      title={t("agentProject.deleteSession")}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
