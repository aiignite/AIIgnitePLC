# AIIgnitePLC Backend

后端 API 服务，为 AIIgnitePLC 网页型 PLC 编程工具提供数据持久化、实时通信和 AI 辅助功能。

## 技术栈

- **框架**: Fastify 4.x (Node.js)
- **语言**: TypeScript 5.x
- **数据库**: PostgreSQL 15+
- **实时通信**: WebSocket (@fastify/websocket)
- **AI 集成**: Google Gemini API

## 项目结构

```
backend/
├── src/
│   ├── server.ts           # 服务入口
│   ├── db.ts               # 数据库连接池
│   ├── config.ts           # 环境配置
│   ├── routes/             # API 路由
│   │   ├── index.ts        # 路由注册
│   │   ├── health.ts       # 健康检查
│   │   ├── projects.ts     # 项目管理
│   │   ├── nodes.ts        # 树节点管理
│   │   ├── tags.ts         # 变量管理
│   │   ├── blocks.ts       # 程序块管理
│   │   └── websocket.ts    # WebSocket
│   ├── services/           # 业务逻辑
│   │   ├── compiler.ts     # 编译验证
│   │   ├── llm.ts          # LLM 客户端
│   │   └── mockPLC.ts      # PLC 模拟器
│   ├── parsers/            # SCL 解析器
│   │   ├── lexer.ts
│   │   ├── parser.ts
│   │   └── transformer.ts
│   └── middleware/         # 中间件
│       └── errorHandler.ts
├── migrations/             # 数据库迁移
│   └── 001_initial_schema.sql
├── package.json
└── tsconfig.json
```

## 快速开始

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件配置数据库连接等
```

### 3. 启动 PostgreSQL

使用 Docker:

```bash
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=aiignite_plc \
  -p 5432:5432 \
  postgres:15
```

或使用本地 PostgreSQL:

```bash
# 创建数据库
createdb aiignite_plc
```

### 4. 运行数据库迁移

```bash
npm run db:migrate
```

### 5. 启动开发服务器

```bash
npm run dev
```

服务器将在 http://localhost:3310 启动。

## API 端点

### 健康检查

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/health` | 基础健康检查 |
| GET | `/health/detail` | 详细健康检查（含数据库） |
| GET | `/ready` | 就绪检查 |

### 项目管理

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/projects` | 创建新项目 |
| GET | `/api/v1/projects` | 获取项目列表 |
| GET | `/api/v1/projects/:id` | 获取项目详情 |
| PATCH | `/api/v1/projects/:id` | 更新项目 |
| DELETE | `/api/v1/projects/:id` | 删除项目 |

### 树节点管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/projects/:id/tree` | 获取项目树 |
| POST | `/api/v1/projects/:id/nodes` | 创建节点 |
| PATCH | `/api/v1/nodes/:id` | 更新节点 |
| DELETE | `/api/v1/nodes/:id` | 删除节点 |

### 变量管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/projects/:id/tags` | 获取变量列表 |
| POST | `/api/v1/projects/:id/tags` | 创建变量 |
| PATCH | `/api/v1/tags/:id` | 更新变量 |
| DELETE | `/api/v1/tags/:id` | 删除变量 |

### 程序块管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/blocks/:id` | 获取程序块 |
| PUT | `/api/v1/blocks/:id` | 保存程序块 |
| POST | `/api/v1/projects/:id/compile` | 编译验证 |

### WebSocket

| 路径 | 描述 |
|------|------|
| `/api/v1/ws` | 实时 PLC 数据推送 |

## 环境变量

```bash
# 服务器
PORT=3310
HOST=0.0.0.0
NODE_ENV=development

# 数据库
DB_HOST=localhost
DB_PORT=5432
DB_NAME=aiignite_plc
DB_USER=postgres
DB_PASSWORD=postgres

# CORS
CORS_ORIGIN=http://localhost:3300

# AI (Gemini)
GEMINI_API_KEY=your_api_key_here

# 日志
LOG_LEVEL=info
```

## 开发脚本

```bash
npm run dev        # 启动开发服务器（tsx watch）
npm run build      # 编译 TypeScript
npm run start      # 启动生产服务器
npm test           # 运行测试
npm run db:migrate # 运行数据库迁移
npm run db:reset   # 重置数据库
```

## 数据库架构

### 核心表

- **projects**: 项目主表
- **project_nodes**: 项目树节点（邻接表）
- **tags**: 变量标签表
- **program_blocks**: 程序块（JSONB 存储 Ladder Logic）
- **plc_runtime_state**: PLC 运行时模拟状态
- **import_history**: 导入历史记录

详细架构请参考 `migrations/001_initial_schema.sql`。

## 测试

```bash
# 单元测试
npm test

# API 手动测试
curl http://localhost:3310/health

# 创建项目
curl -X POST http://localhost:3310/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Project", "description": "Test"}'
```

## 部署

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: aiignite_plc
    ports:
      - "5432:5432"

  backend:
    build: ./backend
    ports:
      - "3001:3001"
    depends_on:
      - postgres
    environment:
      DB_HOST: postgres
```

## 许可证

MIT
