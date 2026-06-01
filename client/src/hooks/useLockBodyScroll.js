import { useEffect } from 'react';

let lockCount = 0;

function isScrollable(el) {
  if (!el || el.nodeType !== 1) return false;
  const { overflowY } = window.getComputedStyle(el);
  if (!['auto', 'scroll', 'overlay'].includes(overflowY)) return false;
  return el.scrollHeight > el.clientHeight + 1;
}

/** Touch/wheel may scroll only inside a scrollable block within the modal (not the backdrop). */
function allowModalScroll(target) {
  const overlay = target?.closest?.('.modal-overlay');
  if (!overlay) return false;

  let node = target;
  while (node && node !== overlay) {
    if (isScrollable(node)) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * Prevents background scroll while a modal overlay is open.
 * Locks window + .app-root / .league-shell; modal lists/sheets can still scroll.
 */
export function useLockBodyScroll(locked) {
  useEffect(() => {
    if (!locked) return undefined;

    lockCount += 1;
    if (lockCount > 1) {
      return () => {
        lockCount = Math.max(0, lockCount - 1);
      };
    }

    const scrollY = window.scrollY;
    const { body, documentElement: html } = document;

    const saved = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
    };

    html.style.overflow = 'hidden';
    body.classList.add('body-scroll-locked');
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';

    const blockTouchMove = (e) => {
      if (!allowModalScroll(e.target)) e.preventDefault();
    };

    const blockWheel = (e) => {
      if (!allowModalScroll(e.target)) e.preventDefault();
    };

    document.addEventListener('touchmove', blockTouchMove, { passive: false });
    document.addEventListener('wheel', blockWheel, { passive: false });

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount > 0) return;

      html.style.overflow = saved.htmlOverflow;
      body.style.overflow = saved.bodyOverflow;
      body.style.position = saved.bodyPosition;
      body.style.top = saved.bodyTop;
      body.style.left = saved.bodyLeft;
      body.style.right = saved.bodyRight;
      body.style.width = saved.bodyWidth;
      body.classList.remove('body-scroll-locked');

      document.removeEventListener('touchmove', blockTouchMove);
      document.removeEventListener('wheel', blockWheel);
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}
