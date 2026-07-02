/**
 * UART3 download frame builder — re-exports from rh850Protocol
 */

export {
  buildDownloadSession,
  buildFullDeploySession,
  framesToHex,
  hexToFrames,
  type DownloadSession,
  type FullDeploySession,
} from './rh850Protocol';
