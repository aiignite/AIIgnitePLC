# AI Ignite PLC - 后端集成开发规范

基于当前前端代码架构（高度模仿 Siemens TIA Portal 的 React 应用），在接入后端和数据库时，需遵循以下**工程数据的结构化存储**、**实时通信**以及**复杂逻辑对象序列化**的规范。

---

## 1. 数据库设计规范 (Database Schema Design)

由于 PLC 编程涉及大量层级关系（项目 -> 设备 -> 块 -> 网络 -> 梯形图元件）和强类型变量（Tag），推荐使用 **PostgreSQL**（支持强关系 + JSONB）或 **MySQL 8.0+**。

### A. 核心表结构策略

#### 1. 项目与目录树 (Project & Tree)

- **现状**：前端使用 `ProjectNode` 递归树结构。
- **数据库策略**：使用 **Adjacency List (邻接表)** 模式。
- **Table: `project_nodes`**
  - `id` (UUID, PK)
  - `parent_id` (UUID, FK, Nullable)
  - `project_id` (UUID, FK)
  - `type` (Enum: 'folder', 'block', 'device', 'tag_table')
  - `name` (Varchar)
  - `order_index` (Integer)
- **优化**：为防止递归查询过深，后端可缓存整个树结构，或前端实现“懒加载”（Lazy Loading），即点击文件夹时才请求子节点。

#### 2. 变量表 (Tags) - 强关系存储

- **现状**：前端 `TagDefinition` 包含地址、类型、注释。
- **数据库策略**：必须是标准的**关系型表**，以便进行唯一性校验和交叉引用（Cross Reference）。
- **Table: `tags`**
  - `id` (UUID, PK)
  - `project_id` (UUID, FK)
  - `name` (Varchar, Unique within project)
  - `address` (Varchar, Unique within memory area)
  - `data_type` (Varchar)
  - `comment` (Text)
- **约束**：后端必须实现地址冲突检测逻辑（例如：不能同时定义 `%M0.0` 和 `%MB0` 在重叠区域）。

#### 3. 梯形图逻辑 (Ladder Logic) - 文档型存储 (JSONB)

- **现状**：`Network` -> `LadderRung` -> `LadderElement` 是高度嵌套的对象数组。
- **数据库策略**：**不要**将梯形图拆解为 Elements 关系表。这会使查询和重组变得极其复杂且性能低下。
- **Table: `program_blocks`**
  - `id` (UUID, PK)
  - `node_id` (UUID, FK - Link to project_nodes)
  - `block_type` (Enum: 'OB', 'FC', 'FB')
  - `content` (JSONB) - 存储前端完整的 `networks` 数组。
  - `version` (Integer) - 用于乐观锁。
- **规则**：前端 `networks` 数组直接序列化存入 `content` 字段。利用 PostgreSQL 的 JSONB 索引功能，可支持查询“哪些程序块使用了 Timer 指令”。

---

## 2. API 接口设计规范 (API Architecture)

### A. RESTful 资源规划

| HTTP 方法 | 路径                         | 描述                       | 对应前端 State  |
| :-------- | :--------------------------- | :------------------------- | :-------------- |
| `GET`     | `/api/v1/projects/{id}/tree` | 获取项目树结构             | `projectNodes`  |
| `GET`     | `/api/v1/blocks/{id}`        | 获取程序块详情及逻辑       | `networks`      |
| `PUT`     | `/api/v1/blocks/{id}`        | 保存程序块逻辑 (全量 JSON) | `networks`      |
| `GET`     | `/api/v1/tags`               | 获取变量列表               | `tags`          |
| `POST`    | `/api/v1/tags`               | 创建新变量                 | `tags` (Add)    |
| `PATCH`   | `/api/v1/tags/{id}`          | 更新变量属性               | `tags` (Update) |

### B. 交互规则

1.  **乐观锁 (Optimistic Locking)**：
    - PLC 工程师常遇到多人编辑同一项目的情况。
    - **规则**：在 `program_blocks` 表增加 `version` 字段。前端保存时提交当前 `version`，若后端发现版本落后，则拒绝保存并提示“数据已在别处被修改”。

