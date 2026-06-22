/**
 * IPC handlers for Agent Session pass-through.
 */

import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type {
  AgentSessionInfo,
  AgentSessionMessage,
} from "@prompthub/shared/types";
import {
  listAgentSessions,
  getAgentSessionMessages,
  loadAgentMemory,
} from "@prompthub/core";

export function registerAgentSessionIPC(): void {
  ipcMain.handle(
    IPC_CHANNELS.AGENT_SESSION_LIST,
    async (_event, port: number): Promise<AgentSessionInfo[]> => {
      return listAgentSessions(port);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_SESSION_GET,
    async (
      _event,
      port: number,
      sessionKey: string,
    ): Promise<AgentSessionMessage[]> => {
      return getAgentSessionMessages(port, sessionKey);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_SESSION_CREATE,
    async (_event, port: number, title?: string): Promise<string> => {
      // Delegate to Agent Gateway REST API
      const resp = await fetch(`http://127.0.0.1:${port}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title ?? "New session" }),
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) {
        throw new Error(`Session create failed: ${resp.status}`);
      }
      const data = (await resp.json()) as { session_id: string };
      return data.session_id;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_SESSION_DELETE,
    async (_event, port: number, sessionKey: string): Promise<void> => {
      const encoded = encodeURIComponent(sessionKey);
      const resp = await fetch(
        `http://127.0.0.1:${port}/api/sessions/${encoded}/delete`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!resp.ok) {
        throw new Error(`Session delete failed: ${resp.status}`);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_SESSION_RENAME,
    async (
      _event,
      port: number,
      sessionKey: string,
      title: string,
    ): Promise<void> => {
      const encoded = encodeURIComponent(sessionKey);
      const resp = await fetch(
        `http://127.0.0.1:${port}/api/sessions/${encoded}/rename`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!resp.ok) {
        throw new Error(`Session rename failed: ${resp.status}`);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_GET_USER_ID,
    async (): Promise<string> => {
      const os = await import("os");
      return os.userInfo().username;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AGENT_MEMORY_LOAD,
    async (_event, port: number): Promise<string> => {
      return loadAgentMemory(port);
    },
  );
}
