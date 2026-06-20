import { useTranslation } from "react-i18next";
import {
  XIcon,
  CheckIcon,
  DownloadIcon,
  Loader2Icon,
  CuboidIcon,
  FolderIcon,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useSettingsStore } from "../../stores/settings.store";
import { useSkillStore } from "../../stores/skill.store";
import { useToast } from "../ui/Toast";
import type { Skill, SkillProject } from "@prompthub/shared/types";
import { PlatformIcon } from "../ui/PlatformIcon";
import { getErrorMessage } from "./detail-utils";
import { useSkillPlatform } from "./use-skill-platform";
import {
  getProjectDeployTargets,
  getDeployableProjectTargetDirs,
  getMissingProjectTargetDirs,
} from "../../services/project-skill-targets";

interface SkillQuickInstallProps {
  skill: Skill;
  onClose: () => void;
}

/**
 * Quick Install Modal for Skills
 * 技能快速安装弹窗
 */
export function SkillQuickInstall({ skill, onClose }: SkillQuickInstallProps) {
  const { t } = useTranslation();
  const skillInstallMethod = useSettingsStore(
    (state) => state.skillInstallMethod,
  );
  const skillProjects = useSettingsStore((state) => state.skillProjects) ?? [];
  const updateSkillProject = useSettingsStore(
    (state) => state.updateSkillProject,
  );
  const projectScanState = useSkillStore((state) => state.projectScanState);
  const scanProjectSkills = useSkillStore((state) => state.scanProjectSkills);

  const { showToast } = useToast();
  const [isClosingSoon, setIsClosingSoon] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
    new Set(),
  );

  const {
    availablePlatforms,
    batchInstall,
    installProgress,
    installStatus,
    isBatchInstalling,
    selectedPlatforms,
    selectAllPlatforms,
    togglePlatformSelection,
    uninstalledPlatforms,
  } = useSkillPlatform(skill, skillInstallMethod);

  // Fetch local repo path of the skill
  useEffect(() => {
    window.api.skill.getRepoPath(skill.id).then((path) => {
      setRepoPath(path || null);
    });
  }, [skill.id]);

  const defaultProjectDeployTargetPath = useSettingsStore(
    (state) => state.defaultProjectDeployTargetPath,
  );

  const getMissingTargets = (project: SkillProject) => {
    if (!repoPath) return [];
    const scannedSkills = projectScanState[project.id]?.scannedSkills ?? [];
    const targets = getProjectDeployTargets(project, defaultProjectDeployTargetPath);
    const deployableTargets = getDeployableProjectTargetDirs(
      repoPath,
      skill.name,
      targets,
    );
    return getMissingProjectTargetDirs(
      scannedSkills,
      skill.name,
      deployableTargets,
    );
  };

  const isProjectInstalled = (project: SkillProject) => {
    return repoPath ? getMissingTargets(project).length === 0 : false;
  };

  const toggleProjectSelection = (projectId: string) => {
    const next = new Set(selectedProjects);
    if (next.has(projectId)) {
      next.delete(projectId);
    } else {
      next.add(projectId);
    }
    setSelectedProjects(next);
  };

  const selectAllProjects = () => {
    const allSelectable = skillProjects.filter((p) => !isProjectInstalled(p));
    if (selectedProjects.size === allSelectable.length) {
      setSelectedProjects(new Set());
    } else {
      setSelectedProjects(new Set(allSelectable.map((p) => p.id)));
    }
  };

  const handleInstall = async () => {
    if (
      (selectedPlatforms.size === 0 && selectedProjects.size === 0) ||
      isClosingSoon ||
      isInstalling
    ) {
      return;
    }

    setIsInstalling(true);
    let platformSuccess = true;
    let projectSuccess = true;
    let totalSuccessCount = 0;
    let totalTargetCount = 0;
    const failures: string[] = [];

    try {
      // 1. Install to platforms
      if (selectedPlatforms.size > 0) {
        const result = await batchInstall();
        totalSuccessCount += result.successCount;
        totalTargetCount += result.totalCount;
        if (result.failures.length > 0) {
          platformSuccess = false;
          result.failures.forEach((f) => {
            const platform = availablePlatforms.find(
              (entry) => entry.id === f.platformId,
            );
            const label = platform?.name ?? f.platformId;
            failures.push(`${label}: ${f.reason}`);
          });
        }
      }

      // 2. Install to projects
      if (selectedProjects.size > 0) {
        if (!repoPath) {
          throw new Error(
            t(
              "skill.projectDeployMissingSource",
              "Missing local skill source path.",
            ),
          );
        }

        const projectTargetJobs: Array<{
          project: SkillProject;
          targetDir: string;
        }> = [];
        for (const projectId of selectedProjects) {
          const project = skillProjects.find((p) => p.id === projectId);
          if (project) {
            const missing = getMissingTargets(project);
            for (const targetDir of missing) {
              projectTargetJobs.push({ project, targetDir });
            }
          }
        }

        if (projectTargetJobs.length > 0) {
          totalTargetCount += projectTargetJobs.length;
          try {
            await Promise.all(
              projectTargetJobs.map(({ targetDir }) =>
                window.api.skill.copyRepoByPathToDirectory(
                  repoPath,
                  skill.name,
                  targetDir,
                  { ifExists: "skip", mode: "symlink" },
                ),
              ),
            );
            totalSuccessCount += projectTargetJobs.length;

            // Trigger rescan for the affected projects
            const affectedProjects = Array.from(
              new Set(projectTargetJobs.map((job) => job.project)),
            );

            void Promise.all(
              affectedProjects.map(async (project) => {
                await scanProjectSkills(project);
                updateSkillProject(project.id, { lastScannedAt: Date.now() });
              }),
            ).catch((err) => {
              console.error("Rescan failed:", err);
              showToast(
                t(
                  "skill.projectImportLibraryRescanFailed",
                  "Import completed, but PromptHub could not refresh the project list. Please rescan manually.",
                ),
                "warning",
              );
            });
          } catch (error) {
            projectSuccess = false;
            failures.push(
              `Projects: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      // 3. Show feedback
      if (totalSuccessCount > 0) {
        showToast(
          `${t("skill.installSuccess", "Operation successful")} ${totalSuccessCount}/${totalTargetCount}`,
          "success",
        );
      }

      if (failures.length > 0) {
        showToast(
          t("skill.installPartialFailure", {
            details: failures.join("\n"),
            defaultValue:
              "Some install targets could not be installed\n{{details}}",
          }),
          "error",
        );
      }

      // Close modal if completely successful
      if (platformSuccess && projectSuccess && failures.length === 0) {
        setIsClosingSoon(true);
        setTimeout(() => {
          onClose();
        }, 1000);
      }
    } catch (error) {
      console.error("Install failed:", error);
      showToast(
        `${t("skill.updateFailed")}: ${getErrorMessage(error)}`,
        "error",
      );
    } finally {
      setIsInstalling(false);
    }
  };

  const allPlatformsInstalled =
    availablePlatforms.length > 0 && uninstalledPlatforms.length === 0;

  const allProjectsInstalled =
    skillProjects.length > 0 &&
    skillProjects.every((project) => isProjectInstalled(project));

  const allTargetsInstalled =
    (availablePlatforms.length === 0 || allPlatformsInstalled) &&
    (skillProjects.length === 0 || allProjectsInstalled);

  const showSuccessScreen =
    allTargetsInstalled &&
    (availablePlatforms.length > 0 || skillProjects.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-base">
      <div className="app-wallpaper-panel-strong border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-smooth">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <CuboidIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">
                {t("skill.quickInstall", "Install to Platforms")}
              </h3>
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                {skill.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0 scrollbar-hide">
          {availablePlatforms.length === 0 && skillProjects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">
                {t("skill.noPlatformsDetected", "No platforms detected")}
              </p>
            </div>
          ) : showSuccessScreen ? (
            <div className="text-center py-8">
              <CheckIcon className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-foreground font-medium">
                {t("skill.allPlatformsInstalled", "Installed on all platforms")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t(
                  "skill.alreadyInstalled",
                  "This skill is already installed on all detected platforms",
                )}
              </p>
            </div>
          ) : (
            <>
              {/* Platforms Section */}
              {availablePlatforms.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {t(
                        "skill.selectPlatforms",
                        "Select platforms to install",
                      )}
                    </p>
                    {uninstalledPlatforms.length > 0 && (
                      <button
                        onClick={selectAllPlatforms}
                        className="text-xs text-primary hover:underline"
                        disabled={isBatchInstalling || isInstalling}
                      >
                        {t("skill.selectAll")}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {availablePlatforms.map((platform) => {
                      const isInstalled = installStatus[platform.id];
                      const isSelected = selectedPlatforms.has(platform.id);

                      return (
                        <div
                          key={platform.id}
                          onClick={() => {
                            if (
                              !isInstalled &&
                              !isBatchInstalling &&
                              !isInstalling
                            ) {
                              togglePlatformSelection(platform.id);
                            }
                          }}
                          className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                            isInstalled
                              ? "bg-green-500/5 border-green-500/20 cursor-default"
                              : isSelected
                                ? "bg-primary/10 border-primary cursor-pointer"
                                : "bg-accent/30 border-border hover:bg-accent/50 cursor-pointer"
                          } ${(isBatchInstalling || isInstalling) && !isInstalled ? "opacity-60 cursor-wait" : ""}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                              <PlatformIcon
                                platformId={platform.id}
                                size={26}
                              />
                            </div>
                            <span className="font-medium text-sm">
                              {platform.name}
                            </span>
                          </div>
                          {isInstalled ? (
                            <div className="flex items-center gap-1 text-green-500">
                              <CheckIcon className="w-4 h-4" />
                              <span className="text-xs">
                                {t("skill.installed")}
                              </span>
                            </div>
                          ) : (
                            <div
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                isSelected
                                  ? "bg-primary border-primary"
                                  : "border-muted-foreground/30"
                              }`}
                            >
                              {isSelected && (
                                <CheckIcon className="w-3 h-3 text-white" />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Divider if both exist */}
              {availablePlatforms.length > 0 && skillProjects.length > 0 && (
                <hr className="border-border my-2" />
              )}

              {/* Projects Section */}
              {skillProjects.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {t("skill.selectProjects", "Select projects to install")}
                    </p>
                    {skillProjects.some((p) => !isProjectInstalled(p)) && (
                      <button
                        onClick={selectAllProjects}
                        className="text-xs text-primary hover:underline"
                        disabled={isBatchInstalling || isInstalling}
                      >
                        {t("skill.selectAll")}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {skillProjects.map((project) => {
                      const isInstalled = isProjectInstalled(project);
                      const isSelected = selectedProjects.has(project.id);

                      return (
                        <div
                          key={project.id}
                          onClick={() => {
                            if (
                              !isInstalled &&
                              !isBatchInstalling &&
                              !isInstalling
                            ) {
                              toggleProjectSelection(project.id);
                            }
                          }}
                          className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                            isInstalled
                              ? "bg-green-500/5 border-green-500/20 cursor-default"
                              : isSelected
                                ? "bg-primary/10 border-primary cursor-pointer"
                                : "bg-accent/30 border-border hover:bg-accent/50 cursor-pointer"
                          } ${(isBatchInstalling || isInstalling) && !isInstalled ? "opacity-60 cursor-wait" : ""}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 text-muted-foreground">
                              <FolderIcon className="w-5 h-5" />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium text-sm truncate">
                                {project.name}
                              </span>
                              <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                                {project.rootPath}
                              </span>
                            </div>
                          </div>
                          {isInstalled ? (
                            <div className="flex items-center gap-1 text-green-500 flex-shrink-0">
                              <CheckIcon className="w-4 h-4" />
                              <span className="text-xs">
                                {t("skill.installed")}
                              </span>
                            </div>
                          ) : (
                            <div
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                isSelected
                                  ? "bg-primary border-primary"
                                  : "border-muted-foreground/30"
                              }`}
                            >
                              {isSelected && (
                                <CheckIcon className="w-3 h-3 text-white" />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!showSuccessScreen &&
          (availablePlatforms.length > 0 || skillProjects.length > 0) && (
            <div className="p-5 border-t border-border shrink-0">
              <button
                onClick={handleInstall}
                disabled={
                  (selectedPlatforms.size === 0 &&
                    selectedProjects.size === 0) ||
                  isBatchInstalling ||
                  isInstalling
                }
                className="w-full py-3 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors hover:bg-primary/90"
              >
                {isBatchInstalling || isInstalling ? (
                  <>
                    <Loader2Icon className="w-4 h-4 animate-spin" />
                    {installProgress
                      ? `${installProgress.current}/${installProgress.total}`
                      : t("skill.installing")}
                  </>
                ) : (
                  <>
                    <DownloadIcon className="w-4 h-4" />
                    {t("skill.installSelected", "Install Selected")}{" "}
                    {selectedPlatforms.size + selectedProjects.size > 0 &&
                      `(${selectedPlatforms.size + selectedProjects.size})`}
                  </>
                )}
              </button>
            </div>
          )}
      </div>
    </div>
  );
}
