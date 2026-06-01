/**
 * Fixed dropdown placement: flip above trigger when needed, clamp to viewport.
 */
export function computeFixedDropdownStyle(triggerRect, options = {}) {
  const {
    gap = 4,
    viewportPad = 12,
    searchHeight = 0,
    minMenuHeight = 96,
    preferredMenuHeight = 192,
    /** Taller list when menu opens above the trigger (e.g. field near bottom of screen). */
    preferredMenuHeightAbove = null,
    minWidth = 220,
    zIndex = 1200,
  } = options;

  const viewportH = window.visualViewport?.height ?? window.innerHeight;
  const viewportW = window.innerWidth;
  const width = Math.max(triggerRect.width, minWidth);
  let left = triggerRect.left;
  if (left + width > viewportW - viewportPad) left = viewportW - width - viewportPad;
  if (left < viewportPad) left = viewportPad;

  const spaceBelow = viewportH - triggerRect.bottom - gap - viewportPad;
  const spaceAbove = triggerRect.top - gap - viewportPad;
  const minTotal = searchHeight + minMenuHeight;
  const openUp = spaceBelow < minTotal && spaceAbove > spaceBelow;
  const menuPreferred = openUp
    ? preferredMenuHeightAbove ?? preferredMenuHeight
    : preferredMenuHeight;
  const preferredTotal = searchHeight + menuPreferred;
  const available = openUp ? spaceAbove : spaceBelow;
  const maxTotal = Math.max(minTotal, Math.min(available, preferredTotal));
  const menuMax = Math.max(minMenuHeight, maxTotal - searchHeight);

  return {
    position: 'fixed',
    left,
    width,
    zIndex,
    top: openUp ? 'auto' : triggerRect.bottom + gap,
    bottom: openUp ? viewportH - triggerRect.top + gap : 'auto',
    maxHeight: maxTotal,
    openUp,
    style: {
      '--dropdown-menu-max': `${menuMax}px`,
    },
  };
}
