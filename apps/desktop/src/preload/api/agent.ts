/**
 * Preload API for Agent Project management.
 * Exposes IPC channels to the renderer via window.api.agent*.
 */

import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type {
  CreateAgentProjectInput,
  ImportAgentProjectInput,
  AgentProjectResult,
  AgentGatewayStatus,
  AgentGatewayStartResult,
  AgentSessionInfo,
  AgentSessionMessage,
} from "@prompthub/shared/types";

export const agentApi = {
  // ── Project CRUD ────────────────────────────────────────────
  createProject: (input: CreateAgentProjectInput) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.AGENT_PROJECT_CREATE,
      input,
    ) as Promise<AgentProjectResult>,

  importProject: (input: ImportAgentProjectInput) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.AGENT_PROJECT_IMPORT,
      input,
    ) as Promise<AgentProjectResult>,

  verifyProject: (dirPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_PROJECT_VERIFY, dirPath) as Promise<{
      isValid: boolean;
      name?: string;
      error?: string;
    }>,

  // ── Gateway process management ──────────────────────────────
  startGateway: (projectRootPath: string, existingPort?: number) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.AGENT_GATEWAY_START,
      projectRootPath,
      existingPort,
    ) as Promise<AgentGatewayStartResult>,

  stopGateway: (projectRootPath: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.AGENT_GATEWAY_STOP,
      projectRootPath,
    ) as Promise<void>,

  gatewayStatus: (projectRootPath: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.AGENT_GATEWAY_STATUS,
      projectRootPath,
    ) as Promise<AgentGatewayStatus>,

  verifyProcessPid: (pid: number) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.AGENT_GATEWAY_VERIFY_PID,
      pid,
    ) as Promise<boolean>,

  // ── Session management ──────────────────────────────────────
  listSessions: (port: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_SESSION_LIST, port) as Promise<
      AgentSessionInfo[]
    >,

  getSessionMessages: (port: number, sessionKey: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.AGENT_SESSION_GET,
      port,
      sessionKey,
    ) as Promise<AgentSessionMessage[]>,

  createSession: (port: number, title?: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.AGENT_SESSION_CREATE,
      port,
      title,
    ) as Promise<string>,

  deleteSession: (port: number, sessionKey: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.AGENT_SESSION_DELETE,
      port,
      sessionKey,
    ) as Promise<void>,

  renameSession: (port: number, sessionKey: string, title: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.AGENT_SESSION_RENAME,
      port,
      sessionKey,
      title,
    ) as Promise<void>,

  // ── User identity ─────────────────────────────────────────
  getUserId: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.AGENT_GET_USER_ID,
    ) as Promise<string>,

  // ── Memory ──────────────────────────────────────────────────
  loadMemory: (port: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_MEMORY_LOAD, port) as Promise<string>,
};
