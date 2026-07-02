import net from 'net';

describe('DeviceSession TCP bridge (integration)', () => {
  let DeviceSession: typeof import('../tcpSerialBridge').DeviceSession;
  let server: net.Server;
  let serverPort: number;

  beforeAll(async () => {
    process.env.DEVICE_TCP_ALLOWLIST = '127.0.0.1/32';
    jest.resetModules();
    ({ DeviceSession } = await import('../tcpSerialBridge'));

    server = net.createServer(socket => {
      socket.on('data', () => {
        const { buildPlcStatusFrame } = require('../../plc/rh850Protocol');
        const frame = buildPlcStatusFrame();
        const half = Math.floor(frame.length / 2);
        socket.write(Buffer.from(frame.subarray(0, half)));
        socket.write(Buffer.from(frame.subarray(half)));
      });
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    serverPort = typeof addr === 'object' && addr ? addr.port : 0;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    delete process.env.DEVICE_TCP_ALLOWLIST;
  });

  it('connects, sends, and receives reassembled frame', async () => {
    const session = new DeviceSession();
    const framePromise = new Promise<Uint8Array>(resolve => {
      session.onFrame(frame => resolve(frame));
    });

    try {
      await session.connect('127.0.0.1', serverPort, 3000);
      const { buildPlcStatusFrame } = await import('../../plc/rh850Protocol');
      await session.send(Buffer.from(buildPlcStatusFrame()));

      const frame = await Promise.race([
        framePromise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ]);

      expect(frame[0]).toBe(0x55);
      expect(frame[1]).toBe(0xaa);
    } finally {
      session.disconnect();
    }
  });
});
