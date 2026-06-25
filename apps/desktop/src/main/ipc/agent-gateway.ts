/**
 * IPC handlers for Agent Gateway process management.
 */

import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type {
  AgentGatewayStatus,
  AgentGatewayStartResult,
} from "@prompthub/shared/types";
import {
  startAgentGateway,
  stopAgentGateway,
  getAgentGatewayStatus,
  verifyProcessPid,
} from "@prompthub/core";
import { getAgentResourcesPath } from "../agent-resources";

export function registerAgentGatewayIPC(): void {
  ipcMain.handle(
    IPC_CHANNELS.AGENT_GATEWAY_START,
    async (
      _event,
      projectRootPath: string,
      existingPort?: number,
    ): Promise<AgentGatewayStartResult> => {
      const resourcesPath = getAgentResourcesPath();
      // startAgentGateway is now async — it waits for the health endpoint;
      // existingPort is passed through so previously assigned ports can be reused
      return await startAgentGateway(projectRootPath, resourcesPath, existingPort);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_GATEWAY_STOP,
    async (_event, projectRootPath: string): Promise<void> => {
      stopAgentGateway(projectRootPath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_GATEWAY_STATUS,
    async (_event, projectRootPath: string): Promise<AgentGatewayStatus> => {
      return getAgentGatewayStatus(projectRootPath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_GATEWAY_VERIFY_PID,
    async (_event, pid: number): Promise<boolean> => {
      return verifyProcessPid(pid);
    },
  );
}
