#!/usr/bin/env -S node --experimental-strip-types
/**
 * Capture refreshed README screenshots from a seeded PromptHub electron app.
 *
 * The script boots the Electron main process from `out/main/index.js`, loads
 * the seed in `tests/e2e/fixtures/screenshots.seed.json`, and walks the
 * surfaces we want to feature on the README. Each surface is captured into
 * `docs/imgs/<file>.png` (relative to the repository root).
 *
 * Usage:
 *   pnpm build              # compile the renderer + main first
 *   pnpm --filter @prompthub/desktop screenshots
 *
 * The capture set intentionally lives outside the e2e suite so a screenshot
 * regression doesn't break CI; it is a docs tool. We reuse the e2e helpers
 * (`launchPromptHub`, `setAppLanguage`, `setAppSettings`) so the boot path
 * matches the rest of the smoke tests.
 *
 * Exit codes:
 *   0 — every screenshot captured successfully
 *   1 — a surface failed to render, or a step timed out
 *   2 — required output directories are missing or the build is stale
 */

import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..", "..");
const seedPath = path.join(
  desktopRoot,
  "tests/e2e/fixtures/screenshots.seed.json",
);
const mainEntry = path.join(desktopRoot, "out/main/index.js");
const docsImgsDir = path.join(repoRoot, "docs/imgs");

const VIEWPORT = { width: 1440, height: 900 } as const;

interface Surface {
  /** Output filename relative to docs/imgs/ */
  filename: string;
  /** Description of the surface, printed in the log */
  description: string;
  /** Sets up the surface. Throws if the surface can't be reached. */
  prepare(page: Page): Promise<void>;
}

async function ensureBuilt(): Promise<void> {
  try {
    await stat(mainEntry);
  } catch {
    console.error(
      `[screenshots] cannot find ${mainEntry}. Run 'pnpm build' (or 'pnpm --filter @prompthub/desktop build') first.`,
    );
    process.exit(2);
  }
  try {
    await stat(seedPath);
  } catch {
    console.error(`[screenshots] cannot find seed at ${seedPath}.`);
    process.exit(2);
  }
}

async function ensureDocsDir(): Promise<void> {
  await mkdir(docsImgsDir, { recursive: true });
}

async function setLanguageAndTheme(page: Page): Promise<void> {
  await page.evaluate(() => {
    const raw = localStorage.getItem("prompthub-settings");
    const parsed = raw ? JSON.parse(raw) : { state: {} };
    parsed.state = {
      ...(parsed.state ?? {}),
      language: "en",
      theme: "dark",
      motionPreference: "standard",
    };
    localStorage.setItem("prompthub-settings", JSON.stringify(parsed));
  });
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
}

async function settle(page: Page, ms: number = 350): Promise<void> {
  await page.waitForTimeout(ms);
}

async function capture(page: Page, filename: string): Promise<void> {
  const out = path.join(docsImgsDir, filename);
  await page.screenshot({ path: out, animations: "disabled" });
  console.log(`  -> ${path.relative(repoRoot, out)}`);
}

