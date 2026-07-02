/**
 * UART3 download frame builder — re-exports from rh850Protocol
 */

export {
  buildDownloadSession,
  buildFullDeploySession,
  buildMultiBlockDeploySession,
  buildSelectObFrame,
  framesToHex,
  hexToFrames,
  type DownloadBlockMeta,
  type DownloadSession,
  type FullDeploySession,
} from './rh850Protocol';
