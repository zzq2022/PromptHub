import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  FolderOpenIcon,
  FolderPlusIcon,
  PencilIcon,
  TrashIcon,
  SearchIcon,
  BotIcon,
  RefreshCwIcon,
  UserIcon,
  SendIcon,
  StopCircleIcon,
} from "lucide-react";
import { useSettingsStore } from "../../stores/settings.store";
import { useToast } from "../ui/Toast";
import { Modal } from "../ui/Modal";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Input } from "../ui/Input";
import type { SkillProject } from "@prompthub/shared/types";
import { chatCompletion, type AIConfig } from "../../services/ai";
import { resolveScenarioAIConfig } from "../../services/ai-defaults";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ─── Chat message type ───────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  thinking?: string;
}

// ─── ProjectFormModal ────────────────────────────────────────────────
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
        const parts = selected.replace(/\\/g, "/").replace(/\/+$/, "").split("/");
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
  }, [name, rootPath, editingProject, addSkillProject, updateSkillProject, showToast, t, onSaved, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6 max-w-lg w-full">
        <h2 className="text-lg font-semibold mb-4">
          {editingProject ? t("projects.editProject") : t("projects.addProject")}
        </h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">{t("projects.nameLabel")}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("projects.namePlaceholder")}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">{t("projects.pathLabel")}</label>
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
          <p className="text-xs text-muted-foreground">{t("projects.addProjectHint")}</p>
          <div className="flex justify-end gap-2 pt-2">
            <button className="px-4 py-2 text-sm rounded-md hover:bg-muted" onClick={onClose}>
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

// ─── ProjectChatPanel ────────────────────────────────────────────────
interface ProjectChatPanelProps {
  project: SkillProject;
}

function ProjectChatPanel({ project }: ProjectChatPanelProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const aiModels = useSettingsStore((s) => s.aiModels);
  const scenarioModelDefaults = useSettingsStore((s) => s.scenarioModelDefaults);
  const modelRouteDefaults = useSettingsStore((s) => s.modelRouteDefaults);
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const aiApiProtocol = useSettingsStore((s) => s.aiApiProtocol);
  const aiApiKey = useSettingsStore((s) => s.aiApiKey);
  const aiApiUrl = useSettingsStore((s) => s.aiApiUrl);
  const aiModel = useSettingsStore((s) => s.aiModel);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Build AI config using the standard scenario resolver
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
    [aiModels, scenarioModelDefaults, modelRouteDefaults, aiProvider, aiApiProtocol, aiApiKey, aiApiUrl, aiModel],
  );

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
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
      thinking: "",
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsStreaming(true);
    setStreamingMessageId(assistantMsg.id);

    const systemMessage = {
      role: "system" as const,
      content: `You are an AI agent for the project "${project.name}" (root: ${project.rootPath}). Help the user with tasks related to this project.`,
    };

    const chatMessages = [
      systemMessage,
      ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: trimmed },
    ];

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const result = await chatCompletion(
        aiConfig,
        chatMessages,
        {
          stream: true,
          onStream: (chunk: string) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id ? { ...m, content: m.content + chunk } : m,
              ),
            );
          },
        },
      );

      if (result.content) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: result.content } : m,
          ),
        );
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : t("projects.chatError");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, content: `⚠️ ${errorMsg}` } : m,
        ),
      );
    } finally {
      setIsStreaming(false);
      setStreamingMessageId(null);
      abortRef.current = null;
    }
  }, [input, isStreaming, aiConfig, messages, project.name, project.rootPath, t, showToast]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  const handleClear = useCallback(() => {
    setMessages([]);
    setInput("");
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
        <div className="flex items-center gap-2">
          <BotIcon className="h-5 w-5 text-primary" />
          <span className="font-medium">{project.name}</span>
          <span className="text-xs text-muted-foreground truncate max-w-[300px]">
            {project.rootPath}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
            onClick={handleClear}
            title={t("projects.clearSession")}
          >
            <RefreshCwIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <BotIcon className="h-7 w-7 text-primary/40" />
            </div>
            <p className="text-sm text-muted-foreground">{t("projects.sessionEmpty")}</p>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`flex gap-2 max-w-[80%] ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary/10 text-primary"
                  }`}>
                    {msg.role === "user" ? <UserIcon className="w-3.5 h-3.5" /> : <BotIcon className="w-3.5 h-3.5" />}
                  </div>
                  <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-md"
                      : "bg-muted rounded-tl-md"
                  }`}>
                    {msg.role === "assistant" ? (
                      <div className="markdown-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content || (msg.id === streamingMessageId ? "..." : "")}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <textarea
            className="flex-1 resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            rows={1}
            placeholder={t("projects.chatPlaceholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
          />
          <button
            className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
              isStreaming
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            } disabled:opacity-50`}
            onClick={isStreaming ? () => abortRef.current?.abort() : sendMessage}
            disabled={!isStreaming && !input.trim()}
          >
            {isStreaming ? <StopCircleIcon className="h-4 w-4" /> : <SendIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ProjectsManager (main export) ───────────────────────────────────
export function ProjectsManager() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const skillProjects = useSettingsStore((s) => s.skillProjects);
  const removeSkillProject = useSettingsStore((s) => s.removeSkillProject);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<SkillProject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SkillProject | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProjects = useMemo(() => {
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

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    try {
      removeSkillProject(deleteTarget.id);
      if (selectedProjectId === deleteTarget.id) {
        setSelectedProjectId(null);
      }
      showToast(t("projects.title"), "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error", "error");
    }
    setDeleteTarget(null);
  }, [deleteTarget, removeSkillProject, selectedProjectId, showToast, t]);

  return (
    <div className="flex h-full">
      {/* Left: Project list */}
      <div className="w-72 border-r border-border flex flex-col shrink-0 bg-card/30">
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">{t("projects.title")}</h2>
            <button
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              onClick={() => { setEditingProject(null); setIsFormOpen(true); }}
              title={t("projects.addProject")}
            >
              <FolderPlusIcon className="h-4 w-4" />
            </button>
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
        <div className="flex-1 overflow-y-auto">
          {filteredProjects.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t("projects.emptyHint")}
            </div>
          ) : (
            filteredProjects.map((project) => (
              <div
                key={project.id}
                className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors ${
                  selectedProjectId === project.id ? "bg-primary/10 border-r-2 border-primary" : ""
                }`}
                onClick={() => setSelectedProjectId(project.id)}
              >
                <FolderOpenIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{project.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{project.rootPath}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    className="p-1 rounded hover:bg-muted text-muted-foreground"
                    onClick={(e) => { e.stopPropagation(); setEditingProject(project); setIsFormOpen(true); }}
                    title={t("projects.editProject")}
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="p-1 rounded hover:bg-destructive/10 text-destructive"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(project); }}
                    title={t("projects.deleteProject")}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: Chat panel or empty state */}
      <div className="flex-1 min-w-0">
        {selectedProject ? (
          <ProjectChatPanel project={selectedProject} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FolderOpenIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground">{t("projects.selectProjectHint")}</p>
          </div>
        )}
      </div>

      {/* Form modal */}
      <ProjectFormModal
        isOpen={isFormOpen}
        editingProject={editingProject}
        onClose={() => { setIsFormOpen(false); setEditingProject(null); }}
        onSaved={() => {}}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={t("projects.deleteProject")}
        message={t("projects.deleteProjectConfirm", { name: deleteTarget?.name ?? "" })}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
        variant="destructive"
      />
    </div>
  );
}
