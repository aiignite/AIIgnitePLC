import { fetchWithAuth } from '../src/services/authFetch';
import type { Network, SfcProgram, TagDefinition } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3310/api/v1';

export interface CompilePlcOptions {
  networks?: Network[];
  stSource?: string;
  sfc?: SfcProgram;
  tags?: TagDefinition[];
  scanMs?: number;
}

export interface CompilePlcResult {
  success: boolean;
  package?: Record<string, unknown>;
  downloadHex?: string;
  binarySize?: number;
  downloadFrameCount?: number;
  diagnostics?: Array<{ severity: string; message: string }>;
  error?: string;
}

export async function compilePlcProgram(opts: CompilePlcOptions): Promise<CompilePlcResult> {
  const response = await fetchWithAuth(`${API_BASE}/plc/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      networks: opts.networks,
      st_source: opts.stSource,
      sfc: opts.sfc,
      tags: opts.tags,
      scan_ms: opts.scanMs ?? 10,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    return { success: false, error: data.error?.message || 'Compile failed' };
  }
  return data;
}

export function downloadHexToFile(hex: string, filename = 'plc_download.hex') {
  const blob = new Blob([hex], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
