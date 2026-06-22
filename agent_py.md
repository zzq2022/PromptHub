# [Project Name] — 项目上下文与 Agent 开发规程 (Python 通用版)

## 0. Agent 运行契约 (Agent Execution Contract)

这些规则的存在是因为 AI Agent 在不同会话（Session）之间不保留记忆。当仓库中已经存在既定的边界、设计或实现记录时，请勿仅依赖临时聊天上下文。

### 0.1 单一真理源（Source-of-Truth）检索顺序
在进行任何非琐碎（non-trivial）的代码修改之前，Agent 必须按以下顺序阅读以获取上下文：
1. `agent_py.md`（本文件）：获取全局项目规则、技术栈、目录规范和质量门槛。
2. `docs/` 或 `spec/` 下的相关稳定设计文档、API 契约以及架构设计记录（ADR）。
3. 任何与当前任务/变更匹配的活动变更（active change）或任务计划（如 `tasks.md`）。
4. 目标修改模块的当前实现和对应的测试文件。

如果已存在既定的边界与实现，请在原处进行修改或扩展。**严禁**因为“新建一个独立的规则、模式、存储布局或工作流比寻找现有规则更容易”而创建与之竞争的平行实现。

### 0.2 强制变更关卡 (Mandatory Change Gate)
当工作涉及到以下任何一项时，必须在实现前与用户确认，或创建/更新明确的设计与任务文档：
- **数据库模式（Schema）**：数据库表、列、索引、外键约束、迁移脚本（如 Alembic）或持久化语义的变更。
- **文件系统与外部存储**：数据布局、备份/恢复、同步、灾难恢复或文件系统持久化逻辑。
- **核心契约与接口**：公共 API（FastAPI/Django 路由、gRPC 契约）、CLI 命令参数、共享类型提示或数据结构定义。
- **跨模块/跨包行为**：改变了两个或多个核心子包/领域（domains）之间的交互边界。
- **用户工作流变更**：修改了涉及多步骤的用户操作链或核心业务状态机。

### 0.3 现有功能修改规则
在修改现有行为时，首先要明确：
1. **所属的模块/层次**（例如：`app.api` 接口层、`app.services` 业务层、`app.models` 数据持久化层、`app.core` 配置与通用组件层）。
2. **当前的真理源**（例如：PostgreSQL 数据库、本地 YAML/JSON 配置文件、环境变量、Redis 缓存或外部第三方 API）。
3. **现有的测试覆盖情况**，以及需要补齐的测试空白（Regression Gap）。
4. 如果代码实现与文档不一致，请勿默默选择其中之一。应向用户反馈或在变更设计文档中记录该差异，并明确预期的正确行为。

### 0.4 新功能添加规则
对于新功能，在编写任何生产代码之前，必须先定义其边界：
- **数据流与存储**：是否需要新增数据库表、字段、索引，或者新增本地文件存储、远程 S3 载荷？
- **契约与接口**：是否需要新增 FastAPI 路由/请求体（Pydantic Schema）、新的 CLI 命令、或者新的消息队列事件定义？
- **归属架构**：逻辑应该归属于通用辅助函数、核心业务领域服务（Domain Service），还是独立的中间件/过滤器？
- **后向兼容性**：现有用户的迁移路径、数据字段默认值，以及在部分部署或失败情况下的回滚行为。
- **验证手段**：最低有效测试层（Lowest Effective Test Layer，如单元测试 vs 集成测试）以及对项目集成测试套件的影响。

### 0.5 测试先行规则 (Test-Driven Discipline)
对于缺陷修复（Bugfix）和非琐碎功能，在开始编写生产代码之前，必须编写或更新失败的测试（除非是文档清理或纯粹的格式化微调）。
- **对于缺陷**：编写的测试必须首先能稳定复现用户报告的失败，或者复现被破坏的业务不变量。
- **对于功能**：编写验收测试，包含至少一个 Happy Path 以及相关的边界条件和失败路径。
- **验证副作用**：不要只测试函数返回值。对于持久化、外部调用或并发操作，必须在测试中显式断言数据库行、文件内容变化或模拟调用。

