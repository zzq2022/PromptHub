/**
 * CreateAgentDialog — Dialog for creating a new Agent project from the template.
 */

import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { useToast } from "../ui/Toast";
import type { AgentConfig } from "@prompthub/shared/types";

interface CreateAgentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (project: {
    projectId: string;
    name: string;
    rootPath: string;
  }) => void;
}

export function CreateAgentDialog({
  isOpen,
  onClose,
  onCreated,
}: CreateAgentDialogProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [targetDir, setTargetDir] = useState("");
  const [model, setModel] = useState("MiniMax-M2.7");
  const [apiKey, setApiKey] = useState("");
  const [apiBase, setApiBase] = useState("https://api.minimaxi.com/v1");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setTargetDir("");
      setModel("MiniMax-M2.7");
      setApiKey("");
      setApiBase("https://api.minimaxi.com/v1");
    }
  }, [isOpen]);

  const handleBrowse = useCallback(async () => {
    const selected = await window.electron?.selectFolder?.();
    if (selected) {
      setTargetDir(selected);
    }
  }, []);

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !targetDir.trim()) return;
    setSaving(true);
    try {
      const config: AgentConfig = {
        model: model.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        apiBase: apiBase.trim() || undefined,
      };
      const result = await window.api.agent.createProject({
        name: name.trim(),
        targetDir: targetDir.trim(),
        config,
      });
      showToast(t("agentProject.createSuccess"), "success");
      onCreated(result);
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : t("agentProject.createFailed"),
        "error",
      );
    } finally {
      setSaving(false);
    }
  }, [
    name,
    targetDir,
    model,
    apiKey,
    apiBase,
    showToast,
    t,
    onCreated,
    onClose,
  ]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("agentProject.createTitle")}
    >
      <div className="p-6 space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">
            {t("agentProject.name")}
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-agent-bot"
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">
            {t("agentProject.targetDir")}
          </label>
          <div className="flex gap-2">
            <Input
              value={targetDir}
              onChange={(e) => setTargetDir(e.target.value)}
              placeholder={t("agentProject.targetDirPlaceholder")}
              className="flex-1"
            />
            <button
              className="px-3 py-1.5 text-sm bg-muted rounded-md hover:bg-muted/80"
              onClick={handleBrowse}
            >
              {t("agentProject.browse")}
            </button>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-xs text-muted-foreground mb-3">
            {t("agentProject.providerHint")}
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">
                {t("agentProject.model")}
              </label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="MiniMax-M2.7"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">
                {t("agentProject.apiKey")}
              </label>
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                type="password"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">
                {t("agentProject.apiBase")}
              </label>
              <Input
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                placeholder="https://api.minimaxi.com/v1"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            className="px-4 py-2 text-sm rounded-md hover:bg-muted"
            onClick={onClose}
          >
            {t("common.cancel")}
          </button>
          <button
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            onClick={handleCreate}
            disabled={saving || !name.trim() || !targetDir.trim()}
          >
            {saving ? t("common.saving") : t("agentProject.create")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
