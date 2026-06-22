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
} from "@prompthub/core";
import { getAgentResourcesPath } from "../agent-resources";

export function registerAgentGatewayIPC(): void {
  ipcMain.handle(
    IPC_CHANNELS.AGENT_GATEWAY_START,
    async (
      _event,
      projectRootPath: string,
    ): Promise<AgentGatewayStartResult> => {
      const resourcesPath = getAgentResourcesPath();
      return startAgentGateway(projectRootPath, resourcesPath);
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
}