### 0.6 设计冲突中止规则
在更改核心设计或引入新抽象之前，将所提议的方法与现有文档及实现进行对比。如果以下任何一项属实，**必须立即停下来向用户确认**：
- 当前代码的实际行为与现有文档对预期行为的理解存在冲突。
- 请求的变更与现有的活动变更或已接受的设计边界相冲突。
- 修复需要更改数据或状态的真理源（例如将状态从本地文件系统转移到数据库）。
- 该功能可以通过两种截然不同的方式实现，且会带来不同的用户/数据后果。
- 保持向后兼容需要进行复杂的迁移、回退或破坏性的行为变更。

---

## 1. 项目概述 (Project Overview)

> [!NOTE]
> *此部分由项目维护者填充具体项目信息。以下为模板内容：*

- **类型**：[例如：基于 FastAPI 的后端服务 / Django Web 应用 / 命令行 CLI 工具 / Python 库]
- **Python 版本**：[例如：Python 3.11+ / Python 3.12+]
- **许可证**：[例如：MIT / Apache-2.0 / 闭源商业]
- **构建/包管理工具**：[例如：Poetry / UV / Pipenv / Setup.py]

### 技术栈 (Technology Stack)

| 类别 | 技术 / 库 | 备注 |
| :--- | :--- | :--- |
| **运行时** | Python 3.x | [说明具体版本] |
| **Web 框架** | [FastAPI / Flask / Django] | [核心后端 Web 框架] |
| **ORM / 数据库** | [SQLAlchemy / SQLModel / Django ORM] | [持久化框架] |
| **数据库** | [PostgreSQL / SQLite / MySQL] | [开发与生产环境配置] |
| **配置与数据校验** | [Pydantic v2 / python-dotenv] | [设置与输入校验校验] |
| **测试框架** | [pytest / unittest] | [测试运行器] |
| **代码规范与 Lint** | [Ruff / Black / mypy] | [格式化与类型检查] |

---

## 2. 核心架构与设计原则 (Architecture & Design Principles)

### 2.1 模块分层与依赖规则
项目遵循 [例如：三层架构 / 干净架构 (Clean Architecture) / 领域驱动设计 (DDD)]：
- **领域与数据契约（Models/Schemas）**：定义核心实体与校验规则。绝对不能引入框架依赖或视图层的逻辑。
- **业务逻辑层（Services/Use Cases）**：处理具体业务规则。依赖于持久化抽象（如 Repository 接口），而不应该与特定数据库驱动直接绑定。
- **接口与适配器层（API/Controllers/CLI）**：暴露路由、接受输入、调用业务逻辑。负责处理输入验证（Pydantic）、异常捕获以及 HTTP/命令行响应格式化。
- **依赖方向**：高层业务逻辑不能依赖底层接口或具体实现。依赖方向应为：`API -> Services -> Repositories/Models`。

### 2.2 核心工程原则
- **高内聚，低耦合**：一个模块应该拥有一个明确的职责，将相关的逻辑高内聚在内部，外部仅通过清晰定义的公共 API 依赖。
- **显式优于隐式 (PEP 20)**：避免使用深层的动态属性注入、滥用 `getattr`/`setattr` 或过度的元编程。优先使用强类型的 Python 类型提示。
- **单一真理源**：确保配置、数据和状态在系统中拥有唯一的所有者。避免在配置文件、环境变量和数据库中冗余存储相同的状态而没有同步机制。
- **小接口表面积**：公开最少的公共函数与类。使用 `_` 前缀标记模块私有函数或类，限制外部模块的耦合。

