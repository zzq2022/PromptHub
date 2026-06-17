import type { ScannedSkill, Skill } from "@prompthub/shared/types";
import { normalizeProjectPathForComparison } from "./project-skill-targets";

export type ScannedSkillInstallBadge =
  | "copy"
  | "symlink"
  | "external"
  | "builtin";

export interface SkillScanStatus {
  managedSkill: Skill | null;
  isInMySkills: boolean;
  isExternalInstall: boolean;
  installBadge: ScannedSkillInstallBadge;
}

export interface SkillScanStatusOptions {
  surface?: "project" | "agent";
}

export interface ScannedSkillIdentityInput extends Pick<
  ScannedSkill,
  | "directory_fingerprint"
  | "installMode"
  | "isPromptHubManagedLink"
  | "localPath"
  | "symlinkTargetPath"
> {
  isPlatformBuiltin?: boolean;
}

function addSkillPathCandidate(
  lookup: Map<string, Skill>,
  path: string | undefined,
  skill: Skill,
) {
  if (!path?.trim()) {
    return;
  }

  lookup.set(normalizeProjectPathForComparison(path), skill);
}

export function buildSkillLibraryIdentityLookup(librarySkills: Skill[]): {
  byFingerprint: Map<string, Skill>;
  byPath: Map<string, Skill>;
} {
  const byPath = new Map<string, Skill>();
  const byFingerprint = new Map<string, Skill>();

  for (const skill of librarySkills) {
    addSkillPathCandidate(byPath, skill.local_repo_path, skill);
    addSkillPathCandidate(byPath, skill.source_url, skill);
    if (skill.directory_fingerprint?.trim()) {
      byFingerprint.set(skill.directory_fingerprint, skill);
    }
  }

  return { byFingerprint, byPath };
}

export function matchScannedSkillToLibrary(
  scannedSkill: ScannedSkillIdentityInput,
  librarySkills: Skill[],
): Skill | null {
  const lookup = buildSkillLibraryIdentityLookup(librarySkills);
  return matchScannedSkillWithLookup(scannedSkill, lookup);
}

export function matchScannedSkillWithLookup(
  scannedSkill: ScannedSkillIdentityInput,
  lookup: {
    byFingerprint: Map<string, Skill>;
    byPath: Map<string, Skill>;
  },
): Skill | null {
  const pathCandidates = [
    scannedSkill.localPath,
    scannedSkill.symlinkTargetPath,
  ].filter((entry): entry is string => Boolean(entry?.trim()));

  for (const candidate of pathCandidates) {
    const matched = lookup.byPath.get(
      normalizeProjectPathForComparison(candidate),
    );
    if (matched) {
      return matched;
    }
  }

  if (scannedSkill.directory_fingerprint?.trim()) {
    return lookup.byFingerprint.get(scannedSkill.directory_fingerprint) ?? null;
  }

  return null;
}

export function isExternalScannedSkillInstall(
  scannedSkill: ScannedSkillIdentityInput,
  isInMySkills: boolean,
): boolean {
  if (scannedSkill.installMode !== "symlink") {
    return !isInMySkills;
  }
  if (scannedSkill.isPromptHubManagedLink === false) {
    return true;
  }
  if (scannedSkill.isPromptHubManagedLink === true) {
    return false;
  }
  return !isInMySkills;
}

export function getScannedSkillInstallBadge(
  scannedSkill: ScannedSkillIdentityInput,
  isExternalInstall: boolean,
): ScannedSkillInstallBadge {
  if (scannedSkill.isPlatformBuiltin) {
    return "builtin";
  }
  if (isExternalInstall) {
    return "external";
  }
  return scannedSkill.installMode === "symlink" ? "symlink" : "copy";
}

export function getSkillScanStatus(
  scannedSkill: ScannedSkillIdentityInput,
  librarySkills: Skill[],
  _options: SkillScanStatusOptions = {},
): SkillScanStatus {
  const managedSkill = matchScannedSkillToLibrary(scannedSkill, librarySkills);
  const isInMySkills = Boolean(managedSkill);
  const isExternalInstall = isExternalScannedSkillInstall(
    scannedSkill,
    isInMySkills,
  );

  return {
    managedSkill,
    isInMySkills,
    isExternalInstall,
    installBadge: getScannedSkillInstallBadge(scannedSkill, isExternalInstall),
  };
}
