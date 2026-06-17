import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WebWorkspaceSettings } from "../../../src/renderer/components/settings/WebWorkspaceSettings";
import { renderWithI18n } from "../../helpers/i18n";

vi.mock("../../../src/renderer/runtime", () => ({
  getWebContext: () => ({ username: "web-admin" }),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

describe("WebWorkspaceSettings", () => {
  it("explains that self-hosted Web is a backup and browsing workspace, not local distribution", async () => {
    await renderWithI18n(<WebWorkspaceSettings onNavigate={vi.fn()} />, {
      language: "zh",
    });

    expect(screen.getByText("自部署网页版")).toBeInTheDocument();
    expect(
      screen.getByText(
        /当前网页工作区主要用于临时浏览 Prompt，并作为自部署备份 \/ 恢复源/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/本机平台分发替换仍需在桌面端完成/)).toBeInTheDocument();
    expect(screen.getByText("web-admin")).toBeInTheDocument();
  });
});
