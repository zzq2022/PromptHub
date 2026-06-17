import { parseGitRepo } from "@prompthub/shared/utils/git-repo";

export type RemoteSourceChannel =
  | "github"
  | "gitee"
  | "gitea"
  | "git"
  | "remote-link";

function normalizeSourceText(value?: string): string {
  return value?.trim().toLowerCase() ?? "";
}

function getHostname(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }

  const parsedRepo = parseGitRepo(trimmed);
  if (parsedRepo) {
    return parsedRepo.host.toLowerCase();
  }

  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function sourceTextIncludes(text: string, keyword: string): boolean {
  return text.includes(keyword.toLowerCase());
}

export function detectRemoteSourceChannel(input: {
  sourceUrl?: string;
  sourceLabel?: string;
}): RemoteSourceChannel | null {
  const host = getHostname(input.sourceUrl);
  const sourceText = [input.sourceUrl, input.sourceLabel, host]
    .map(normalizeSourceText)
    .join(" ");

  if (!sourceText.trim()) {
    return null;
  }

  if (host === "github.com" || sourceTextIncludes(sourceText, "github.com")) {
    return "github";
  }

  if (
    host === "gitee.com" ||
    host.endsWith(".gitee.com") ||
    sourceTextIncludes(sourceText, "gitee")
  ) {
    return "gitee";
  }

  if (sourceTextIncludes(sourceText, "gitea")) {
    return "gitea";
  }

  if (parseGitRepo(input.sourceUrl || "")) {
    return "git";
  }

  if (/^https?:\/\//i.test(input.sourceUrl || "")) {
    return "remote-link";
  }

  return null;
}