2.  **编译与验证 (Compilation)**：
    - 前端只有简单的 UI 校验。后端需要通过 `/api/v1/compile` 接口接收整个项目结构。
    - 后端运行逻辑检查（如：双线圈检测、地址越界、未定义标签），返回 `Diagnostics` 数组，前端将其渲染在底部的“诊断”Tab 中。

---

## 3. 实时通信与在线监控 (Real-time & Online Mode)

界面中包含 **"Online"** 状态指示灯，PLC 编程软件的核心功能是监控变量值。

- **技术选型**：使用 **WebSocket** (Socket.io 或 SignalR)。
- **实施规则**：
  1.  **订阅模式**：前端仅订阅当前打开的程序块（`networks`）中涉及的变量，以及 Watch Table（变量监控表）中的变量。避免全量推送。
  2.  **数据流**：
      - 后端（模拟 PLC Runtime）：`{ "tag": "Motor_Coil", "value": true, "timestamp": 123456 }`
      - 前端：接收数据 -> 更新 Redux/Zustand 状态 -> 触发梯形图组件重绘（例如：线圈变绿）。

---

## 4. AI Co-pilot 集成规范

当前 `AICopilot` 是前端模拟。接入真实 LLM (OpenAI/Claude/Gemini) 时需注意：

1.  **上下文注入 (Context Injection)**：
    - **规则**：用户提问时，前端**必须**将当前选中的 `Network` JSON 数据或 `Tag` 列表作为 System Prompt 的一部分发送给后端。
    - _Prompt 示例_：`System: 你是一个 SCL/LAD 专家。当前程序段逻辑为：[JSON数据...]。用户的具体问题是...`

2.  **流式响应 (Streaming)**：
    - 当前代码使用了 `setTimeout` 模拟。真实环境应使用 **Server-Sent Events (SSE)** 或 WebSocket 流式返回文字，实现打字机效果。

---

## 5. 前端重构建议 (Refactoring for Integration)

为了适应后端，建议对当前 `App.tsx` 中的 State 进行以下拆分：

1.  **引入状态管理库**：
    - 目前的 `projectNodes`, `networks`, `tags` 集中在 `App.tsx`。
    - **建议**：引入 **Zustand** 或 **Redux Toolkit**。
    - _理由_：WebSocket 接收到的实时数据需要不经过层层 Prop Drilling 直接更新到 `LadderElement` 组件中。

2.  **ID 生成策略**：
    - 当前使用 `Date.now()` 生成临时 ID。
    - **规则**：创建新对象（如新增 Rung）时，前端可生成临时的 UUID（如 `temp_xxx`），后端保存成功后返回真实数据库 ID，前端再进行替换。

3.  **数据转换层 (Adapter Layer)**：
    - 前端的 `LadderElement` 结构是为了 UI 渲染优化的。
    - 后端的存储结构可能为了压缩而简化。
    - **规则**：在 `services/apiClient.ts` 中增加转换函数 `transformBackendToFrontend()` 和 `transformFrontendToBackend()`。

---

## 6. 实施任务列表 (Implementation Checklist)

- [ ] **Backend Init**: 搭建 Node.js/Python 服务，连接 PostgreSQL。
- [ ] **Tag API**: 实现变量的 CRUD 接口，并添加地址唯一性校验。
- [ ] **Logic Storage**: 创建 `program_blocks` 表，实现 JSON 数据的存取。
- [ ] **Tree Sync**: 将前端 `ProjectTree` 改造为异步加载，从后端获取目录结构。
- [ ] **Online Mode**:
  - [ ] 搭建 WebSocket 服务。
  - [ ] 编写 Mock PLC 循环脚本（后端定时改变变量值）。
  - [ ] 前端集成 Socket 客户端，实现梯形图线条颜色的动态变化。
- [ ] **AI Integration**: 配置后端 LLM 代理路由，处理 API Key 安全，并实现流式输出。
