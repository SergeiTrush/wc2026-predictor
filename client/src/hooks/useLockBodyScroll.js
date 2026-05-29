import { useEffect } from 'react';

/**
 * Prevents background scroll while a modal/menu is open.
 * Uses overflow lock only (not body position:fixed) so viewport-fixed menus stay correct.
 */
export function useLockBodyScroll(locked) {
  useEffect(() => {
    if (!locked) return;

    const scrollY = window.scrollY;
    const { body, documentElement: html } = document;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.classList.add('body-scroll-locked');

    const blockTouchMove = (e) => {
      if (e.target.closest('.modal-sheet--top-menu')) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', blockTouchMove, { passive: false });

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.classList.remove('body-scroll-locked');
      document.removeEventListener('touchmove', blockTouchMove);
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}
