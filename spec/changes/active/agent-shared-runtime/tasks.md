# Tasks: Agent Shared Runtime

## Phase 1: Core Infrastructure

- [ ] 将 `packages/desktop/runtime/agent-runtime/` 复制到 `resources/agent-runtime/`
- [ ] 更新 `packages/desktop/resources/` 的 `buildResourcesScript.cjs` 打包清单,加入 `agent-runtime` 目录
- [ ] 在 Python `config.py` 中添加 `WORKSPACE = Path(os.environ["AGENT_WORKSPACE"])`,保留旧路径作为 fallback

## Phase 2: Python Side

- [ ] 更新 `run_gateway.py`:从 `AGENT_WORKSPACE` env var 解析工作目录
- [ ] 更新 `gateway_app.py`:从 `AGENT_WORKSPACE` 获取 prompts/sessions/skills 路径
- [ ] 更新 `health_check.py`:从 `AGENT_WORKSPACE` 获取 skills 清单
- [ ] 更新所有 `import` 路径:确认共享 runtime 内部模块间引用无变化

## Phase 3: TypeScript Side

- [ ] 更新 `agent-gateway.ts`:
  - 读取 `config.json` 中的 `gatewayPort` 字段
  - 将 `AGENT_WORKSPACE` env var 设为 `projectRootPath`
  - gateway script 路径指向 `resources/agent-runtime/run_gateway.py`
  - 添加端口冲突检测(health check)
- [ ] 更新 `agent-venv.ts`:确保 venv 路径解析兼容共享 runtime

## Phase 4: Config Schema

- [ ] 更新 agent 模板 `config.json`:添加 `gatewayPort: null` 默认值
- [ ] 添加端口范围验证(18780–18999)
- [ ] 添加端口冲突检测逻辑

## Phase 5: Migration & Cleanup

- [ ] 实现迁移逻辑:检测旧 `runtime/agent-runtime/` 存在时自动清理
- [ ] 编写迁移幂等性测试
- [ ] 更新 `agent-setup.ts`:创建新 agent 项目时写入 `gatewayPort` 到 config.json

## Phase 6: Verification

- [ ] 单元测试:Python WORKSPACE 解析
- [ ] 单元测试:TypeScript config 读取与端口分配
- [ ] 集成测试:两个 agent 同时启动,端口不冲突
- [ ] 集成测试:session 数据完全隔离
- [ ] E2E 测试:创建新 agent → 启动 → 对话 → 数据写入正确位置
- [ ] 更新 `implementation.md`
- [ ] 同步 `spec/knowledge/` 和 `docs/` 相关文档
