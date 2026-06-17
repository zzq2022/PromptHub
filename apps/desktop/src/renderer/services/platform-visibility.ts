import type { SkillPlatform } from "@prompthub/shared/constants/platforms";

export function filterVisiblePlatforms<T extends { id: string }>(
  platforms: T[],
  disabledPlatformIds: string[],
): T[] {
  if (disabledPlatformIds.length === 0) {
    return platforms;
  }

  const disabledSet = new Set(disabledPlatformIds);
  return platforms.filter((platform) => !disabledSet.has(platform.id));
}

export function isPlatformVisible(
  platformId: string,
  disabledPlatformIds: string[],
): boolean {
  return !disabledPlatformIds.includes(platformId);
}

export function filterDetectedPlatforms(
  platforms: SkillPlatform[],
  detectedPlatformIds: string[],
  disabledPlatformIds: string[],
): SkillPlatform[] {
  return filterVisiblePlatforms(
    platforms.filter((platform) => detectedPlatformIds.includes(platform.id)),
    disabledPlatformIds,
  );
}
