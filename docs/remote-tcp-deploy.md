# USR-K 远程 TCP 部署说明

本文档说明如何通过 PCBA 上焊接的 [USR-K2/K3 超级网口](https://www.usr.cn/Product/21.html)，在同局域网内远程完成 RH850 程序下载与在线监控。

PCBA 模块参数配置见 [usr-k-pcba-config.md](./usr-k-pcba-config.md)。

## 网络拓扑

```
浏览器 (DeployPanel)
    │  WebSocket + JWT
    ▼
AIIgnitePLC 后端 (TCP Client)
    │  透明透传
    ▼
USR-K 模块 (TCP Server, 焊接在 PCBA)
    │  TTL 115200 8N1
    ▼
RH850 UART3 (seeyaoplcmaster 固件)
```

**前提**：后端服务器与 PCBA 处于**同一局域网**，后端能访问 USR-K 模块 IP:Port。

浏览器无法直接打开 TCP 连接，因此由后端作为 TCP Client 桥接至 USR-K，前端通过鉴权 WebSocket 与后端通信。

## 连接模式对比

| 模式           | 路径                               | 适用场景                 |
| -------------- | ---------------------------------- | ------------------------ |
| 本地 USB       | 浏览器 Web Serial → UART3          | 开发调试、USB 转串口直连 |
| 远程 TCP (LAN) | 浏览器 → WS → 后端 → USR-K → UART3 | PCBA 已入网、无 USB 线   |

两种模式复用同一套 RH850 协议（FuncCode 0x64–0x6F），帧格式不变。

## 操作流程

### 1. 配置硬件信息

在 **设备配置 → RH850 CPU → USR-K 通讯** 中填写：

- 模块型号：K2 / K3
- 模块 IP：USR-K 在局域网中的地址
- TCP 端口：默认 `8234`
- 串口波特率：`115200`（只读，须与模块一致）

配置保存在 `hardware_modules.config`（`moduleIp`、`tcpPort`、`moduleType`、`baudRate`）。

### 2. 登录系统

远程 TCP 模式需要 JWT 鉴权，请先登录 AIIgnitePLC。

### 3. 部署面板操作

打开 **在线诊断** 中的 **RH850 部署** 面板：

1. 选择 **远程 TCP (LAN)**
2. 确认 IP / 端口（可从硬件配置自动填充）
3. 点击 **连接 TCP**
4. 点击 **测试连接**（发送 0x6A，读取 scan_ms 与周期）
5. 点击 **编译并下载**（完整 deployHex：使能 PLC + 下载 + START）
6. 使用 **查询状态** 或在线诊断轮询 0x6A / 0x6D

### 4. 在线监控

连接建立后，`deployStore` 通过同一传输层支持：

- **0x6A** — PLC 状态（模式、scan_ms、扫描周期）
- **0x6B** — 强制 I/O
- **0x6D** — 监控位值

## WebSocket 设备通道协议

**端点**：`GET /api/v1/ws/device?token=<JWT>`

与 Mock PLC 仿真通道 `/api/v1/ws` 分离，语义独立。

### 客户端 → 服务端

| type         | payload                                    | 说明              |
| ------------ | ------------------------------------------ | ----------------- |
| `connect`    | `{ "host": "192.168.0.10", "port": 8234 }` | 后端建立 TCP 连接 |
| `disconnect` | —                                          | 断开 TCP          |
| `send`       | `{ "data": "<base64>" }`                   | 发送 RH850 帧     |
| `ping`       | —                                          | 保活              |

### 服务端 → 客户端

| type           | payload                  | 说明              |
| -------------- | ------------------------ | ----------------- |
| `connected`    | `{ "host", "port" }`     | TCP 已连接        |
| `disconnected` | `{ "reason" }`           | TCP 已断开        |
| `frame`        | `{ "data": "<base64>" }` | 完整 RH850 应答帧 |
| `error`        | `{ "message", "code" }`  | 错误              |
| `pong`         | —                        | ping 响应         |

约束：一个 WebSocket 连接对应一个 TCP 会话；WS 关闭时自动销毁 TCP。

## RH850 帧格式

```
0x55 0xAA 0x55 0xAA | len(2) | ctrl | func | index | data | crc16
```

TCP 透传可能产生半包/粘包，后端 `rh850FrameParser` 按帧头与长度字段重组并校验 CRC16 后再转发给浏览器。

## 后端环境变量

在 `backend/.env` 中配置：

```env
DEVICE_TCP_ENABLED=true
DEVICE_TCP_ALLOWLIST=192.168.0.0/16,10.0.0.0/8,172.16.0.0/12
DEVICE_TCP_DEFAULT_PORT=8234
DEVICE_TCP_CONNECT_TIMEOUT_MS=5000
```

| 变量                            | 说明                             |
| ------------------------------- | -------------------------------- |
| `DEVICE_TCP_ENABLED`            | 设为 `false` 可禁用设备 TCP 桥接 |
| `DEVICE_TCP_ALLOWLIST`          | 允许连接的目标 IP/CIDR，防 SSRF  |
| `DEVICE_TCP_DEFAULT_PORT`       | 默认 TCP 端口（UI 可覆盖）       |
| `DEVICE_TCP_CONNECT_TIMEOUT_MS` | TCP 连接超时（毫秒）             |

## 安全说明

- WebSocket 必须携带有效 JWT，未登录无法 `connect`
- 目标 IP 须在白名单或私有网段内（10/8、172.16/12、192.168/16）
- 默认拒绝 `127.0.0.1`、链路本地地址等
- 连接/断开操作写入审计日志（`plc.device.connect` / `plc.device.disconnect`）
- **不要**将 USR-K TCP 端口映射到公网；跨网远程请使用 VPN 接入目标 LAN

## 验收检查清单

- [ ] USR-K 已配置为 TCP Server 透传，115200 8N1，注册包/心跳包已关闭
- [ ] 后端与 PCBA 同网段，能 ping 通模块 IP
- [ ] 已登录，DeployPanel 远程 TCP 连接成功
- [ ] 测试连接返回 0x6A 状态
- [ ] 编译并下载完成，PLC 进入 RUN
- [ ] 在线诊断可读取 scan_ms 与监控点
- [ ] 本地 USB 模式仍可正常使用（回归）

## 故障排查

| 现象              | 可能原因                  | 处理                                     |
| ----------------- | ------------------------- | ---------------------------------------- |
| 远程 TCP 需要登录 | 未携带 JWT                | 先登录再连接                             |
| Host not allowed  | IP 不在白名单             | 检查 `DEVICE_TCP_ALLOWLIST` 与模块 IP    |
| 连接超时          | 网络不通或端口错误        | ping 模块 IP，确认 USR-K TCP Server 端口 |
| 测试连接超时      | 模块未透传 / 串口参数不对 | 核对 115200 8N1，RH850 是否上电          |
| 下载失败          | 串口 RX 溢出 / 帧被拆包   | 调大 USR-K 打包长度；后端已做帧重组      |
| CRC 错误          | 注册包/心跳包污染         | 关闭 USR-K 注册包与心跳包                |

## 相关源码

| 层级           | 文件                                      |
| -------------- | ----------------------------------------- |
| 帧解析（后端） | `backend/src/plc/rh850FrameParser.ts`     |
| 帧解析（前端） | `services/rh850FrameParser.ts`            |
| TCP 会话       | `backend/src/services/tcpSerialBridge.ts` |
| IP 策略        | `backend/src/services/deviceTcpPolicy.ts` |
| WebSocket 路由 | `backend/src/routes/deviceWs.ts`          |
| 传输抽象       | `services/rh850Transport.ts`              |
| 协议封装       | `services/rh850Protocol.ts`               |
| 状态           | `src/stores/deployStore.ts`               |
| UI             | `components/DeployPanel.tsx`              |

## 本期未实现

- USR 有人云 / 透传云中转
- 设备 TCP Client 反连云端
- K3 原生 WebSocket 直连浏览器（统一走后端桥接）
