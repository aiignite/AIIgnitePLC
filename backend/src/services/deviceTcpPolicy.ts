/**
 * SSRF-safe host validation for device TCP connections.
 */

const BLOCKED_HOSTS = new Set(['127.0.0.1', '0.0.0.0', 'localhost', '::1']);

function parseAllowlistEntry(entry: string): { base: number; mask: number } | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;

  if (trimmed.includes('/')) {
    const [ipPart, bitsStr] = trimmed.split('/');
    const bits = parseInt(bitsStr, 10);
    if (!ipPart || Number.isNaN(bits) || bits < 0 || bits > 32) return null;
    const parts = ipPart.split('.').map(p => parseInt(p, 10));
    if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return null;
    const base = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return { base: base & mask, mask };
  }

  const parts = trimmed.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return null;
  const base = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  return { base, mask: 0xffffffff };
}

function ipToInt(host: string): number | null {
  const parts = host.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIp(host: string): boolean {
  const ip = ipToInt(host);
  if (ip === null) return false;
  const a = (ip >>> 24) & 0xff;
  const b = (ip >>> 16) & 0xff;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function isDeviceHostAllowed(host: string, allowlist: string[]): boolean {
  const normalized = host.trim().toLowerCase();
  if (normalized.startsWith('169.254.')) return false;

  const ip = ipToInt(normalized);
  if (ip === null) return false;

  if (allowlist.length > 0) {
    return allowlist.some(entry => {
      const rule = parseAllowlistEntry(entry);
      if (!rule) return false;
      return (ip & rule.mask) === rule.base;
    });
  }

  if (BLOCKED_HOSTS.has(normalized)) return false;
  return isPrivateIp(normalized);
}
