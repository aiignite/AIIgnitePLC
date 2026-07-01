# AIIgnitePLC

面向 Web 的 PLC 编程工具，界面与工程组织方式参考 Siemens TIA Portal。支持梯形图编辑、变量管理、硬件配置、在线诊断，以及项目导入导出与 AI 辅助编程。

## 功能概览

| 模块             | 说明                                                               |
| ---------------- | ------------------------------------------------------------------ |
| **梯形图编辑器** | 可视化梯形逻辑编辑，支持撤销/重做、元素检查器与指令面板            |
| **项目树**       | 项目 → 设备 → 程序块/变量表/配置，懒加载子节点                     |
| **变量管理**     | Tag 定义与地址冲突检测（如 `%M0.0` 与 `%MB0` 不可重叠）            |
| **硬件配置**     | 设备与模块配置管理                                                 |
| **在线诊断**     | WebSocket 实时监视表、PLC 启停、编译结果与运行状态                 |
| **导入 / 导出**  | JSON 全量往返；PLCopen XML 简化 LD 网络导入导出                    |
| **项目管理**     | 新建/打开/保存，支持公开与私有项目可见性                           |
| **用户认证**     | JWT 注册、登录、刷新令牌与密码修改                                 |
| **审计与历史**   | 操作审计日志、导入历史（可筛选与导出）                             |
| **AI Co-pilot**  | 多 Provider 代理（OpenAI 兼容 / Anthropic / Ollama），需登录后使用 |

## 技术栈

**前端：** React 19 · Vite 6 · TypeScript · Zustand · Immer

**后端：** Fastify 4 · PostgreSQL 15 · WebSocket · JWT · Zod

**AI：** 后端代理转发，API Key 由用户在前端设置中配置，不写入服务端环境变量

## 架构

```
┌─────────────────┐     HTTP / WS      ┌──────────────────┐
│  React 前端      │ ◄──────────────► │  Fastify 后端     │
│  (port 3300)    │   /api/v1        │  (port 3310)     │
└─────────────────┘                    └────────┬─────────┘
                                                │
                                       ┌────────▼─────────┐
                                       │  PostgreSQL       │
                                       │  (port 5433)      │
                                       └──────────────────┘
```

- 前端 Zustand Store 通过 `src/services/apiClient.ts` / `authFetch.ts` 调用 REST API
- 梯形逻辑以 JSONB 存储于 `program_blocks.content`，保留完整 `Network[]` 结构
- 项目树采用邻接表（`project_nodes.parent_id`），展开文件夹时按需加载
- 实时数据经 WebSocket（`/api/v1/ws`）推送，Mock PLC 在 `backend/src/services/mockPLC.ts`

## 快速开始

### 前置条件

- Node.js ≥ 18
- Docker & Docker Compose（推荐）
- 或本地 PostgreSQL 15+

### 方式一：Docker（推荐）

```bash
# 复制后端环境变量（首次）
cp backend/.env.example backend/.env

# 启动全部服务（PostgreSQL + 后端 + 前端）
docker compose up -d

# 查看日志
docker compose logs -f
```

也可使用交互式脚本：

```bash
chmod +x start.sh
./start.sh   # 选择 1) Docker 模式
```

### 方式二：本地开发

**1. 数据库**

```bash
# 使用 Docker 仅启动 PostgreSQL
docker compose up -d postgres

# 或本地 PostgreSQL 创建数据库
createdb aiignite_plc
```

Docker 首次启动时会自动执行 `backend/migrations/` 下的 SQL 脚本。本地 PostgreSQL 需手动执行迁移文件（按编号顺序）。

**2. 后端**

```bash
cd backend
cp .env.example .env   # 按需修改 DB_PORT 等
npm install
npm run dev            # http://localhost:3310
```

**3. 前端**

```bash
# 项目根目录
npm install

# 可选：配置 API 地址
echo 'VITE_API_BASE_URL=http://localhost:3310/api/v1' > .env.local

npm run dev            # http://localhost:3300
```

## 服务端口