### 2.3 尺寸与复杂度限制 (Python 特化)
- **文件长度**：单个 Python 源文件或测试文件原则上不能超过 **1500 行**。超出此限制的现有文件属于遗留技术债务，应重构并拆分为子模块。
- **新文件大小**：新创建的 Python 文件默认应保持在 **800 行** 以下。
- **函数长度**：单个函数/方法应控制在 **50 行** 以内。如果函数体积过大，应当提取出纯粹的辅助函数（Helper Functions）。
- **上帝模块防御**：避免创建类似 `utils.py`、`helpers.py` 或 `common.py` 的“垃圾桶”模块。所有的公共方法应该按其业务领域（如 `date_utils.py`、`crypto.py`）进行合理拆分。

---

## 3. 关键命令 (Key Commands)

> [!IMPORTANT]
> 执行开发命令前，请确保已激活对应的虚拟环境（Venv）。以下为常用命令配置模板：

| 命令 | 描述 | 备注 |
| :--- | :--- | :--- |
| `poetry install` | 安装项目依赖与虚拟环境 | [使用对应的包管理命令] |
| `poetry run ruff check` | 运行 Ruff 进行代码静态分析 (Lint) | [包含 Lint 检查] |
| `poetry run ruff format` | 使用 Ruff 进行代码格式化 | [保证风格一致] |
| `poetry run mypy .` | 运行 mypy 静态类型检查 | [严格类型模式] |
| `poetry run pytest` | 运行所有测试套件 | [使用 pytest] |
| `poetry run pytest --cov=src` | 运行测试并生成代码覆盖率报告 | [关注覆盖率] |
| `poetry run pytest <path_to_test>` | 运行指定的单个测试文件 | [调试单个测试] |
| `alembic upgrade head` | 运行数据库最新迁移 | [如使用 Alembic] |

---

## 4. 目录结构规范 (Directory Structure)

项目使用标准 `src/` 布局以避免导入混淆：

```text
[project-root]/
├── src/                          # 项目源代码
│   └── [package_name]/           # 主包目录
│       ├── api/                  # 接口层 (路由、控制器、Schema)
│       │   ├── v1/
│       │   └── dependencies.py   # 依赖注入 (如 FastAPI Depends)
│       ├── core/                 # 核心基础配置 (设置、日志、安全)
│       │   ├── config.py
│       │   ├── database.py       # 数据库连接与 Engine 初始化
│       │   └── security.py       # 加密、JWT 与哈希逻辑
│       ├── models/               # 数据模型定义 (SQLAlchemy/SQLModel)
│       ├── services/             # 业务领域服务层
│       └── utils/                # 细粒度的通用工具子包
├── tests/                        # 测试目录
│   ├── unit/                     # 单元测试 (无外部依赖，Mock 外部 I/O)
│   ├── integration/              # 集成测试 (测试真实数据库交互、中间件等)
│   ├── conftest.py               # pytest 全局夹具 (Fixtures) 与配置
│   └── fixtures/                 # 测试静态数据/夹具
├── migrations/                   # 数据库迁移脚本目录 (如 alembic/)
├── docs/                         # 面向仓库的项目文档、架构设计记录 (ADR)
├── pyproject.toml                # Poetry/Ruff/mypy/pytest 配置文件
├── README.md                     # 项目用户与贡献指南
└── agent_py.md                   # Agent 开发规程 (本文件)
```

---

## 5. 开发约定与最佳实践 (Development Conventions)

### 5.1 强类型提示规则
- **启用 Mypy 严格模式**：所有新编写的代码必须标注显式的类型提示（Type Hints）。
- **函数签名强制约束**：所有公共和内部函数必须声明参数类型和返回值类型。例如：`def get_user_by_id(user_id: int) -> User | None:`。
- **防御 `Any` 类型**：禁止滥用 `typing.Any`。如果类型无法确定，使用 `typing.Union`（或 `type | None` 语法）、泛型 `TypeVar` 或 `unknown`/类型守卫。
- **类型别名**：对于复杂的嵌套类型，应使用 `TypeAlias` 定义具有明确业务含义的类型名称。

