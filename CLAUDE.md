# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AIIgnitePLC is a web-based PLC (Programmable Logic Controller) programming tool inspired by Siemens TIA Portal. It provides a visual interface for ladder logic programming, tag management, hardware configuration, and real-time diagnostics.

## Architecture

### Frontend (React + Vite + TypeScript)

- **Entry Point**: [index.tsx](src/index.tsx) via [index.html](index.html)
- **State Management**: Zustand stores in [src/stores/](src/stores/)
  - `projectStore` - Project and tree node state
  - `tagStore` - Tag/variable definitions
  - `blockStore` - Program blocks and ladder logic
  - `uiStore` - UI state (selected items, panels)
  - `runtimeStore` - PLC runtime monitoring data
- **API Layer**: [src/services/apiClient.ts](src/services/apiClient.ts) - typed API client for backend communication
- **Components**: Located in [components/](components/)
  - `ProjectTree` - Hierarchical project structure (projects -> devices -> blocks)
  - `LadderEditor` - Visual ladder logic editor
  - `TagEditor` - Variable tag management
  - `OnlineDiagnostics` - Runtime diagnostics view
  - `DeviceConfiguration` - Hardware configuration
  - `AICopilot` - AI assistant interface

### Backend (Node.js + Fastify + TypeScript)

- **Entry Point**: [backend/src/server.ts](backend/src/server.ts)
- **Routes**: Modular routes in [backend/src/routes/](backend/src/routes/)
  - `health` - Health check endpoints
  - `projects` - Project CRUD operations
  - `nodes` - Tree node management (lazy loading support)
  - `tags` - Tag/variable management with address conflict detection
  - `blocks` - Program block storage (JSONB in PostgreSQL)
  - `hardware` - Hardware configuration
  - `websocket` - Real-time PLC data streaming
- **Database**: PostgreSQL with schema in [backend/migrations/](backend/migrations/001_initial_schema.sql)
- **Types**: Shared types in [backend/src/types.ts](backend/src/types.ts)

### Data Flow

1. Frontend Zustand stores call API client methods
2. API client sends requests to backend at `http://localhost:3310/api/v1`
3. Backend validates and stores data in PostgreSQL
4. Real-time updates pushed via WebSocket (`/api/v1/ws`)
5. Frontend stores update UI components reactively

## Development Commands

### Quick Start (Recommended)

Use the interactive startup script:

```bash
./start.sh    # Prompts for Docker or local development mode
```

The script provides two modes:

1. **Docker mode** - Starts all services (postgres, backend, frontend) via docker-compose
2. **Local dev mode** - Starts backend with local PostgreSQL (requires manual DB setup)

### Frontend

```bash
npm run dev      # Start Vite dev server on port 3300
npm run build    # Build for production
npm run preview  # Preview production build
```

### Backend

```bash
cd backend
npm run dev        # Start dev server with tsx watch (port 3310)
npm run build      # Compile TypeScript
npm run start      # Run compiled server
npm run db:migrate # Run database migrations
npm run db:reset   # Reset and re-seed database
```

### Docker

```bash
docker-compose up -d    # Start all services (postgres:5433, backend:3310, frontend:3300)
docker-compose down     # Stop all services
docker-compose logs -f  # View logs
docker-compose restart  # Restart services
```

## Key Architecture Patterns

### Project Tree Structure

Uses **Adjacency List** pattern for hierarchical data:

- `project_nodes` table with `parent_id` (nullable) references `id`
- Frontend uses lazy loading: fetch children on folder expand
- Node types: `folder`, `device`, `block`, `tag_table`, `config`, `settings`

### Ladder Logic Storage

Ladder logic stored as **JSONB** in `program_blocks.content`:

- Do NOT normalize into separate tables for elements
- Direct serialization of frontend `Network[]` structure
- Version field for optimistic locking
- Enables JSONB queries (e.g., "find blocks using Timer")

### Tag Address Validation

Backend must enforce address uniqueness within memory areas:

- Tags cannot overlap (e.g., `%M0.0` conflicts with `%MB0`)
- Use `/tags/check-address` endpoint before creating/updating
- Returns conflicting tag if address unavailable

### Real-time Communication

WebSocket subscription model:

- Frontend subscribes only to tags in current block + watch table
- Backend PLC simulator (`mockPLC.ts`) cycles tag values
- Message format: `{ tag: string, value: any, timestamp: number }`
- Stores update `runtimeStore`, triggering component re-renders

### AI Context Injection

For LLM requests (Gemini):

- Always include current context (Network JSON or Tag list) in system prompt
- Backend handles API key security (never expose to frontend)
- Streaming via SSE or WebSocket for typewriter effect

## Port Configuration

| Service         | Port                    |
| --------------- | ----------------------- |
| Frontend (Vite) | 3300                    |
| Backend API     | 3310                    |
| PostgreSQL      | 5433 (mapped from 5432) |