| 服务        | 端口 | 说明                       |
| ----------- | ---- | -------------------------- |
| 前端 (Vite) | 3300 | 开发服务器                 |
| 后端 API    | 3310 | REST + WebSocket           |
| PostgreSQL  | 5433 | Docker 映射（容器内 5432） |

健康检查：`http://localhost:3310/health`

## 环境变量

### 后端 `backend/.env`

```env
PORT=3310
HOST=0.0.0.0
DB_HOST=localhost
DB_PORT=5433          # Docker 映射端口；本地 PG 直连通常为 5432
DB_NAME=aiignite_plc
DB_USER=postgres
DB_PASSWORD=postgres
CORS_ORIGIN=http://localhost:3300
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
LOG_LEVEL=info
```

### 前端 `.env.local`（可选）

```env
VITE_API_BASE_URL=http://localhost:3310/api/v1
```

> AI API Key 在前端 **AI 助手设置** 中配置，由后端 `/api/v1/ai/chat` 代理转发，无需在服务端 `.env` 中填写。

## 开发命令

### 前端（根目录）

```bash
npm run dev          # 开发服务器
npm run build        # 生产构建
npm run preview      # 预览构建产物
npm run lint         # ESLint 检查
npm run lint:fix     # 自动修复
npm run format       # Prettier 格式化
npm run typecheck    # TypeScript 类型检查
```

### 后端（`backend/`）

```bash
npm run dev          # tsx watch 热重载
npm run build        # 编译 TypeScript
npm run start        # 运行编译产物
npm run db:migrate   # 执行初始 schema（本地 psql）
npm run db:reset     # 重置并重新迁移
```

### Docker

```bash
docker compose up -d
docker compose down
docker compose restart
docker compose logs -f backend
```

## 导入与导出

顶部工具栏提供三种操作：

- **导入** — 支持 `.json` 或 PLCopen `.xml`
- **导出** — 导出当前项目为 JSON（完整 `ProjectData` 往返）
- **导出 XML** — 导出 PLCopen XML（简化 LD：触点/线圈/定时器等）

PLCopen XML 导入支持简化 LD、基础 FBD 定时器及 ST 占位符；JSON 导入保留完整项目结构（标签、硬件、程序块等）。

导入历史与审计日志可在 **在线诊断** 面板中查看。

## 用户认证

- 未登录时可浏览**公开项目**；创建/编辑私有项目及使用 AI 助手需登录
- 认证 API 前缀：`/api/v1/auth`（register / login / refresh / logout / change-password）
- 前端通过 `authStore` 管理 JWT，请求经 `fetchWithAuth` 自动附带 Token

## AI Co-pilot

1. 登录账户
2. 打开右侧 AI Co-pilot 面板
3. 在设置中选择 Provider（OpenAI 兼容 / Anthropic / Ollama），填写 API Key 与模型名
4. AI 会结合当前梯形网络与变量上下文回答问题

## 项目结构

```
AIIgnitePLC/
├── App.tsx                 # 主应用布局与视图切换
├── components/             # UI 组件（编辑器、诊断、认证等）
├── src/
│   ├── stores/             # Zustand 状态（project / tag / block / runtime / auth / ai）
│   ├── services/           # API 客户端、AI 服务、认证请求
│   └── hooks/              # 自动保存、快捷键、面板拖拽
├── backend/
│   ├── src/
│   │   ├── routes/         # REST + WebSocket 路由
│   │   ├── services/       # Mock PLC、认证、审计
│   │   └── middleware/     # JWT 鉴权
│   └── migrations/         # PostgreSQL 迁移脚本
├── docker-compose.yml
└── start.sh                # 交互式启动脚本
```

## 关键设计约束

1. **临时 ID** — 前端创建资源时使用 `temp_xxx`，保存后替换为数据库 UUID
2. **乐观锁** — 保存程序块须携带 `version` 字段，版本冲突时拒绝覆盖
3. **地址唯一性** — 同一内存区域内 Tag 地址不可重叠，创建前调用 `/tags/check-address`
4. **WebSocket 清理** — 关闭程序块或切换项目时取消 Tag 订阅，避免泄漏

## 相关文档

更详细的架构说明见 [CLAUDE.md](./CLAUDE.md)（面向 AI 辅助开发的代码导航指南）。
