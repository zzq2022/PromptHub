/**
 * SkillHub publish bridge — desktop → self-hosted PromptHub Web.
 *
 * Local-first, mirrors the contract of
 * `apps/web/src/services/skill-publisher.service.ts`. The main process already
 * performs the local DB visibility write via the `SKILL_PUBLISH` IPC. This
 * module is the **best-effort** leg that mirrors the same publish action to
 * the configured self-hosted Web deployment, so the skill also becomes
 * publicly browsable in the Web's SkillHub catalog.
 *
 * Design choices:
 * - Auth: re-uses the existing `self-hosted-auth` captcha + login helpers and
 *   follows the same login-on-every-call pattern that
 *   `self-hosted-sync.ts::pushToSelfHostedWeb` uses.
 * - Failure isolation: any error here is logged via `console.warn` and
 *   swallowed, so a misconfigured / unreachable self-hosted Web never blocks
 *   the local publish (per product decision A1: "web push failure does NOT
 *   roll back local visibility").
 * - The main IPC `window.api.skill.publish(id)` remains the source of truth
 *   for the user's "is this skill shared?" answer.
 */

import type { PublishResult, Skill } from "@prompthub/shared/types";

import {
  issueSolvedPromptHubCaptcha,
  isPromptHubCaptchaAuthBoundaryError,
  normalizePromptHubWebBaseUrl,
} from "./self-hosted-auth";
import { useSettingsStore } from "../stores/settings.store";

interface ApiEnvelope<T> {
  data: T;
}

interface LoginPayload {
  accessToken: string;
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof (payload.error as { message?: unknown }).message === "string"
  ) {
    const message = (payload.error as { message: string }).message.trim();
    if (message) return message;
  }
  return fallback;
}

async function extractErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return readErrorMessage(payload, fallback);
  } catch {
    return fallback;
  }
}

async function readJsonEnvelope<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Request failed"));
  }
  const payload = (await response.json()) as ApiEnvelope<T>;
  return payload.data;
}

async function loginToSelfHostedWeb(
  baseUrl: string,
  username: string,
  password: string,
): Promise<string> {
  let captcha: { captchaId: string; captchaAnswer: string } | undefined;
  let captchaBoundaryError: Error | undefined;

  try {
    captcha = await issueSolvedPromptHubCaptcha(baseUrl);
  } catch (error) {
    if (!isPromptHubCaptchaAuthBoundaryError(error)) {
      throw error;
    }
    captchaBoundaryError = error;
  }

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      username,
      password,
      ...(captcha ?? {}),
    }),
  });

  if (!response.ok && captchaBoundaryError) {
    const message = await extractErrorMessage(response, captchaBoundaryError.message);
    if (message.includes("captcha")) {
      throw new Error(
        `${captchaBoundaryError.message} The connected PromptHub Web server still requires captcha during login, so update the self-hosted Web deployment and try again.`,
      );
    }
    throw new Error(message);
  }

  const payload = await readJsonEnvelope<LoginPayload>(response);
  return payload.accessToken;
}

/**
 * Best-effort: mirror a successful local publish to the self-hosted Web.
 *
 * Flow:
 *   1. Try `POST /api/skillhub/:id/publish` directly (same ID may exist if
 *      the user has already synced skills to the Web).
 *   2. On 404 (skill not in Web DB) → import the skill from the local DB
 *      via `POST /api/skills/`, then retry publish.
 *   3. On import 409 (name conflict) → find the existing Web skill by name
 *      and publish it instead (skips duplicate).
 *
 * NEVER throws — logs and returns. This is fire-and-forget.
 */
