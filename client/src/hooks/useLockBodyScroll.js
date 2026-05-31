import { useEffect } from 'react';

/**
 * Prevents background scroll while a modal/menu is open.
 * Locks document scroll and in-app scroll containers (e.g. league table).
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
      if (e.target.closest('.modal-overlay')) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', blockTouchMove, { passive: false });

    const blockWheel = (e) => {
      if (e.target.closest('.modal-overlay')) return;
      e.preventDefault();
    };
    document.addEventListener('wheel', blockWheel, { passive: false });

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.classList.remove('body-scroll-locked');
      document.removeEventListener('touchmove', blockTouchMove);
      document.removeEventListener('wheel', blockWheel);
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}
