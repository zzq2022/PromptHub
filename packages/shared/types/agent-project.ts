/**
 * Agent Project types — shared between main process, preload, and renderer.
 */

/** Agent 项目来源 */
export type AgentProjectOrigin = "template" | "imported";

/** Agent 项目配置（对应 config.json 的用户可编辑部分） */
export interface AgentConfig {
  model?: string;
  apiKey?: string;
  apiBase?: string;
  maxTokens?: number;
  temperature?: number;
  memoryBackend?: "markdown" | "vector";
}

/** 创建 Agent 项目的请求参数 */
export interface CreateAgentProjectInput {
  name: string;
  targetDir: string;
  config?: AgentConfig;
}

/** 导入 Agent 项目的请求参数 */
export interface ImportAgentProjectInput {
  dirPath: string;
}

/** Agent gateway 状态 */
export interface AgentGatewayStatus {
  isRunning: boolean;
  port?: number;
  pid?: number;
}

/** Agent session 信息（透传自 Agent REST API） */
export interface AgentSessionInfo {
  session_id: string;
  title: string;
  created_at: number;
  updated_at: number;
  message_count: number;
}

/** Agent session 消息 */
export interface AgentSessionMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

/** Agent 创建/导入结果 */
export interface AgentProjectResult {
  projectId: string;
  name: string;
  rootPath: string;
  origin: AgentProjectOrigin;
}

/** Agent gateway 启动结果 */
export interface AgentGatewayStartResult {
  port: number;
  pid: number;
}
