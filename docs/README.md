# AIIgnitePLC 文档索引

本目录存放项目使用与集成说明。

## 远程部署（USR-K 网口转串口）

| 文档                                           | 说明                                                  |
| ---------------------------------------------- | ----------------------------------------------------- |
| [remote-tcp-deploy.md](./remote-tcp-deploy.md) | 远程 TCP 桥接架构、WebSocket 协议、环境变量、操作流程 |
| [usr-k-pcba-config.md](./usr-k-pcba-config.md) | PCBA 上 USR-K2/K3 模块出厂/现场配置参数               |

## 快速开始

1. 按 [usr-k-pcba-config.md](./usr-k-pcba-config.md) 配置 PCBA 上的 USR-K 模块
2. 在 AIIgnitePLC「设备配置」中填写模块 IP 与 TCP 端口
3. 按 [remote-tcp-deploy.md](./remote-tcp-deploy.md) 使用 DeployPanel 远程下载与监控

## 相关代码

| 组件           | 路径                                      |
| -------------- | ----------------------------------------- |
| 帧解析         | `backend/src/plc/rh850FrameParser.ts`     |
| TCP 桥接       | `backend/src/services/tcpSerialBridge.ts` |
| 设备 WebSocket | `backend/src/routes/deviceWs.ts`          |
| 前端传输层     | `services/rh850Transport.ts`              |
| 部署面板       | `components/DeployPanel.tsx`              |