const SURFACES: Surface[] = [
  {
    filename: "1-index.png",
    description: "Main two-column home view",
    async prepare(page) {
      // Default landing surface; just settle.
      await settle(page);
    },
  },
  {
    filename: "10-skill-store.png",
    description: "Skill store",
    async prepare(page) {
      // Sidebar nav items use title attributes for accessibility.
      const skillsNav = page.locator('button[title="Skills"], button[title*="技能"]').first();
      await skillsNav.waitFor({ state: "visible", timeout: 5000 });
      await skillsNav.click();
      await settle(page);
      // Try to enter a Store sub-tab — typically labeled "Skill Store".
      const storeTab = page
        .locator('button:has-text("Skill Store"), button:has-text("Store")')
        .first();
      if (await storeTab.isVisible().catch(() => false)) {
        await storeTab.click();
      }
      await settle(page, 600);
    },
  },
  {
    filename: "11-skill-platform-install.png",
    description: "Skill detail with platform install panel",
    async prepare(page) {
      const mySkillsTab = page
        .locator('button:has-text("My Skills"), button:has-text("我的")')
        .first();
      if (await mySkillsTab.isVisible().catch(() => false)) {
        await mySkillsTab.click();
        await settle(page);
      }
      // Click the first skill row.
      const firstSkill = page
        .locator("h3, h4")
        .filter({ hasText: /write|code-review|release-notes/i })
        .first();
      if (await firstSkill.isVisible().catch(() => false)) {
        await firstSkill.click();
      }
      await settle(page, 600);
    },
  },
  {
    filename: "12-skill-files-version-diff.png",
    description: "Skill file editor + version history",
    async prepare(page) {
      // From the skill detail surface, open Version History.
      const versionButton = page
        .locator('button:has-text("Version History"), button:has-text("版本历史")')
        .first();
      if (await versionButton.isVisible().catch(() => false)) {
        await versionButton.click();
        await settle(page, 600);
      }
    },
  },
  {
    filename: "13-rules-workspace.png",
    description: "Rules workspace",
    async prepare(page) {
      const rulesNav = page.locator('button[title="Rules"], button[title*="规则"]').first();
      await rulesNav.waitFor({ state: "visible", timeout: 5000 });
      await rulesNav.click();
      await settle(page, 600);
    },
  },
  {
    filename: "14-skill-projects.png",
    description: "Project Skill workspace",
    async prepare(page) {
      const skillsNav = page.locator('button[title="Skills"], button[title*="技能"]').first();
      await skillsNav.click();
      await settle(page);
      const projectsTab = page
        .locator('button:has-text("Project"), button:has-text("项目")')
        .first();
      if (await projectsTab.isVisible().catch(() => false)) {
        await projectsTab.click();
        await settle(page, 600);
      }
    },
  },
  {
    filename: "15-quick-add-ai.png",
    description: "Quick Add modal in AI generation mode",
    async prepare(page) {
      // Trigger Quick Add via shortcut; its three-tier menu may need a click.
      await page.keyboard.press("Alt+Shift+N");
      await settle(page, 800);
    },
  },
  {
    filename: "16-tag-manager.png",
    description: "Tag manager modal",
    async prepare(page) {
      // The tag-manager entry sits in the sidebar tag area as a small gear
      // button next to the "TAGS" label.
      const tagSettings = page
        .locator('button[aria-label="Edit"], button[title="Edit"]')
        .first();
      if (await tagSettings.isVisible().catch(() => false)) {
        await tagSettings.click();
        await settle(page, 600);
      }
    },
  },
  {
    filename: "17-appearance-motion.png",
    description: "Settings → Appearance with the motion section",
    async prepare(page) {
      const settingsNav = page
        .locator('button[title="Settings"], button[title*="设置"]')
        .first();
      if (await settingsNav.isVisible().catch(() => false)) {
        await settingsNav.click();
        await settle(page);
        const appearanceTab = page
          .locator('button:has-text("Appearance"), button:has-text("外观")')
          .first();
        if (await appearanceTab.isVisible().catch(() => false)) {
          await appearanceTab.click();
          await settle(page, 500);
        }
      }
    },
  },
];

async function captureAll(): Promise<void> {
  await ensureBuilt();
  await ensureDocsDir();

  let app: ElectronApplication | null = null;
  let exitCode = 0;
  try {
    const userDataDir = path.join(
      desktopRoot,
      "out",
      "screenshots-userdata",
    );
    // Wipe stale state from previous runs so the seed always lands on an
    // empty profile.
    await rm(userDataDir, { recursive: true, force: true });
    await mkdir(userDataDir, { recursive: true });

    app = await electron.launch({
      args: [mainEntry],
      env: {
        ...process.env,
        NODE_ENV: "test",
        PROMPTHUB_E2E: "1",
        PROMPTHUB_E2E_USER_DATA_DIR: userDataDir,
        PROMPTHUB_E2E_SEED_PATH: seedPath,
      },
    });
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.setViewportSize(VIEWPORT);
    await setLanguageAndTheme(page);

    for (const surface of SURFACES) {
      console.log(`[screenshots] ${surface.description} (${surface.filename})`);
      try {
        // Always dismiss any open modal before navigating to the next surface.
        await page.keyboard.press("Escape").catch(() => undefined);
        await settle(page, 200);
        await surface.prepare(page);
        await capture(page, surface.filename);
      } catch (err) {
        console.error(
          `  !! failed to capture ${surface.filename}: ${(err as Error).message}`,
        );
        exitCode = 1;
      }
    }
  } catch (err) {
    console.error(
      `[screenshots] fatal: ${(err as Error).message ?? String(err)}`,
    );
    exitCode = 1;
  } finally {
    if (app) {
      await app.close().catch(() => undefined);
    }
  }

  process.exit(exitCode);
}

captureAll();
