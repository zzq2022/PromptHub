import type { ScannedSkill, SkillProject } from "@prompthub/shared/types";

export function normalizeProjectPathForComparison(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function getProjectTargetSkillPath(targetDir: string, skillName: string): string {
  const normalizedTarget = targetDir.replace(/[\\/]+$/, "");
  return `${normalizedTarget}/${skillName}`;
}

export function isProjectSkillDeployedToTarget(
  scannedSkills: ScannedSkill[],
  skillName: string,
  targetDir: string,
): boolean {
  const expectedPath = normalizeProjectPathForComparison(
    getProjectTargetSkillPath(targetDir, skillName),
  );
  const expectedName = skillName.trim().toLowerCase();

  return scannedSkills.some((skill) => {
    if (skill.name.trim().toLowerCase() !== expectedName) {
      return false;
    }
    return normalizeProjectPathForComparison(skill.localPath) === expectedPath;
  });
}

export function getMissingProjectTargetDirs(
  scannedSkills: ScannedSkill[],
  skillName: string,
  targetDirs: string[],
): string[] {
  return targetDirs.filter(
    (targetDir) => !isProjectSkillDeployedToTarget(scannedSkills, skillName, targetDir),
  );
}

export interface ProjectDeployedSkillTarget {
  targetDir: string;
  localPath: string;
}

export function getDeployedProjectSkillTargets(
  scannedSkills: ScannedSkill[],
  skillName: string,
  targetDirs: string[],
): ProjectDeployedSkillTarget[] {
  const expectedName = skillName.trim().toLowerCase();
  const expectedTargetPaths = new Map(
    targetDirs.map((targetDir) => [
      normalizeProjectPathForComparison(getProjectTargetSkillPath(targetDir, skillName)),
      targetDir,
    ]),
  );

  return scannedSkills
    .filter((skill) => skill.name.trim().toLowerCase() === expectedName)
    .map((skill) => ({
      skill,
      normalizedPath: normalizeProjectPathForComparison(skill.localPath),
    }))
    .filter(({ normalizedPath }) => expectedTargetPaths.has(normalizedPath))
    .map(({ skill, normalizedPath }) => ({
      localPath: skill.localPath,
      targetDir: expectedTargetPaths.get(normalizedPath) ?? skill.localPath,
    }));
}

export function isProjectDeployTargetCompatible(
  sourcePath: string,
  skillName: string,
  targetDir: string,
): boolean {
  const normalizedSource = normalizeProjectPathForComparison(sourcePath);
  const normalizedTarget = normalizeProjectPathForComparison(
    getProjectTargetSkillPath(targetDir, skillName),
  );

  if (!normalizedSource || !normalizedTarget) {
    return false;
  }

  if (normalizedSource === normalizedTarget) {
    return false;
  }

  return !normalizedTarget.startsWith(`${normalizedSource}/`);
}

export function getDeployableProjectTargetDirs(
  sourcePath: string,
  skillName: string,
  targetDirs: string[],
): string[] {
  return targetDirs.filter((targetDir) =>
    isProjectDeployTargetCompatible(sourcePath, skillName, targetDir),
  );
}

export function getProjectDeployTargets(project: SkillProject): string[] {
  const configured = Array.isArray(project.deployTargets)
    ? project.deployTargets.filter(
        (entry) => typeof entry === "string" && entry.trim().length > 0,
      )
    : [];

  if (configured.length > 0) {
    return Array.from(new Set(configured));
  }

  const normalizedRoot = project.rootPath.replace(/[\\/]+$/, "");
  return normalizedRoot ? [`${normalizedRoot}/.agents/skills`] : [];
}
