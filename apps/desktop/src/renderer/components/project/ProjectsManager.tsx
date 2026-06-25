import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  FolderPlusIcon,
  PencilIcon,
  TrashIcon,
  SearchIcon,
  BotIcon,
  RefreshCwIcon,
  UserIcon,
  SendIcon,
  StopCircleIcon,
  CopyIcon,
  CheckIcon,
  SparklesIcon,
  PlayIcon,
  SquareIcon,
  GaugeIcon,
} from "lucide-react";
import { useSettingsStore } from "../../stores/settings.store";
import { useToast } from "../ui/Toast";
import { Modal } from "../ui/Modal";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Input } from "../ui/Input";
import { ProjectCard } from "../shared/ProjectCard";
import type { SkillProject, AgentSessionInfo } from "@prompthub/shared/types";
import { chatCompletion, type AIConfig } from "../../services/ai";
import { resolveScenarioAIConfig } from "../../services/ai-defaults";
import { generateSessionId } from "../../services/agent-service";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// --- Agent-specific imports ---
import { CreateAgentDialog } from "./CreateAgentDialog";
import { ImportProjectDialog } from "./ImportProjectDialog";
import { AgentChatPanel } from "./AgentChatPanel";
import { AgentSessionList } from "./AgentSessionList";

// --- Chat message type ------------------------------------------------
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// --- ProjectFormModal -------------------------------------------------
interface ProjectFormModalProps {
  isOpen: boolean;
  editingProject: SkillProject | null;
  onClose: () => void;
  onSaved: () => void;
}

