/** Ensures only one points breakdown panel is open at a time. */
let activeClose = null;

export function openPointsTooltip(close) {
  if (activeClose && activeClose !== close) {
    activeClose();
  }
  activeClose = close;
}

export function closePointsTooltip(close) {
  if (activeClose === close) {
    activeClose = null;
  }
}
