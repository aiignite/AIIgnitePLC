import { useCallback, useEffect } from 'react';

interface KeyboardShortcutsOptions {
  undo: () => void;
  redo: () => void;
  duplicateSelectedElement: () => void;
  moveSelectedElement: (direction: 'left' | 'right') => void;
  deleteSelectedElement: () => void;
  selectedElement: { id: string } | null;
}

export function useKeyboardShortcuts({
  undo,
  redo,
  duplicateSelectedElement,
  moveSelectedElement,
  deleteSelectedElement,
  selectedElement,
}: KeyboardShortcutsOptions): void {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();

      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) {
        return;
      }

      const isMod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      // Undo: Ctrl/Cmd + Z
      if (isMod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      // Redo: Ctrl/Cmd + Y
      if (isMod && key === 'y') {
        event.preventDefault();
        redo();
      }

      // Duplicate: Ctrl/Cmd + D
      if (isMod && key === 'd') {
        event.preventDefault();
        duplicateSelectedElement();
      }

      // Move left: Alt + ArrowLeft
      if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        moveSelectedElement('left');
      }

      // Move right: Alt + ArrowRight
      if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault();
        moveSelectedElement('right');
      }

      // Delete: Delete or Backspace
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedElement) {
        event.preventDefault();
        deleteSelectedElement();
      }
    },
    [
      undo,
      redo,
      duplicateSelectedElement,
      moveSelectedElement,
      deleteSelectedElement,
      selectedElement,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