## Environment Variables

### Backend ([backend/.env](backend/.env))

```
PORT=3310
HOST=0.0.0.0
DB_HOST=localhost
DB_PORT=5432
DB_NAME=aiignite_plc
DB_USER=postgres
DB_PASSWORD=postgres
CORS_ORIGIN=http://localhost:3300
GEMINI_API_KEY=your_key_here
LOG_LEVEL=info
```

### Frontend

```
VITE_API_BASE_URL=http://localhost:3310/api/v1
```

## Important Constraints

1. **ID Generation**: Use temporary UUIDs (`temp_xxx`) on frontend creation, replace with real DB IDs after save
2. **Optimistic Locking**: Always include `version` when saving blocks; reject if stale
3. **Address Conflicts**: Backend must validate PLC address uniqueness
4. **CORS**: Backend only allows requests from configured origin
5. **WebSocket Cleanup**: Unsubscribe from tags when closing blocks to prevent memory leaks

## seeyaoplcmaster (RH850 Target) Integration

AIIgnitePLC compiles to **AIPLC1/AIPC bytecode** consumed by [seeyaoplcmaster](~/Documents/AI/test/seeyaoplcmaster) firmware on Renesas RH850 R7F701581.

| Component         | Path                                                                  |
| ----------------- | --------------------------------------------------------------------- |
| Shared IR opcodes | `backend/src/plc/types.ts` ↔ `seeyaoplcmaster/app/plc/plc_ir.h`       |
| Compiler          | `backend/src/plc/` (ldCompiler, stParser, sfcParser, bytecodeEmitter) |
| UART3 protocol    | `backend/src/plc/rh850Protocol.ts`, `services/rh850Protocol.ts`       |
| Deploy UI         | `components/DeployPanel.tsx` (Web Serial + remote TCP via USR-K)      |
| Sim VM            | `backend/src/plc/simVm.ts` (mockPLC uses same bytecode)               |
| IR sync script    | `scripts/sync-plc-ir.sh`                                              |

### UART3 FuncCodes (ControlID=0x01)

| Code      | Function                                                               |
| --------- | ---------------------------------------------------------------------- |
| 0x64/0x65 | Virtual register read/write (`PLCMode` @ 0x1008, `PLCScanMs` @ 0x100A) |
| 0x68      | Program download (BEGIN/CHUNK/END)                                     |
| 0x69      | START / STOP / RESET                                                   |
| 0x6A      | Status (scan_ms, last_scan_us, error)                                  |
| 0x6B      | Force I/O                                                              |
| 0x6D      | Monitor bit                                                            |
| 0x6E      | JSON flat LD debug load                                                |
| 0x6F      | Slave I/O map (up to 16 slaves)                                        |

### Deploy Workflow

1. `POST /api/v1/plc/compile` → `downloadHex` + `deployHex` (enable PLC + download + START)
2. **DeployPanel** — choose connection mode:
   - **本地 USB**: Web Serial → UART3 (direct)
   - **远程 TCP (LAN)**: Browser → `/api/v1/ws/device` → backend TCP Client → USR-K module (TCP Server) → UART3
3. Online diagnostics polls 0x6A for cycle time when device connected

### Remote TCP (USR-K on PCBA)

PCBA uses [USR-K2/K3](https://www.usr.cn/Product/21.html) soldered module. User docs:

- [docs/README.md](docs/README.md) — documentation index
- [docs/remote-tcp-deploy.md](docs/remote-tcp-deploy.md) — architecture, WebSocket protocol, workflow
- [docs/usr-k-pcba-config.md](docs/usr-k-pcba-config.md) — module factory/site configuration

| Layer           | Path                                                                     |
| --------------- | ------------------------------------------------------------------------ |
| Frame parser    | `backend/src/plc/rh850FrameParser.ts`, `services/rh850FrameParser.ts`    |
| TCP bridge      | `backend/src/services/tcpSerialBridge.ts`                                |
| Device WS       | `GET /api/v1/ws/device?token=...` in `backend/src/routes/deviceWs.ts`    |
| Transport       | `services/rh850Transport.ts` (`WebSerialTransport`, `WsDeviceTransport`) |
| Hardware config | `hardware_modules.config.moduleIp`, `tcpPort` in DeviceConfiguration     |

Backend env: `DEVICE_TCP_ENABLED`, `DEVICE_TCP_ALLOWLIST`, `DEVICE_TCP_DEFAULT_PORT`.

Run `./scripts/sync-plc-ir.sh` after changing `plc_ir.h` on the target firmware.

## Database Schema Highlights

- `projects` - Project metadata
- `project_nodes` - Tree structure (parent_id self-reference)
- `tags` - Variable definitions (unique address per memory area)
- `program_blocks` - JSONB storage of ladder logic networks
- `plc_runtime_state` - Mock PLC runtime state for development
