# 从站 I/O 与设备组态

本文说明 RH850 主站通过 **UART2 菊花链** 连接从板时的设备组态、寄存器映射与 **0x6F** 下发流程。类型与常量定义见 `src/types/rh850Slaves.ts`（与单片机从站固件对齐）。

## 拓扑概览

```
上位机 (AIIgnitePLC)
    │ UART3 @ 115200 — RH850 协议 (0x64–0x6F)
    ▼
RH850 主站 (R7F701581, seeyaoplcmaster)
    │ 内置 6×DI + 4×HSD DO
    │ UART2 @ 115200 — 菊花链从站协议
    ▼
[AD] → [Relay] → [Light] → [Resistor] → …  (最多 16 从站)
```

主站通讯接口摘要（`MASTER_CONTROLLER`）：

| 接口      | 说明                   |
| --------- | ---------------------- |
| UART3     | 上位机 RH850 协议      |
| UART2     | PCAN 菊花链从板        |
| CAN-FD ×4 | 寄存器基址 0x8000      |
| LIN ×2    | RLIN30/31，基址 0x6000 |
| 内置 DI   | 6 路 @ 0x3000          |
| 内置 DO   | 4 路 HSD @ 0x4400      |

## 默认从站链

新建 RH850 CPU 模块时，默认链顺序（`DEFAULT_SLAVE_CHAIN`）：

| chainPos | 板型        | BoardID | DI 寄存器 | DO 寄存器 | 说明                   |
| -------- | ----------- | ------- | --------- | --------- | ---------------------- |
| 1        | AD 电流采样 | 0x0101  | 0x4000    | —         | 6×电流 + 电阻 + 6×电压 |
| 2        | 继电器      | 0x0201  | —         | 0x4000    | 8 路继电器输出         |
| 3        | 灯光        | 0x0501  | 0x4000    | 0x4400    | 灯光控制               |
| 4        | 电阻        | 0x0601  | 0x4000    | —         | 20 路电阻测量          |

各板详细通道、GPIO、特殊功能见 `SLAVE_BOARD_DEFINITIONS`。

## 设备组态 UI

路径：**组态视图 → DeviceConfiguration**（`components/DeviceConfiguration.tsx`）

选中 **RH850 CPU** 或 **IO 模块** 后，右侧检查器提供 Tab：

| Tab               | 内容                                                   |
| ----------------- | ------------------------------------------------------ |
| **从站总线**      | UART2 拓扑、BoardID、寄存器区域、通道表                |
| **主站 IO/通讯**  | 内置 DI/DO、CAN/LIN、USR-K 网口参数                    |
| **从站 I/O 映射** | `SlaveIoMapping` — 链配置、同步机架、生成/预览 0x6F 帧 |

### 机架与从站链同步

- IO 槽位模块可带 `boardType`、`chainPos`、`boardId` 等字段。
- **从机架同步**：`hardwareStore.syncSlaveChainFromModules()` 按 `chainPos` 生成 `slaveChain` 并写入 CPU 模块 `config.slaveChain`。
- 也可在 **从站 I/O 映射** 中手动编辑链顺序与启用状态。

### USR-K 远程通讯

在 CPU 模块 **主站 IO/通讯** 中配置：

- 模块型号 K2 / K3
- 模块 IP、TCP 端口（默认 8234）
- 波特率 115200（须与 USR-K 一致）

详见 [usr-k-pcba-config.md](./usr-k-pcba-config.md)、[remote-tcp-deploy.md](./remote-tcp-deploy.md)。

## 0x6F 从站 I/O 映射

**作用**：告诉 RH850 固件每个菊花链位置的从站，其 DI/DO 寄存器映射到 PLC 地址空间的哪一段（`%I` / `%Q` 扩展区）。

### 配置存储

保存在 `hardware_modules.config.slaveChain`：

```typescript
interface SlaveBoardConfig {
  chainPos: number; // 1–16，对应 slavenum
  boardType: 'ad' | 'relay' | 'light' | 'resistor' | 'custom';
  boardId: number; // 如 0x0101
  enabled: boolean;
  diRegAddr: number; // 从站 DI 寄存器基址
  doRegAddr: number; // 从站 DO 寄存器基址
  ioBytes?: number;
}
```

### 生成与下发

| 方式                                  | 说明                                                                 |
| ------------------------------------- | -------------------------------------------------------------------- |
| **设备组态 → 从站 I/O 映射**          | 生成 0x6F 帧预览、保存链配置                                         |
| **DeployPanel → 下发从站映射 (0x6F)** | 连接设备后，按当前 `getEffectiveSlaveChain()` 逐帧发送               |
| **API**                               | `GET /api/v1/projects/:projectId/hardware/slave-map-hex` 返回 hex 帧 |

帧构建：`services/slaveProtocol.ts`、`backend/src/plc/rh850Protocol.ts`（`buildSlaveMapHexFromChain`）。

### 建议 Tag 地址

`rh850Slaves.ts` 提供 `suggestPlcTagAddress()`，按从站类型与通道索引推荐 `%I` / `%Q` 地址，便于在变量表中声明。

## UART2 从站协议（参考）

与主站 RH850 协议不同，从站链使用帧头 `55 AA 55 AA`，功能码包括：

| 码          | 方向                | 说明                           |
| ----------- | ------------------- | ------------------------------ |
| 0x44 / 0x45 | 主站读寄存器 / 应答 | 菊花链转发                     |
| 0x46 / 0x47 | 主站写寄存器 / 应答 |                                |
| 0x64 / 0x65 | 主机读/写寄存器     | 经 UART3 透传                  |
| 0x6F        | PLC 从站映射        | 配置 DI/DO 与 PLC 地址对应关系 |

常量见 `UART_SLAVE_PROTOCOL`。

## 操作流程 checklist

1. 在 **设备组态** 中确认 CPU、IO 槽位与从站链顺序。
2. 点击 **从机架同步**（或手动调整 chainPos / BoardID）。
3. 在 **从站 I/O 映射** 中保存配置。
4. 连接设备（USB 或远程 TCP）。
5. 先 **编译并下载** 用户程序（0x68），再 **下发从站映射 (0x6F)**。
6. 在变量表中使用建议地址绑定从站通道。

## 相关代码

| 组件         | 路径                                 |
| ------------ | ------------------------------------ |
| 从站类型定义 | `src/types/rh850Slaves.ts`           |
| 硬件 Store   | `src/stores/hardwareStore.ts`        |
| 组态 UI      | `components/DeviceConfiguration.tsx` |
| 映射 UI      | `components/SlaveIoMapping.tsx`      |
| 部署下发     | `components/DeployPanel.tsx`         |
| 硬件 API     | `backend/src/routes/hardware.ts`     |
| 从站帧协议   | `services/slaveProtocol.ts`          |
