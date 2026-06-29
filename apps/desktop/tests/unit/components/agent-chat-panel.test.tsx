import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentChatPanel } from "../../../src/renderer/components/project/AgentChatPanel";
import type { SkillProject, AgentSessionInfo } from "@prompthub/shared/types";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import * as agentService from "../../../src/renderer/services/agent-service";

// Mock the entire agent-service module
vi.mock("../../../src/renderer/services/agent-service", () => {
  return {
    connectToAgent: vi.fn(() => Promise.resolve()),
    disconnectFromAgent: vi.fn(),
    sendAgentMessage: vi.fn(),
    onAgentDelta: vi.fn(() => vi.fn()),
    onAgentTurnEnd: vi.fn(() => vi.fn()),
    onAgentError: vi.fn(() => vi.fn()),
    isAgentConnected: vi.fn(),
    switchAgentSession: vi.fn(),
    getCachedUserId: vi.fn(() => "mock-user-id"),
    getDefaultUserId: vi.fn(() => Promise.resolve("mock-user-id")),
    onAgentConnectionChange: vi.fn(() => vi.fn()),
  };
});

describe("AgentChatPanel", () => {
  const mockProject: SkillProject = {
    id: "test-project",
    name: "Test Project",
    rootPath: "/path/to/project",
    gatewayPort: 18792,
  };

  const mockActiveSession: AgentSessionInfo = {
    session_id: "session-1",
    title: "Test Session",
    created_at: 1000000,
    updated_at: 1000000,
    message_count: 5,
  };

  beforeEach(() => {
    installWindowMocks();
    vi.clearAllMocks();
  });

  it("renders welcome screen if no active session", async () => {
    vi.mocked(agentService.isAgentConnected).mockReturnValue(false);

    await renderWithI18n(
      <AgentChatPanel project={mockProject} activeSession={null} />,
      { language: "zh" }
    );

    expect(screen.getByText("与 Test Project 对话")).toBeInTheDocument();
  });

  it("updates status to connected if already connected on mount", async () => {
    vi.mocked(agentService.isAgentConnected).mockReturnValue(true);
    vi.mocked(agentService.onAgentConnectionChange).mockImplementation((projectId, cb) => {
      cb(true); // Fire immediately
      return vi.fn();
    });

    await renderWithI18n(
      <AgentChatPanel project={mockProject} activeSession={mockActiveSession} />,
      { language: "zh" }
    );

    // Should show connected status in UI
    expect(await screen.findByText("已连接")).toBeInTheDocument();
  });

  it("updates status when connection changes", async () => {
    vi.mocked(agentService.isAgentConnected).mockReturnValue(false);
    // Make connectToAgent mock stay pending so status remains "connecting"
    vi.mocked(agentService.connectToAgent).mockReturnValue(new Promise(() => {}));

    let connectionCallback: any = null;
    vi.mocked(agentService.onAgentConnectionChange).mockImplementation((projectId, cb) => {
      connectionCallback = cb;
      cb(false); // Fire immediately with disconnected
      return vi.fn();
    });

    await renderWithI18n(
      <AgentChatPanel project={mockProject} activeSession={mockActiveSession} />,
      { language: "zh" }
    );

    // It starts by trying to connect because activeSession is set and isAgentConnected is false
    expect(await screen.findByText("连接中...")).toBeInTheDocument();

    // Simulate connection change event (connected = true)
    await act(async () => {
      connectionCallback(true);
    });

    expect(await screen.findByText("已连接")).toBeInTheDocument();

    // Simulate connection change event (connected = false)
    await act(async () => {
      connectionCallback(false);
    });

    expect(await screen.findByText("未连接")).toBeInTheDocument();
  });

  it("sets connected status and calls switchAgentSession when switching to an already connected agent session", async () => {
    vi.mocked(agentService.isAgentConnected).mockReturnValue(true);
    vi.mocked(agentService.onAgentConnectionChange).mockImplementation((projectId, cb) => {
      cb(true);
      return vi.fn();
    });

    const { rerender } = await renderWithI18n(
      <AgentChatPanel project={mockProject} activeSession={mockActiveSession} />,
      { language: "zh" }
    );

    expect(await screen.findByText("已连接")).toBeInTheDocument();

    // Rerender with a new session ID (simulating switching session or clicking "+ New Chat")
    const newSession: AgentSessionInfo = {
      ...mockActiveSession,
      session_id: "session-2",
      title: "New Session",
    };

    await act(async () => {
      rerender(
        <AgentChatPanel project={mockProject} activeSession={newSession} />
      );
    });

    expect(agentService.switchAgentSession).toHaveBeenCalledWith(
      "test-project",
      "mock-user-id",
      "session-2"
    );
    expect(await screen.findByText("已连接")).toBeInTheDocument();
  });
});
