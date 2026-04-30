import { useEffect, useCallback } from 'react';

/**
 * Centralized keyboard shortcuts hook.
 *
 * @param {Object} shortcuts - Map of shortcut definitions.
 *   Key format: "ctrl+shift+s", "ctrl+n", "?" etc.
 *   Value: { handler: Function, description: string, category: string, allowInInput?: boolean }
 * @param {boolean} enabled - Whether shortcuts are active (default true)
 */
export default function useKeyboardShortcuts(shortcuts, enabled = true) {
  const handleKeyDown = useCallback((e) => {
    if (!enabled) return;

    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) ||
      document.activeElement?.isContentEditable;

    for (const [combo, shortcut] of Object.entries(shortcuts)) {
      const parts = combo.toLowerCase().split('+');
      const key = parts[parts.length - 1];
      const needsCtrl = parts.includes('ctrl');
      const needsShift = parts.includes('shift');
      const needsAlt = parts.includes('alt');

      const ctrlMatch = needsCtrl === (e.ctrlKey || e.metaKey);
      const shiftMatch = needsShift === e.shiftKey;
      const altMatch = needsAlt === e.altKey;

      let keyMatch = false;
      if (key === '/') {
        keyMatch = e.key === '/' || e.code === 'Slash';
      } else if (key === '?') {
        keyMatch = e.key === '?';
      } else {
        keyMatch = e.key.toLowerCase() === key;
      }

      if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
        // Skip non-modifier shortcuts when focused on input (unless explicitly allowed)
        if (isInput && !needsCtrl && !needsAlt && !shortcut.allowInInput) {
          continue;
        }

        e.preventDefault();
        shortcut.handler();
        return;
      }
    }
  }, [shortcuts, enabled]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
