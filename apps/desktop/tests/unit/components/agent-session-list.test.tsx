import { act, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentSessionList } from "../../../src/renderer/components/project/AgentSessionList";
import type { SkillProject, AgentSessionInfo } from "@prompthub/shared/types";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

describe("AgentSessionList", () => {
  const mockProject: SkillProject = {
    id: "test-project",
    name: "Test Project",
    rootPath: "/path/to/project",
    gatewayPort: 18792,
  };

  const mockSessions: AgentSessionInfo[] = [
    {
      session_id: "session-1",
      title: "First Session",
      created_at: 1000000,
      updated_at: 1000000,
      message_count: 5,
    },
    {
      session_id: "session-2",
      title: "",
      created_at: 2000000,
      updated_at: 2000000,
      message_count: 0,
    },
  ];

  beforeEach(() => {
    installWindowMocks();
    // Default mocks for agent API
    window.api.agent = {
      listSessions: vi.fn().mockResolvedValue(mockSessions),
      deleteSession: vi.fn().mockResolvedValue(undefined),
    } as any;
  });

  it("loads and displays sessions successfully", async () => {
    await renderWithI18n(
      <AgentSessionList
        project={mockProject}
        activeSessionId="session-1"
        onSelectSession={vi.fn()}
        onNewChat={vi.fn()}
      />,
      { language: "zh" }
    );

    expect(await screen.findByText("First Session")).toBeInTheDocument();
    expect(screen.getByText("session-2")).toBeInTheDocument(); // Title fallback to session_id
  });

  it("handles connection failure by entering waiting state and retrying", async () => {
    // 1. First fetch throws fetch failed (connection error), second succeeds
    const listSessionsMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(mockSessions);

    window.api.agent.listSessions = listSessionsMock;

    await renderWithI18n(
      <AgentSessionList
        project={mockProject}
        activeSessionId={null}
        onSelectSession={vi.fn()}
        onNewChat={vi.fn()}
        retryDelayMs={10}
        maxRetryCount={3}
      />,
      { language: "zh" }
    );

    // Should display waiting state after first reject completes
    expect(await screen.findByText("等待 Agent Gateway 启动...")).toBeInTheDocument();

    // Wait for the retry to complete and resolve with mockSessions
    expect(await screen.findByText("First Session")).toBeInTheDocument();
    expect(screen.queryByText("等待 Agent Gateway 启动...")).not.toBeInTheDocument();
    expect(listSessionsMock).toHaveBeenCalledTimes(2);
  });

  it("exhausts retries and displays the connection error", async () => {
    const listSessionsMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    window.api.agent.listSessions = listSessionsMock;

    await renderWithI18n(
      <AgentSessionList
        project={mockProject}
        activeSessionId={null}
        onSelectSession={vi.fn()}
        onNewChat={vi.fn()}
        retryDelayMs={10}
        maxRetryCount={3}
      />,
      { language: "zh" }
    );

    // Verify it enters waiting state
    expect(await screen.findByText("等待 Agent Gateway 启动...")).toBeInTheDocument();

    // Now it should show the error after retries are exhausted (max 3 retries, total 30-50ms)
    expect(await screen.findByText("fetch failed")).toBeInTheDocument();
    expect(screen.queryByText("等待 Agent Gateway 启动...")).not.toBeInTheDocument();
    expect(listSessionsMock).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it("displays non-connection error immediately without retrying", async () => {
    const listSessionsMock = vi.fn().mockRejectedValue(new Error("API Error: 500"));
    window.api.agent.listSessions = listSessionsMock;

    await renderWithI18n(
      <AgentSessionList
        project={mockProject}
        activeSessionId={null}
        onSelectSession={vi.fn()}
        onNewChat={vi.fn()}
        retryDelayMs={10}
        maxRetryCount={3}
      />,
      { language: "zh" }
    );

    // Displays the error immediately
    expect(await screen.findByText("API Error: 500")).toBeInTheDocument();
    expect(screen.queryByText("等待 Agent Gateway 启动...")).not.toBeInTheDocument();
    expect(listSessionsMock).toHaveBeenCalledTimes(1);
  });

  it("supports session deletion", async () => {
    const deleteSessionMock = vi.fn().mockResolvedValue(undefined);
    window.api.agent.deleteSession = deleteSessionMock;

    await renderWithI18n(
      <AgentSessionList
        project={mockProject}
        activeSessionId={null}
        onSelectSession={vi.fn()}
        onNewChat={vi.fn()}
      />,
      { language: "zh" }
    );

    // Verify session loaded
    expect(await screen.findByText("First Session")).toBeInTheDocument();

    const deleteBtn = screen.getAllByTitle("删除会话")[0];
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    expect(deleteSessionMock).toHaveBeenCalledWith(18792, "session-1");
    // Verify first session is removed from list
    expect(screen.queryByText("First Session")).not.toBeInTheDocument();
  });
});
