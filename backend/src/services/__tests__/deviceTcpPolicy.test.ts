import { isDeviceHostAllowed } from '../deviceTcpPolicy';

describe('deviceTcpPolicy', () => {
  const allowlist = ['192.168.0.0/16', '10.0.0.0/8'];

  it('allows private LAN hosts in allowlist', () => {
    expect(isDeviceHostAllowed('192.168.0.10', allowlist)).toBe(true);
    expect(isDeviceHostAllowed('10.0.0.5', allowlist)).toBe(true);
  });

  it('blocks loopback when not in allowlist', () => {
    expect(isDeviceHostAllowed('127.0.0.1', allowlist)).toBe(false);
    expect(isDeviceHostAllowed('169.254.1.1', allowlist)).toBe(false);
  });

  it('allows loopback when explicitly in allowlist', () => {
    expect(isDeviceHostAllowed('127.0.0.1', ['127.0.0.1/32'])).toBe(true);
  });

  it('blocks public IP when allowlist is set', () => {
    expect(isDeviceHostAllowed('8.8.8.8', allowlist)).toBe(false);
  });

  it('allows private IP when allowlist is empty', () => {
    expect(isDeviceHostAllowed('192.168.1.1', [])).toBe(true);
    expect(isDeviceHostAllowed('8.8.8.8', [])).toBe(false);
  });
});
