/**
 * Mock PLC 模拟器
 * 模拟 PLC 运行时行为，包括输入变化、逻辑执行和输出更新
 */

export interface PLCValueUpdate {
  address: string;
  value: boolean | number | string;
  quality: 'good' | 'bad';
}

export type UpdateCallback = (updates: PLCValueUpdate[]) => void;

export class MockPLCRuntime {
  private projectId: string;
  private state: Map<string, any> = new Map();
  private subscriptions: Set<string> = new Set();
  private updateCallback?: UpdateCallback;
  private intervalId?: NodeJS.Timeout;
  private isRunning: boolean = false;

  // 默认初始状态
  private readonly defaultState: Record<string, boolean | number> = {
    // 输入
    '%I0.0': false,  // Start Button
    '%I0.1': false,  // Stop Button
    '%I0.2': false,  // Emergency Stop
    // 输出
    '%Q0.0': false,  // Motor Output
    '%Q0.1': false,  // Warning Light
    // 内存位
    '%M0.0': false,  // Latching Coil
    '%M0.1': false,  // Timer Done
    // 定时器
    '%T0': 0,
  };

  constructor(projectId: string) {
    this.projectId = projectId;
    // 复制默认状态
    this.state = new Map(Object.entries(this.defaultState));
  }

  /**
   * 启动 PLC 模拟
   */
  start(updateInterval: number = 1000) {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log(`🔄 Mock PLC 启动: project=${this.projectId}`);

    this.intervalId = setInterval(() => {
      this.simulateCycle();
    }, updateInterval);
  }

  /**
   * 停止 PLC 模拟
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    console.log(`⏸️ Mock PLC 停止: project=${this.projectId}`);
  }

  /**
   * 订阅地址变化
   */
  subscribe(address: string) {
    this.subscriptions.add(address);
    // 立即发送当前值
    const value = this.state.get(address);
    if (value !== undefined && this.updateCallback) {
      this.updateCallback([{
        address,
        value,
        quality: 'good',
      }]);
    }
  }

  /**
   * 取消订阅
   */
  unsubscribe(address: string) {
    this.subscriptions.delete(address);
  }

  /**
   * 手动写入值
   */
  writeValue(address: string, value: any) {
    const oldValue = this.state.get(address);
    this.state.set(address, value);

    // 通知订阅者
    if (this.updateCallback) {
      this.updateCallback([{
        address,
        value,
        quality: 'good',
      }]);
    }

    console.log(`✏️ 写入: ${address} = ${value} (原值: ${oldValue})`);
  }

  /**
   * 获取所有值
   */
  getAllValues(): Map<string, any> {
    const result = new Map();
    this.subscriptions.forEach((addr) => {
      result.set(addr, this.state.get(addr));
    });
    return result;
  }

  /**
   * 设置更新回调
   */
  onUpdate(callback: UpdateCallback) {
    this.updateCallback = callback;
  }

  /**
   * 模拟一个 PLC 扫描周期
   */
  private simulateCycle() {
    const updates: PLCValueUpdate[] = [];

    // 1. 模拟输入随机变化
    this.simulateInputChange('%I0.0', 0.02);  // Start Button
    this.simulateInputChange('%I0.1', 0.01);  // Stop Button

    // 2. 执行 PLC 逻辑（简单的自锁电路）
    const startBtn = this.state.get('%I0.0') || false;
    const stopBtn = this.state.get('%I0.1') || false;
    const latch = this.state.get('%M0.0') || false;

    // 自锁逻辑: (Start OR Latch) AND NOT Stop
    const newLatch = (startBtn || latch) && !stopBtn;
    if (newLatch !== latch) {
      this.state.set('%M0.0', newLatch);
      updates.push({
        address: '%M0.0',
        value: newLatch,
        quality: 'good',
      });
    }

    // 3. 更新输出
    const motorOutput = this.state.get('%M0.0') || false;
    this.state.set('%Q0.0', motorOutput);

    if (this.subscriptions.has('%Q0.0')) {
      updates.push({
        address: '%Q0.0',
        value: motorOutput,
        quality: 'good',
      });
    }

    // 4. 警告灯逻辑（停止时闪烁）
    const warningLight = !motorOutput && Math.random() < 0.3;
    this.state.set('%Q0.1', warningLight);

    if (this.subscriptions.has('%Q0.1')) {
      updates.push({
        address: '%Q0.1',
        value: warningLight,
        quality: 'good',
      });
    }

    // 5. 发送所有更新
    if (updates.length > 0 && this.updateCallback) {
      this.updateCallback(updates);
    }
  }

  /**
   * 模拟输入变化（模拟传感器波动）
   */
  private simulateInputChange(address: string, probability: number) {
    // 小概率改变输入状态
    if (Math.random() < probability) {
      const currentValue = this.state.get(address) || false;
      const newValue = !currentValue;
      this.state.set(address, newValue);

      if (this.subscriptions.has(address) && this.updateCallback) {
        this.updateCallback([{
          address,
          value: newValue,
          quality: 'good',
        }]);
      }
    }
  }
}

/**
 * 创建 Mock PLC 实例的工厂函数
 */
export function createMockPLCRuntime(projectId: string): MockPLCRuntime {
  const plc = new MockPLCRuntime(projectId);
  plc.start();
  return plc;
}
