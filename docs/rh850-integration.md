# RH850 目标集成说明

AIIgnitePLC 可将工程编译为 **AIPLC1/AIPC 字节码**，经 UART3 协议下载到 Renesas RH850（R7F701581）控制器，固件基于 [seeyaoplcmaster](https://github.com/) 项目（本地路径通常为 `~/Documents/AI/test/seeyaoplcmaster`）。

## 整体数据流

```
┌─────────────────────────────────────────────────────────────┐
│  单个程序块 (program_blocks.content)                         │
│  ├── networks[]   梯形图 (LD)                                 │
│  ├── st_source    结构化文本 (ST)                             │
│  └── sfc          顺序功能图 (SFC)                            │
└──────────────────────────┬──────────────────────────────────┘
                           │ POST /api/v1/plc/compile
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  编译器 (backend/src/plc/)                                   │
│  ldCompiler → IR ─┐                                          │
│  stParser   → IR ─┼─ concat → emitBytecode → AIPLC1 包      │
│  sfcParser  → IR ─┘         buildSfcBinary (SFC 二进制元数据)  │
└──────────────────────────┬──────────────────────────────────┘
                           │ deployHex / downloadHex
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  部署通道                                                    │
│  • 本地 USB：Web Serial → UART3                              │
│  • 远程 LAN：WS → 后端 TCP → USR-K → UART3                   │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
                    RH850 seeyaoplcmaster 固件
                    (plc_vm + plc_sfc + 从站 UART2 链)
```

## 程序块与多语言编辑

每个**程序块**可在编辑器顶栏切换三种视图：

| 视图        | 存储字段            | 编译入口                                |
| ----------- | ------------------- | --------------------------------------- |
| 梯形图 (LD) | `content.networks`  | `compileNetworksToIr()`                 |
| ST          | `content.st_source` | `compileStToIr()`                       |
| SFC         | `content.sfc`       | `compileSfcToIr()` + `buildSfcBinary()` |

三种语言描述的是**同一块程序**的不同表达方式，**不是**项目树里多个程序块的合并。

### IR 拼接（concat）语义

`POST /api/v1/plc/compile` 对**当前打开的一个程序块**按下列顺序拼接 IR：

```typescript
// backend/src/routes/plc.ts（简化）
if (networks?.length) ir = compileNetworksToIr(networks, tags); // 末尾 SCAN_END
if (st_source) ir = ir.concat(compileStToIr(st_source, tags)); // 末尾 SCAN_END
if (sfc) ir = ir.concat(compileSfcToIr(sfc, tags)); // 末尾 SCAN_END
```

**执行模型（扫描周期）：**

- 标准 PLC 逻辑在每个扫描周期内：**读输入 → 执行用户程序 → 写输出**，然后重复。
- 控制器上**只有一份**活动字节码程序，不是「块 A 跑完再跑块 B」的脚本顺序。
- 各编译器段末尾都会插入 `SCAN_END`（扫描结束）。模拟器 `simVm` 每个周期从 `pc=0` 开始，遇到**第一个** `SCAN_END` 即结束——若 LD、ST、SFC 同时存在，**当前模拟器只会执行 LD 段**。
- 真实固件 `plc_vm_execute()` 在 `SCAN_END` 处返回；SFC 动作另由 `plc_sfc_execute_actions()` 在 VM 之后执行（需 SFC 程序已通过固件侧加载）。

**使用建议：**

- 每个程序块**优先只使用一种语言**（LD **或** ST **或** SFC）。
- IR 拼接主要用于过渡/实验；**LD↔ST↔SFC 自动转换尚未实现**（均为单向编译到 IR）。

### 编译 API

| 端点                                | 作用                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `POST /api/v1/plc/compile`          | 完整编译：LD + ST + SFC → 字节码、`downloadHex`、`deployHex`、诊断信息 |
| `POST /api/v1/plc/compile/:blockId` | 仅按数据库中该块的 **networks** 编译（不含 ST/SFC）                    |
| `POST /api/v1/projects/:id/compile` | **全项目校验**（双线圈、地址格式等），不生成合并下载包                 |

前端下载入口：`blockStore.compilePlcDownload()` → 发送当前块的 `networks`、`st_source`、`sfc`。

### AIPLC1 程序包

`buildAiplc1Package()` 生成 JSON 元数据，包含：

- `program.bytecode` — Base64 编码的字节码（实际经 0x68 下载）
- `tags` — 编译期 Tag 表
- `sfc.binary`（可选）— SFC 二进制，供固件 `plc_sfc_load()` 使用

## UART3 功能码（ControlID = 0x01）

| 码          | 功能                                                           |
| ----------- | -------------------------------------------------------------- |
| 0x64 / 0x65 | 虚拟寄存器读/写（如 `PLCMode` @ 0x1008、`PLCScanMs` @ 0x100A） |
| 0x68        | 程序下载（BEGIN / CHUNK / END）                                |
| 0x69        | START / STOP / RESET                                           |
| 0x6A        | 状态（scan_ms、last_scan_us、error）                           |
| 0x6B        | 强制 I/O                                                       |
| 0x6D        | 监控位                                                         |
| 0x6E        | JSON 扁平 LD 调试加载                                          |
| 0x6F        | 从站 I/O 映射（最多 16 个从站）                                |

帧格式与解析：`backend/src/plc/rh850FrameParser.ts`、`services/rh850FrameParser.ts`。

## 部署流程

1. 在编辑器中编写逻辑并保存程序块。
2. 打开 **在线诊断 → RH850 部署**（`DeployPanel`）。
3. 选择连接方式并连接设备（见 [remote-tcp-deploy.md](./remote-tcp-deploy.md)）。
4. **编译并下载**：调用 compile API，发送 `deployHex`（使能 PLC + 下载 + START）。
5. （可选）**下发从站映射 (0x6F)**：将设备组态中的从站链写入控制器（见 [slave-io-configuration.md](./slave-io-configuration.md)）。
6. 使用 **查询状态 (0x6A)** 或在线诊断监视扫描周期。

### 连接模式

| 模式     | 路径                                                | 场景                 |
| -------- | --------------------------------------------------- | -------------------- |
| 本地 USB | 浏览器 Web Serial → UART3                           | 开发调试、USB 转串口 |
| 远程 TCP | 浏览器 → `/api/v1/ws/device` → 后端 → USR-K → UART3 | PCBA 入网、无 USB    |

后端环境变量：`DEVICE_TCP_ENABLED`、`DEVICE_TCP_ALLOWLIST`、`DEVICE_TCP_DEFAULT_PORT`。

## 模拟器与 IR 同步

- **Mock PLC**（`backend/src/services/mockPLC.ts`）使用与固件相同的 `simVm` 执行字节码。
- 修改 seeyaoplcmaster 中 `app/plc/plc_ir.h` 后，运行：

```bash
./scripts/sync-plc-ir.sh [path-to-seeyaoplcmaster]
```

将资源上限同步到 `backend/src/plc/plcLimits.ts`。

## 相关代码索引

| 组件             | 路径                                                            |
| ---------------- | --------------------------------------------------------------- |
| IR / Opcode 定义 | `backend/src/plc/types.ts` ↔ `seeyaoplcmaster/app/plc/plc_ir.h` |
| LD 编译          | `backend/src/plc/ldCompiler.ts`                                 |
| ST 编译          | `backend/src/plc/stParser.ts`                                   |
| SFC 编译         | `backend/src/plc/sfcParser.ts`                                  |
| 字节码发射       | `backend/src/plc/bytecodeEmitter.ts`                            |
| RH850 协议       | `backend/src/plc/rh850Protocol.ts`、`services/rh850Protocol.ts` |
| 传输层           | `services/rh850Transport.ts`                                    |
| 部署 UI          | `components/DeployPanel.tsx`                                    |
| 块状态 / 编译    | `src/stores/blockStore.ts`                                      |

## 已知限制

- **多程序块**：项目级 compile 仅做校验；下载包来自**当前打开块**，不会自动合并 OB1/OB2 等多个块。
- **ST/SFC 持久化**：后端 `blocks` PUT Schema 目前仅显式校验 `networks`；`st_source` / `sfc` 随 JSONB 存入取决于路由实现，使用前请确认保存后重开块是否保留。
- **多语言同块**：同时填写 LD+ST+SFC 时，模拟器与固件对多段 `SCAN_END` 的行为可能不符合「单扫描周期内全部执行」的预期；生产环境建议单语言 per block。
