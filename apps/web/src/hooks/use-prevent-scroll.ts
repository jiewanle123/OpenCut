import { useEffect } from 'react';

interface UsePreventScrollOptions {
  enabled?: boolean;
  element?: HTMLElement;
}

export function usePreventScroll({ enabled = true, element }: UsePreventScrollOptions = {}) {
  useEffect(() => {
    if (!enabled) return;

    const targetElement = element || document.body;
    const originalOverflow = targetElement.style.overflow;
    const originalPaddingRight = targetElement.style.paddingRight;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    targetElement.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      targetElement.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      targetElement.style.overflow = originalOverflow;
      targetElement.style.paddingRight = originalPaddingRight;
    };
  }, [enabled, element]);
}