### 5.2 异常处理规范
- **禁止静默失败**：严禁在 `catch` 块中吞掉异常而不做记录或重新抛出。
- **禁止捕获裸 `except:`**：捕获异常时必须指定具体的异常类。
- **避免过度捕获 `Exception`**：除非是在最外层（API 中间件、脚本入口点）捕获全局未知错误，否则在业务逻辑中应捕获特定的子类异常（如 `ValueError`、`KeyError`、`DBError`）。
- **自定义业务异常**：对于已知的业务逻辑失败，定义明确继承自自定义基类（如 `BusinessException`）的异常，以便接口层统一处理并转换为友好的错误响应。
- **保留异常链**：在重新抛出异常时使用 `raise NewException(...) from err`，以保留原始的调用栈（traceback）信息。

```python
# 推荐的做法
try:
    data = fetch_external_data()
except ExternalAPIError as err:
    logger.error("Failed to fetch data from partner API: %s", err)
    raise ServiceUnavailable("Partner API is currently down") from err
```

### 5.3 数据库与迁移约定
- **禁止 SQL 注入**：所有 SQL 查询必须通过 ORM (如 SQLAlchemy) 进行，或者使用驱动提供的参数化占位符（如 `execute("SELECT * FROM users WHERE id = :id", {"id": user_id})`）。**绝对禁止**使用 f-string 或字符串拼接来构造 SQL 查询。
- **外键约束与级联**：必须在定义外键（FK）时显式声明删除行为（如 `ondelete="CASCADE"` 或 `ondelete="SET NULL"`）。对于 SQLite，必须确保每次连接都启用 `PRAGMA foreign_keys = ON;`。
- **事务范围最小化**：对于多步骤的数据库写操作，必须显式包装在数据库事务块中（如 `with session.begin():`），并在部分失败时自动触发回滚。保持事务逻辑尽可能的轻量，不要在事务内执行耗时的外部网络请求。
- **数据迁移隔离**：任何数据库模式的改动都必须伴随着一条自动生成的迁移脚本（例如 `alembic revision --autogenerate`）。迁移脚本必须由开发人员手动审查，确保其在有存量数据的生产库上也是安全可运行的。

### 5.4 安全性标准
- **密钥与凭证安全**：绝对不能将明文密码、API Key、加密盐、数据库连接串或 JWT 密钥硬编码在代码或提交到 Git 仓库。所有凭证应通过 `.env` 或环境变量读取，并通过 Pydantic 配置类进行校验。
- **密码哈希**：密码存储前必须使用安全的单向哈希算法（如 `bcrypt` 或 `argon2`）进行加盐哈希，绝不能以明文或 MD5 形式存储。
- **防御路径穿越（Path Traversal）**：处理用户提供的文件名或路径输入时，必须使用 `pathlib.Path.resolve()` 将其转换为绝对路径，并断言其属于允许的基目录。
  ```python
  # 路径防穿越校验示例
  base_dir = Path("/var/data/uploads").resolve()
  target_file = (base_dir / user_input_path).resolve()
  if not target_file.is_relative_to(base_dir):
      raise PermissionError("Path traversal detected")
  ```
- **敏感日志过滤**：日志模块必须防止记录用户的敏感数据（例如明文密码、信用卡号、身份令牌）。

### 5.5 异步编程规范 (`async`/`await`)
- **阻塞操作防御**：在 `async def` 函数中，绝对不能调用任何会发生阻塞的同步同步函数（如标准库中的 `time.sleep()`、同步 `requests` 请求、阻塞的文件 I/O）。
- **异步适配**：对于无法避免的同步阻塞库，必须使用线程池（例如 `asyncio.to_thread()` 或通过线程池执行器）进行包装。
- **连接池重用**：对于异步客户端（如 `httpx.AsyncClient`）或数据库连接池，应当在应用启动时初始化并在整个生命周期中复用，避免为每个请求频繁创建和关闭连接。

