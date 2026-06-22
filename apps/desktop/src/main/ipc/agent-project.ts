/**
 * IPC handlers for Agent Project management.
 */

import { ipcMain, dialog, BrowserWindow } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type {
  CreateAgentProjectInput,
  ImportAgentProjectInput,
  AgentProjectResult,
} from "@prompthub/shared/types";
import {
  createAgentProject,
  importAgentProject,
  verifyAgentProject,
} from "@prompthub/core";
import { getAgentResourcesPath } from "../agent-resources";

export function registerAgentProjectIPC(): void {
  ipcMain.handle(
    IPC_CHANNELS.AGENT_PROJECT_CREATE,
    async (
      _event,
      input: CreateAgentProjectInput,
    ): Promise<AgentProjectResult> => {
      const resourcesPath = getAgentResourcesPath();
      return createAgentProject(input, resourcesPath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_PROJECT_IMPORT,
    async (
      _event,
      input: ImportAgentProjectInput,
    ): Promise<AgentProjectResult> => {
      return importAgentProject(input);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_PROJECT_VERIFY,
    async (
      _event,
      dirPath: string,
    ): Promise<{ isValid: boolean; name?: string; error?: string }> => {
      return verifyAgentProject(dirPath);
    },
  );
}
