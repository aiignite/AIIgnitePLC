import { useCallback, useEffect, useRef } from 'react';

interface AutoSaveOptions {
  currentBlockId: string | null;
  currentBlock: { version: number } | null;
  networks: unknown[];
  hasUnsavedChanges: boolean;
  saveBlock: (blockId: string, content: { networks: unknown[] }, version: number) => Promise<void>;
  delay?: number;
}

export function useAutoSave({
  currentBlockId,
  currentBlock,
  networks,
  hasUnsavedChanges,
  saveBlock,
  delay = 1500,
}: AutoSaveOptions): void {
  const autoSaveTimerRef = useRef<number | null>(null);

  const performAutoSave = useCallback(async () => {
    if (!currentBlockId || !currentBlock) return;

    try {
      await saveBlock(currentBlockId, { networks }, currentBlock.version);
    } catch (e) {
      console.error('自动保存失败:', e);
    }
  }, [currentBlockId, currentBlock, networks, saveBlock]);

  useEffect(() => {
    if (!currentBlockId || !currentBlock || !hasUnsavedChanges) return;

    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = window.setTimeout(() => {
      void performAutoSave();
    }, delay);

    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [currentBlockId, currentBlock, networks, hasUnsavedChanges, delay, performAutoSave]);
}
