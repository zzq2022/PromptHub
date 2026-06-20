import { RULE_PLATFORM_ORDER } from "@prompthub/shared/constants/rules";
import { isRulePlatformId } from "@prompthub/shared/types";
import type { RuleFileDescriptor } from "@prompthub/shared/types";

export function getOrderedGlobalRuleFiles(
  files: RuleFileDescriptor[],
  preferredOrder: string[] = [],
): RuleFileDescriptor[] {
  const globalFiles = files.filter((file) => !file.id.startsWith("project:"));
  const fileByPlatformId = new Map(
    globalFiles.map((file) => [file.platformId, file] as const),
  );
  const seenPlatformIds = new Set<string>();
  const ordered: RuleFileDescriptor[] = [];

  const pushPlatform = (platformId: string) => {
    if (
      !platformId ||
      seenPlatformIds.has(platformId) ||
      !isRulePlatformId(platformId)
    ) {
      return;
    }
    seenPlatformIds.add(platformId);
    const file = fileByPlatformId.get(platformId);
    if (file) {
      ordered.push(file);
    }
  };

  for (const platformId of preferredOrder) {
    pushPlatform(platformId);
  }

  for (const platformId of RULE_PLATFORM_ORDER) {
    pushPlatform(platformId);
  }

  for (const file of globalFiles) {
    pushPlatform(file.platformId);
  }

  return ordered;
}
