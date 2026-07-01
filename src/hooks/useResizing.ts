import { useCallback } from 'react';

interface ResizingState {
  leftWidth: number;
  rightWidth: number;
  inspectorHeight: number;
}

interface UseResizingOptions {
  minLeftWidth?: number;
  maxLeftWidth?: number;
  minRightWidth?: number;
  maxRightWidth?: number;
  minInspectorHeight?: number;
  maxInspectorHeight?: number;
}

interface UseResizingReturn {
  startResizing: (direction: 'left' | 'right' | 'bottom') => (e: React.MouseEvent) => void;
  stopResizing: () => void;
  resize: (e: MouseEvent) => ResizingState | null;
}

export function useResizing(
  state: ResizingState,
  setState: React.Dispatch<React.SetStateAction<ResizingState>>,
  isResizing: 'left' | 'right' | 'bottom' | null,
  setIsResizing: React.Dispatch<React.SetStateAction<'left' | 'right' | 'bottom' | null>>,
  options: UseResizingOptions = {}
): UseResizingReturn {
  const {
    minLeftWidth = 150,
    maxLeftWidth = 600,
    minRightWidth = 200,
    maxRightWidth = 500,
    minInspectorHeight = 100,
    maxInspectorHeight = 600,
  } = options;

  const startResizing = useCallback(
    (direction: 'left' | 'right' | 'bottom') => (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(direction);
    },
    [setIsResizing]
  );

  const stopResizing = useCallback(() => {
    setIsResizing(null);
  }, [setIsResizing]);

  const resize = useCallback(
    (e: MouseEvent): ResizingState | null => {
      if (!isResizing) return null;

      const newState: ResizingState = { ...state };

      if (isResizing === 'left') {
        const newWidth = e.clientX;
        if (newWidth >= minLeftWidth && newWidth <= maxLeftWidth) {
          newState.leftWidth = newWidth;
        }
      } else if (isResizing === 'right') {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth >= minRightWidth && newWidth <= maxRightWidth) {
          newState.rightWidth = newWidth;
        }
      } else if (isResizing === 'bottom') {
        const newHeight = window.innerHeight - e.clientY;
        if (newHeight >= minInspectorHeight && newHeight <= maxInspectorHeight) {
          newState.inspectorHeight = newHeight;
        }
      }

      return newState;
    },
    [
      isResizing,
      state,
      minLeftWidth,
      maxLeftWidth,
      minRightWidth,
      maxRightWidth,
      minInspectorHeight,
      maxInspectorHeight,
    ]
  );

  return {
    startResizing,
    stopResizing,
    resize,
  };
}
