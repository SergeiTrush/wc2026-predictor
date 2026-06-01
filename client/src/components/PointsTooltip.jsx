import { useState, useRef, useEffect, useCallback } from 'react';
import PointsBreakdownPanel from './PointsBreakdownPanel';
import { openPointsTooltip, closePointsTooltip } from '../pointsTooltipRegistry';

export default function PointsTooltip({
  pointsDetail,
  provisional = false,
  variant = 'dropdown',
  wrapRef: wrapRefProp = null,
  detachPanel = false,
  onOpenChange,
}) {
  const [open, setOpen] = useState(false);
  const localWrapRef = useRef(null);
  const wrapRef = wrapRefProp || localWrapRef;
  const inline = variant === 'inline';

  const closeSelf = useCallback(() => setOpen(false), []);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      closePointsTooltip(closeSelf);
      return;
    }
    openPointsTooltip(closeSelf);
  }, [open, closeSelf]);

  useEffect(() => () => closePointsTooltip(closeSelf), [closeSelf]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  if (!pointsDetail) return null;

  const { total } = pointsDetail;

  const controls = (
    <div className="points-tooltip-controls">
      <span className="points-badge">
        {provisional ? '~' : ''}+{total} оч.
      </span>
      <button
        type="button"
        className="points-info-btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((wasOpen) => !wasOpen);
        }}
        aria-label="Как начислены очки"
        aria-expanded={open}
      >
        i
      </button>
    </div>
  );

  const panel = open ? (
    <PointsBreakdownPanel
      pointsDetail={pointsDetail}
      className={inline ? 'points-breakdown-inline friends-prediction-breakdown' : 'points-tooltip'}
      provisional={provisional}
    />
  ) : null;

  if (inline) {
    return (
      <div
        className={`points-tooltip-wrap points-tooltip-wrap--inline${
          provisional ? ' points-tooltip-wrap--live' : ''
        }`}
      >
        {controls}
        {!detachPanel && panel}
      </div>
    );
  }

  return (
    <div
      className={`points-tooltip-wrap${provisional ? ' points-tooltip-wrap--live' : ''}`}
      ref={wrapRef}
    >
      {controls}
      {panel}
    </div>
  );
}
