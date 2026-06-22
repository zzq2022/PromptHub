/**
 * ImportProjectDialog — Dialog for importing an existing Agent project.
 */

import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { useToast } from "../ui/Toast";
import { Loader2Icon, CheckCircle2Icon, XCircleIcon } from "lucide-react";

interface ImportProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: (project: {
    projectId: string;
    name: string;
    rootPath: string;
  }) => void;
}

type VerifyState = "idle" | "verifying" | "valid" | "invalid";

export function ImportProjectDialog({
  isOpen,
  onClose,
  onImported,
}: ImportProjectDialogProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [dirPath, setDirPath] = useState("");
  const [name, setName] = useState("");
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [verifyError, setVerifyError] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDirPath("");
      setName("");
      setVerifyState("idle");
      setVerifyError("");
    }
  }, [isOpen]);

  // Auto-verify when dirPath changes
  useEffect(() => {
    if (!dirPath.trim()) {
      setVerifyState("idle");
      setVerifyError("");
      return;
    }

    const timer = setTimeout(async () => {
      setVerifyState("verifying");
      try {
        const result = await window.api.agent.verifyProject(dirPath.trim());
        if (result.isValid) {
          setVerifyState("valid");
          if (!name.trim()) {
            setName(result.name ?? "");
          }
          setVerifyError("");
        } else {
          setVerifyState("invalid");
          setVerifyError(result.error ?? t("agentProject.verifyFailed"));
        }
      } catch {
        setVerifyState("invalid");
        setVerifyError(t("agentProject.verifyFailed"));
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [dirPath, name, t]);

  const handleBrowse = useCallback(async () => {
    const selected = await window.electron?.selectFolder?.();
    if (selected) {
      setDirPath(selected);
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!dirPath.trim() || verifyState !== "valid") return;
    setImporting(true);
    try {
      const result = await window.api.agent.importProject({
        dirPath: dirPath.trim(),
      });
      showToast(t("agentProject.importSuccess"), "success");
      onImported(result);
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : t("agentProject.importFailed"),
        "error",
      );
    } finally {
      setImporting(false);
    }
  }, [dirPath, verifyState, showToast, t, onImported, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("agentProject.importTitle")}
    >
      <div className="p-6 space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">
            {t("agentProject.selectDir")}
          </label>
          <div className="flex gap-2">
            <Input
              value={dirPath}
              onChange={(e) => setDirPath(e.target.value)}
              placeholder={t("agentProject.selectDirPlaceholder")}
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

        {/* Verify status */}
        {dirPath.trim() && (
          <div className="flex items-center gap-2 text-sm">
            {verifyState === "verifying" && (
              <>
                <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">
                  {t("agentProject.verifying")}
                </span>
              </>
            )}
            {verifyState === "valid" && (
              <>
                <CheckCircle2Icon className="h-4 w-4 text-green-500" />
                <span className="text-green-600">
                  {t("agentProject.validProject")}
                </span>
              </>
            )}
            {verifyState === "invalid" && (
              <>
                <XCircleIcon className="h-4 w-4 text-red-500" />
                <span className="text-red-600">{verifyError}</span>
              </>
            )}
          </div>
        )}

        {verifyState === "valid" && (
          <div>
            <label className="text-sm font-medium mb-1 block">
              {t("agentProject.name")}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("agentProject.namePlaceholder")}
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            className="px-4 py-2 text-sm rounded-md hover:bg-muted"
            onClick={onClose}
          >
            {t("common.cancel")}
          </button>
          <button
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            onClick={handleImport}
            disabled={importing || verifyState !== "valid" || !name.trim()}
          >
            {importing ? t("common.saving") : t("agentProject.import")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