function ProjectFormModal({
  isOpen,
  editingProject,
  onClose,
  onSaved,
}: ProjectFormModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const addSkillProject = useSettingsStore((s) => s.addSkillProject);
  const updateSkillProject = useSettingsStore((s) => s.updateSkillProject);

  const [name, setName] = useState("");
  const [rootPath, setRootPath] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(editingProject?.name ?? "");
      setRootPath(editingProject?.rootPath ?? "");
    }
  }, [isOpen, editingProject]);

  const handleBrowse = useCallback(async () => {
    const selected = await window.electron?.selectFolder?.();
    if (selected) {
      setRootPath(selected);
      if (!name) {
        const parts = selected
          .replace(/\\/g, "/")
          .replace(/\/+$/, "")
          .split("/");
        setName(parts[parts.length - 1] ?? "");
      }
    }
  }, [name]);

  const handleSave = useCallback(async () => {
    if (!name.trim() || !rootPath.trim()) return;
    setSaving(true);
    try {
      if (editingProject) {
        updateSkillProject(editingProject.id, {
          name: name.trim(),
          rootPath: rootPath.trim(),
        });
      } else {
        addSkillProject({ name: name.trim(), rootPath: rootPath.trim() });
      }
      showToast(t("projects.title"), "success");
      onSaved();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setSaving(false);
    }
  }, [
    name,
    rootPath,
    editingProject,
    addSkillProject,
    updateSkillProject,
    showToast,
    t,
    onSaved,
    onClose,
  ]);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6 max-w-lg w-full">
        <h2 className="text-lg font-semibold mb-4">
          {editingProject
            ? t("projects.editProject")
            : t("projects.addProject")}
        </h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">
              {t("projects.nameLabel")}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("projects.namePlaceholder")}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">
              {t("projects.pathLabel")}
            </label>
            <div className="flex gap-2">
              <Input
                value={rootPath}
                onChange={(e) => setRootPath(e.target.value)}
                placeholder={t("projects.pathPlaceholder")}
                className="flex-1"
              />
              <button
                className="px-3 py-1.5 text-sm bg-muted rounded-md hover:bg-muted/80"
                onClick={handleBrowse}
              >
                {t("projects.selectFolder")}
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("projects.addProjectHint")}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              className="px-4 py-2 text-sm rounded-md hover:bg-muted"
              onClick={onClose}
            >
              {t("common.cancel")}
            </button>
            <button
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              onClick={handleSave}
              disabled={saving || !name.trim() || !rootPath.trim()}
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// --- Copy button ------------------------------------------------------
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);
  return (
    <button
      className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
      onClick={handleCopy}
      title="Copy"
    >
      {copied ? (
        <CheckIcon className="w-3.5 h-3.5 text-green-500" />
      ) : (
        <CopyIcon className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

// --- Markdown with code copy ------------------------------------------
function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ children, ...props }) => (
          <div className="relative group my-2">
            <pre
              className="bg-muted/50 rounded-lg p-3 overflow-x-auto text-sm"
              {...props}
            >
              {children}
            </pre>
          </div>
        ),
        code: ({ className, children, ...props }) => {
          const isInline = !className;
          return isInline ? (
            <code
              className="bg-muted/50 px-1.5 py-0.5 rounded text-sm font-mono"
              {...props}
            >
              {children}
            </code>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// --- ProjectChatPanel -------------------------------------------------
interface ProjectChatPanelProps {
  project: SkillProject;
}

const QUICK_HINTS = [
  "projects.hintHelp",
  "projects.hintAnalyze",
  "projects.hintExplain",
  "projects.hintPlan",
];

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function ProjectChatPanel({ project }: ProjectChatPanelProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const aiModels = useSettingsStore((s) => s.aiModels);
  const scenarioModelDefaults = useSettingsStore(
    (s) => s.scenarioModelDefaults,
  );
  const modelRouteDefaults = useSettingsStore((s) => s.modelRouteDefaults);
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const aiApiProtocol = useSettingsStore((s) => s.aiApiProtocol);
  const aiApiKey = useSettingsStore((s) => s.aiApiKey);
  const aiApiUrl = useSettingsStore((s) => s.aiApiUrl);
  const aiModel = useSettingsStore((s) => s.aiModel);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const aiConfig = useMemo<AIConfig | null>(
    () =>
      resolveScenarioAIConfig({
        aiModels,
        scenarioModelDefaults,
        modelRouteDefaults,
        scenario: "chat",
        type: "chat",
        aiProvider,
        aiApiProtocol,
        aiApiKey,
        aiApiUrl,
        aiModel,
      }),
    [
      aiModels,
      scenarioModelDefaults,
      modelRouteDefaults,
      aiProvider,
      aiApiProtocol,
      aiApiKey,
      aiApiUrl,
      aiModel,
    ],
  );

  const sendMessage = useCallback(
    async (text?: string) => {
      const trimmed = (text ?? input).trim();
      if (!trimmed || isStreaming) return;
      if (!aiConfig) {
        showToast(t("projects.noModelConfigured"), "error");
        return;
      }

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

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");
      setIsStreaming(true);

      const systemMessage = {
        role: "system" as const,
        content: `You are an AI agent for the project "${project.name}" (root: ${project.rootPath}). Help the user with tasks related to this project. Respond concisely and helpfully.`,
      };

      const chatMessages = [
        systemMessage,
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: trimmed },
      ];

      try {
        const result = await chatCompletion(aiConfig, chatMessages, {
          stream: true,
          onStream: (chunk: string) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, content: m.content + chunk }
                  : m,
              ),
            );
          },
        });

        if (result.content) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: result.content } : m,
            ),
          );
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : t("projects.chatError");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: `⚠️ ${errorMsg}` } : m,
          ),
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [
      input,
      isStreaming,
      aiConfig,
      messages,
      project.name,
      project.rootPath,
      t,
      showToast,
    ],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const handleClear = useCallback(() => {
    setMessages([]);
    setInput("");
  }, []);

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
              {project.rootPath}
            </div>
          </div>
        </div>
        <button
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
          onClick={handleClear}
          title={t("projects.clearSession")}
        >
          <RefreshCwIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scroll-shadow">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-4 border border-primary/10">
              <BotIcon className="h-7 w-7 text-primary/40" />
            </div>
            <h2 className="text-base font-semibold text-foreground mb-1">
              {t("projects.welcomeTitle", { name: project.name })}
            </h2>
            <p className="text-[13px] text-muted-foreground max-w-xs text-center leading-relaxed mb-5">
              {t("projects.welcomeDesc")}
            </p>
            <div className="flex flex-wrap gap-2 max-w-md justify-center">
              {QUICK_HINTS.map((key) => (
                <button
                  key={key}
                  onClick={() => sendMessage(t(key))}
                  className="px-3 py-1.5 rounded-full text-[12px] text-muted-foreground bg-muted/50 border border-border hover:bg-muted hover:text-foreground transition-all"
                >
                  {t(key)}
                </button>
              ))}
            </div>
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
                                <MarkdownContent content={msg.content} />
                              </div>
                            ) : (
                              <span className="text-muted-foreground animate-pulse">
                                ...
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1 pl-1 flex items-center gap-1">
                            {formatTime(msg.timestamp)}
                            {msg.content && <CopyButton text={msg.content} />}
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
            placeholder={t("projects.chatPlaceholder", { name: project.name })}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              className="px-4 py-3 rounded-xl text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              onClick={handleStop}
            >
              <StopCircleIcon className="h-4 w-4" />
            </button>
          ) : (
            <button
              className="px-4 py-3 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              onClick={() => sendMessage()}
              disabled={!input.trim()}
            >
              <SendIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- ProjectsManager (main export) ------------------------------------
export function ProjectsManager() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const skillProjects = useSettingsStore((s) => s.skillProjects);
  const removeSkillProject = useSettingsStore((s) => s.removeSkillProject);
  const updateAgentGateway = useSettingsStore((s) => s.updateAgentGateway);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<SkillProject | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<SkillProject | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Agent-specific state
  const [isCreateAgentOpen, setIsCreateAgentOpen] = useState(false);
  const [isImportAgentOpen, setIsImportAgentOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<AgentSessionInfo | null>(
    null,
  );
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [gatewayProgress, setGatewayProgress] = useState("");

  const displayedProjects = useMemo(() => {
    // Show ALL projects (unified list — no tab separation)
    if (!searchQuery.trim()) return skillProjects;
    const q = searchQuery.toLowerCase();
    return skillProjects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.rootPath.toLowerCase().includes(q),
    );
  }, [skillProjects, searchQuery]);

  const selectedProject = useMemo(
    () => skillProjects.find((p) => p.id === selectedProjectId) ?? null,
    [skillProjects, selectedProjectId],
  );

  const isAgentProject =
    selectedProject?.origin === "template" ||
    selectedProject?.origin === "imported";

  // Reset active session when project changes
  useEffect(() => {
    setActiveSessionId(null);
    setActiveSession(null);
  }, [selectedProjectId]);

  // ── Startup: verify saved gateway PIDs and clear stale ones ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const project of skillProjects) {
        if (!project.gatewayPid && !project.gatewayPort) continue;
        if (cancelled) return;
        try {
          const isAlive = await window.api.agent.verifyProcessPid(
            project.gatewayPid ?? 0,
          );
          if (!isAlive && !cancelled) {
            console.log(
              `[GatewayStartup] Stale gateway detected for "${project.name}" (PID ${project.gatewayPid}), clearing state`,
            );
            updateAgentGateway(project.id, null);
          }
        } catch {
          // If verify fails (e.g. channel not ready), skip silently
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // Run once on mount

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    try {
      removeSkillProject(deleteTarget.id);
      if (selectedProjectId === deleteTarget.id) {
        setSelectedProjectId(null);
      }
      showToast(
        isAgentProject ? t("agentProject.deleteSuccess") : t("projects.title"),
        "success",
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error", "error");
    }
    setDeleteTarget(null);
  }, [
    deleteTarget,
    removeSkillProject,
    selectedProjectId,
    showToast,
    t,
    isAgentProject,
  ]);

  // Gateway start/stop handlers
  const handleGatewayToggle = useCallback(async () => {
    if (!selectedProject?.rootPath) return;
    setGatewayLoading(true);
    setGatewayProgress(t("agentProject.progressPreparing"));
    try {
      if (selectedProject.gatewayPort) {
        setGatewayProgress(t("agentProject.progressStopping"));
        await window.api.agent.stopGateway(selectedProject.rootPath);
        updateAgentGateway(selectedProject.id, null);
        showToast(t("agentProject.gatewayStopped"), "success");
      } else {
        // Show progressive status messages during startup
        setGatewayProgress(t("agentProject.progressPython"));
        // Use timeout-based progress for visual feedback since IPC is a single call
        const progressTimer = setTimeout(() => {
          setGatewayProgress(t("agentProject.progressSpawning"));
        }, 3000);
        const healthCheckTimer = setTimeout(() => {
          setGatewayProgress(t("agentProject.progressHealthCheck"));
        }, 8000);

        try {
          const result = await window.api.agent.startGateway(
            selectedProject.rootPath,
            selectedProject.gatewayPort,
          );
          clearTimeout(progressTimer);
          clearTimeout(healthCheckTimer);
          setGatewayProgress("");
          updateAgentGateway(selectedProject.id, {
            gatewayPort: result.port,
            gatewayPid: result.pid,
          });
          showToast(
            t("agentProject.gatewayRunning", { port: result.port }),
            "success",
          );
        } catch (err) {
          clearTimeout(progressTimer);
          clearTimeout(healthCheckTimer);
          setGatewayProgress("");
          showToast(
            err instanceof Error
              ? err.message
              : t("agentProject.gatewayStartFailed"),
            "error",
          );
        }
      }
    } catch (err) {
      // Stop case error (start case has its own inner catch)
      setGatewayProgress("");
      showToast(
        err instanceof Error
          ? err.message
          : t("agentProject.gatewayStopFailed"),
        "error",
      );
    } finally {
      setGatewayLoading(false);
    }
  }, [selectedProject, updateAgentGateway, showToast, t]);

  return (
    <div className="flex h-full">
      {/* Left: Project list */}
      <div className="w-72 border-r border-border flex flex-col shrink-0 bg-card/30">
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">
              {t("agentProject.agentTab")}
            </h2>
            <div className="flex gap-1">
              <button
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                onClick={() => setIsCreateAgentOpen(true)}
                title={t("agentProject.createTitle")}
              >
                <FolderPlusIcon className="h-4 w-4" />
              </button>
              <button
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                onClick={() => setIsImportAgentOpen(true)}
                title={t("agentProject.importTitle")}
              >
                <GaugeIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-border bg-background"
              placeholder={t("common.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 p-2">
          {displayedProjects.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t("projects.emptyHint")}
            </div>
          ) : (
            displayedProjects.map((project) => (
              <ProjectCard
                key={project.id}
                name={project.name}
                rootPath={project.rootPath}
                isActive={selectedProjectId === project.id}
                onClick={() => setSelectedProjectId(project.id)}
                actions={
                  <>
                    <button
                      className="p-1 rounded hover:bg-destructive/10 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(project);
                      }}
                      title={t("projects.deleteProject")}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </>
                }
              />
            ))
          )}
        </div>
      </div>

      {/* Middle: Agent session list (only for agent projects with gateway running) */}
      {isAgentProject && selectedProject?.gatewayPort && (
        <div className="w-56 shrink-0">
          <AgentSessionList
            project={selectedProject}
            activeSessionId={activeSessionId}
            onSelectSession={(session) => {
              setActiveSessionId(session.session_id);
              setActiveSession(session);
            }}
            onNewChat={() => {
              const newId = generateSessionId();
              setActiveSessionId(newId);
              setActiveSession({
                session_id: newId,
                title: newId,
                created_at: Date.now() / 1000,
                updated_at: Date.now() / 1000,
                message_count: 0,
              });
              // AgentChatPanel will detect the new session and connect/switch
            }}
          />
        </div>
      )}

      {/* Right: Chat panel or empty state */}
      <div className="flex-1 min-w-0">
        {selectedProject ? (
          isAgentProject ? (
            selectedProject.gatewayPort ? (
              <AgentChatPanel
                project={selectedProject}
                activeSession={activeSession}
              />
            ) : (
              // Agent project with no gateway running
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-4 border border-primary/10">
                  <BotIcon className="h-8 w-8 text-primary/30" />
                </div>
                <p className="text-sm text-muted-foreground mb-4 max-w-xs">
                  {t("agentProject.startAgentHint")}
                </p>
                <button
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  onClick={handleGatewayToggle}
                  disabled={gatewayLoading}
                >
                  {gatewayLoading ? (
                    <RefreshCwIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlayIcon className="h-4 w-4" />
                  )}
                  {gatewayLoading
                    ? t("agentProject.gatewayStarting")
                    : t("agentProject.gatewayStart")}
                </button>
                {gatewayLoading && gatewayProgress && (
                  <div className="mt-3 flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" />
                      {gatewayProgress}
                    </div>
                  </div>
                )}
              </div>
            )
          ) : (
            <ProjectChatPanel project={selectedProject} />
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-4 border border-primary/10">
              <SparklesIcon className="h-8 w-8 text-primary/30" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              {t("projects.selectProjectHint")}
            </p>
            <p className="text-xs text-muted-foreground/60">
              {t("projects.selectProjectSubHint")}
            </p>
          </div>
        )}
      </div>

      {/* Skill project form modal */}
      <ProjectFormModal
        isOpen={isFormOpen}
        editingProject={editingProject}
        onClose={() => {
          setIsFormOpen(false);
          setEditingProject(null);
        }}
        onSaved={() => {}}
      />

      {/* Agent project dialogs */}
      <CreateAgentDialog
        isOpen={isCreateAgentOpen}
        onClose={() => setIsCreateAgentOpen(false)}
        onCreated={(result) => {
          // The core already copied the project. Add it to the store.
          const addSkillProject = useSettingsStore.getState().addSkillProject;
          addSkillProject({
            name: result.name,
            rootPath: result.rootPath,
            origin: "template",
          });
        }}
      />
      <ImportProjectDialog
        isOpen={isImportAgentOpen}
        onClose={() => setIsImportAgentOpen(false)}
        onImported={(result) => {
          const addSkillProject = useSettingsStore.getState().addSkillProject;
          addSkillProject({
            name: result.name,
            rootPath: result.rootPath,
            origin: "imported",
          });
        }}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={t("projects.deleteProject")}
        message={
          isAgentProject
            ? t("agentProject.confirmDelete", {
                name: deleteTarget?.name ?? "",
              })
            : t("projects.deleteProjectConfirm", {
                name: deleteTarget?.name ?? "",
              })
        }
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
        variant="destructive"
      />
    </div>
  );
}