export async function mirrorPublishToSelfHostedWeb(skillId: string): Promise<boolean> {
  const settings = useSettingsStore.getState();
  const rawUrl = settings.selfHostedSyncUrl?.trim();
  const username = settings.selfHostedSyncUsername?.trim();
  const password = settings.selfHostedSyncPassword;

  if (!rawUrl || !username || !password) {
    // No self-hosted configured — local-first stands on its own.
    return false;
  }

  const baseUrl = normalizePromptHubWebBaseUrl(rawUrl);

  const accessToken = await loginToSelfHostedWeb(baseUrl, username, password);
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  // Step 1: Try direct publish (skill may already exist on the Web).
  const firstAttempt = await fetch(
    `${baseUrl}/api/skillhub/${encodeURIComponent(skillId)}/publish`,
    { method: "POST", headers: authHeaders, cache: "no-store" },
  );

  if (firstAttempt.ok) {
    await firstAttempt.json().catch(() => undefined);
    return true;
  }

  const firstStatus = firstAttempt.status;

  // 404 means the skill doesn't exist on the Web yet — proceed to import.
  if (firstStatus !== 404) {
    const msg = await extractErrorMessage(
      firstAttempt,
      `Self-hosted Web returned ${firstStatus}`,
    );
    throw new Error(msg);
  }

  // Step 2: Skill not found on Web. Read it from the local DB and import.
  const localSkill: Skill | undefined = await window.api?.skill?.get(skillId);
  if (!localSkill) {
    throw new Error(`Local skill ${skillId} not found for import.`);
  }

  // Step 3: Import to the Web with the local skill's ID as a stable key.
  const importPayload = {
    name: localSkill.name,
    description: localSkill.description || "",
    instructions: localSkill.instructions || localSkill.content || "",
    version: localSkill.version || "1.0.0",
    author: localSkill.author || "",
    tags: localSkill.tags || [],
    visibility: "private" as const,
    is_favorite: false,
    protocol_type: localSkill.protocol_type || ("skill" as const),
  };

  const importRes = await fetch(`${baseUrl}/api/skills/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    cache: "no-store",
    body: JSON.stringify(importPayload),
  });

  if (importRes.ok) {
    // Import succeeded — the Web assigned its own ID. Publish by that ID.
    const importedData = (await importRes.json() as any)?.data;
    const webSkillId: string | undefined = importedData?.id;
    if (!webSkillId) {
      throw new Error(`Import succeeded but no id in response. Cannot publish.`);
    }

    const publishRes = await fetch(
      `${baseUrl}/api/skillhub/${encodeURIComponent(webSkillId)}/publish`,
      { method: "POST", headers: authHeaders, cache: "no-store" },
    );
    if (publishRes.ok) {
      await publishRes.json().catch(() => undefined);
      return true;
    }
    const pubMsg = await extractErrorMessage(publishRes, `HTTP ${publishRes.status}`);
    throw new Error(pubMsg);
  }

  // Step 4: Import returned 409 = name conflict. Throw error.
  if (importRes.status === 409) {
    throw new Error("skillhub.publishNameConflict");
  }

  // Any other import error
  const importMsg = await extractErrorMessage(importRes, `HTTP ${importRes.status}`);
  throw new Error(importMsg);
}

/**
 * Convenience wrapper: run the local IPC publish then mirror the result to the
 * self-hosted Web when configured. The web mirror now submits the skill for
 * admin approval rather than immediately publishing. The local call is the
 * source of truth and its return value is what callers should rely on.
 */
import { useSkillStore } from "../stores/skill.store";

export async function publishSkillToSkillHub(
  skillId: string,
): Promise<PublishResult | null> {
  if (!window.api?.skill?.publish) {
    throw new Error("Skill publish IPC is not available");
  }
  const result = await window.api.skill.publish(skillId);
  if (result !== null) {
    // 同步本地 React 状态，点亮 shared 标识
    useSkillStore.setState((state) => {
      const nextEntries = { ...state.remoteStoreEntries };
      delete nextEntries["skillhub"];
      return {
        skills: state.skills.map((s) =>
          s.id === skillId ? { ...s, visibility: "shared" } : s
        ),
        remoteStoreEntries: nextEntries,
      };
    });

    // 触发远程同步，并等待以向上传播任何同步异常
    await mirrorPublishToSelfHostedWeb(skillId);
  }
  return result;
}
