# AIIgnitePLC 文档索引

本目录存放项目使用、部署与 RH850 集成说明。

## RH850 目标与编译

| 文档                                                     | 说明                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| [rh850-integration.md](./rh850-integration.md)           | 编译流水线、LD/ST/SFC 与 IR 拼接、AIPLC1 包、UART3 功能码、部署流程、模拟器 |
| [slave-io-configuration.md](./slave-io-configuration.md) | 从站菊花链、设备组态、BoardID、0x6F 映射与下发                              |

## 远程部署（USR-K 网口转串口）

| 文档                                           | 说明                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| [remote-tcp-deploy.md](./remote-tcp-deploy.md) | 远程 TCP 桥接架构、WebSocket 协议、环境变量、DeployPanel 操作流程 |
| [usr-k-pcba-config.md](./usr-k-pcba-config.md) | PCBA 上 USR-K2/K3 模块出厂/现场配置参数                           |

## 推荐阅读顺序

### 首次连接 RH850 控制器

1. [rh850-integration.md](./rh850-integration.md) — 了解编译与下载整体流程
2. [usr-k-pcba-config.md](./usr-k-pcba-config.md) — 配置 PCBA 上网模块（若使用 LAN）
3. [remote-tcp-deploy.md](./remote-tcp-deploy.md) — 远程 TCP 连接与 DeployPanel 操作
4. [slave-io-configuration.md](./slave-io-configuration.md) — 配置从站链并下发 0x6F

### 仅本地 USB 调试

1. [rh850-integration.md](./rh850-integration.md) § 部署流程
2. DeployPanel 选择 **本地 USB**，Chrome/Edge + Web Serial

## 相关代码速查

| 能力               | 路径                                                           |
| ------------------ | -------------------------------------------------------------- |
| PLC 编译 API       | `backend/src/routes/plc.ts`                                    |
| LD / ST / SFC 编译 | `backend/src/plc/ldCompiler.ts`, `stParser.ts`, `sfcParser.ts` |
| 字节码 / AIPLC1    | `backend/src/plc/bytecodeEmitter.ts`                           |
| RH850 帧与协议     | `backend/src/plc/rh850Protocol.ts`, `rh850FrameParser.ts`      |
| TCP 桥接           | `backend/src/services/tcpSerialBridge.ts`                      |
| 设备 WebSocket     | `backend/src/routes/deviceWs.ts`                               |
| 前端传输层         | `services/rh850Transport.ts`                                   |
| 部署面板           | `components/DeployPanel.tsx`                                   |
| 设备组态           | `components/DeviceConfiguration.tsx`                           |
| 从站类型           | `src/types/rh850Slaves.ts`                                     |
| IR 同步脚本        | `scripts/sync-plc-ir.sh`                                       |

## 其他文档

- 仓库根目录 [README.md](../README.md) — 项目概览、快速开始、功能表
- [CLAUDE.md](../CLAUDE.md) — 面向 AI 辅助开发的架构与约束摘要
- [backend/README.md](../backend/README.md) — 后端 API 与数据库