---

## 6. 测试标准与质量门槛 (Testing Standards)

### 6.1 核心测试原则
测试的目的在于**防御缺陷与回归**，而不是为了堆砌覆盖率数值。每一个测试都应当是确定性的、独立的，且具有清晰的测试意图。

- **禁止虚假 Mock**：严禁直接 mock 被测系统自身的内部行为或简单逻辑。Mock 应仅用于隔离外部依赖（如支付网关、第三方推送、外部文件系统）。
- **禁止脆弱的断言**：避免在数据结构多变时使用 `expect(result).is_not_none()` 这种不表达行为的断言，或对动态返回字段使用模糊的快照比对。
- **环境隔离**：每个测试必须能够在完全干净、独立的环境中运行，不依赖前一个测试的执行状态或数据库遗留数据。

### 6.2 关键领域覆盖率要求

| 代码分层 / 模块类型 | 最低覆盖率 (行/分支/条件) | 质量要求 |
| :--- | :--- | :--- |
| **核心业务逻辑 (Services)** | 100% 覆盖 | 所有核心计算、状态转换、错误路径必须覆盖 |
| **核心数据模型与迁移 (Models/Migrations)** | 100% 覆盖 | 数据库级外键级联、字段约束与转换逻辑 |
| **安全与认证 (Security/Auth)** | 100% 覆盖 | 加密解密、Token 校验、边界密码验证 |
| **API 输入校验与处理器 (API/Controllers)** | 95% 以上覆盖 | 对不合法输入、参数缺失、超限载荷的拒绝逻辑 |

### 6.3 数据库测试准则
- **使用真实数据库适配器**：编写数据库集成测试时，**严禁使用 MagicMock 模拟 Session 或 Cursor**。必须使用真实的数据库适配器。
- **测试环境数据库选择**：可以使用 `:memory:` 的内存型 SQLite 数据库，或者使用 `Testcontainers` 快速拉起一个与生产环境一致的临时 Docker 容器。
- **测试数据回滚**：利用 pytest fixture，在每个测试运行前开启事务，运行后自动回滚事务（Transaction Rollback），以保证测试数据库的数据干净，且比重建表具有更高的运行效率。

### 6.4 模糊测试与对抗性输入测试
对以下情况进行针对性的对抗性边界验证：
- **SQL 注入防范**：在测试用例中传入特殊的 SQL 注入片段（如 `'; DROP TABLE users; --`），验证接口不会崩溃且数据表不受损害。
- **字符编码安全性**：验证中日韩（CJK）文字、多字符表情符号（Emoji）、包含控制字符的字符串在系统内部的正确编码、存储与读取。
- **超大数据验证**：向接口发送大文件、长字符串、大数，验证系统能正常防御并产生结构化拒绝，而不是发生内存溢出（OOM）或崩溃。

---

## 7. Python 开发工作流 (Workflow)

```mermaid
graph TD
    A[明确需求与边界] --> B[建立活动变更文档 / 设计草案]
    B --> C[编写失败的回归测试 / 验收用例]
    C --> D[编写或重构生产代码]
    D --> E[运行静态检查与 Ruff 格式化]
    E --> F[运行 pytest 测试套件并通过]
    F --> G[更新项目文档与 API 契约]
    G --> H[提交代码 (Conventional Commits)]
```

### 7.1 开发纪律
- **保持提交整洁**：提交信息必须遵循约定式提交（Conventional Commits）规范，例如 `feat: add user log out endpoint`、`fix: handle None type in token expiration`。
- **更新文档同步**：一旦变更了公共 API 契约、配置参数、文件系统存储结构，必须立即更新 `docs/` 下对应的设计文档和项目的 `README.md`。

---
*(本文档为通用模板，使用前可根据具体的 Python 项目架构进行适当细微剪裁)*
