export interface ParsedGitRepo {
  host: string;
  owner: string;
  repo: string;
  repositoryUrl: string;
  cloneUrl: string;
  protocol: "http" | "https" | "ssh";
}

export interface ParsedGitHubTreeLocation {
  branch: string;
  directory?: string;
}

function isLikelyRepoOwner(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value) && /[A-Za-z_-]/.test(value);
}

function isLikelyRepoName(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value) && /[A-Za-z_-]/.test(value);
}

export function parseGitRepo(url: string): ParsedGitRepo | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  const sshMatch = trimmed.match(
    /^git@([^:]+):([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/,
  );
  if (sshMatch) {
    if (!isLikelyRepoOwner(sshMatch[2]) || !isLikelyRepoName(sshMatch[3])) {
      return null;
    }
    return {
      host: sshMatch[1].toLowerCase(),
      owner: sshMatch[2],
      repo: sshMatch[3],
      repositoryUrl: `https://${sshMatch[1]}/${sshMatch[2]}/${sshMatch[3]}`,
      cloneUrl: trimmed,
      protocol: "ssh",
    };
  }

  const httpMatch = trimmed.match(
    /^(https?):\/\/([^/]+)\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/tree\/[^/]+(?:\/.*)?)?\/?$/,
  );
  if (httpMatch) {
    const protocol = httpMatch[1] as "http" | "https";
    const host = httpMatch[2];
    const owner = httpMatch[3];
    const repo = httpMatch[4];
    const repositoryUrl = `${protocol}://${host}/${owner}/${repo}`;
    if (!isLikelyRepoOwner(owner) || !isLikelyRepoName(repo)) {
      return null;
    }
    return {
      host: host.toLowerCase(),
      owner,
      repo,
      repositoryUrl,
      cloneUrl: repositoryUrl,
      protocol,
    };
  }

  return null;
}

export function isGitHubHost(host: string): boolean {
  return host.toLowerCase() === "github.com";
}

export function parseGitHubTreeLocation(
  url: string,
): ParsedGitHubTreeLocation | null {
  try {
    const parsed = new URL(url.trim());
    if (!isGitHubHost(parsed.hostname)) {
      return null;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 4 || parts[2] !== "tree") {
      return null;
    }

    const branch = parts[3]?.trim();
    if (!branch) {
      return null;
    }

    const directory = parts.slice(4).join("/").trim() || undefined;
    return { branch, directory };
  } catch {
    return null;
  }
}
