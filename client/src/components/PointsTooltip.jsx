import { useState, useRef, useEffect, useCallback } from 'react';
import PointsBreakdownPanel from './PointsBreakdownPanel';
import { openPointsTooltip, closePointsTooltip } from '../pointsTooltipRegistry';

export default function PointsTooltip({ pointsDetail, provisional = false, variant = 'dropdown' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const inline = variant === 'inline';

  const closeSelf = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) {
      closePointsTooltip(closeSelf);
    }
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

  return (
    <div
      className={`points-tooltip-wrap${provisional ? ' points-tooltip-wrap--live' : ''}${
        inline ? ' points-tooltip-wrap--inline' : ''
      }`}
      ref={wrapRef}
    >
      <span className="points-badge">
        {provisional ? '~' : ''}+{total} оч.
      </span>
      <button
        type="button"
        className="points-info-btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((wasOpen) => {
            const next = !wasOpen;
            if (next) openPointsTooltip(closeSelf);
            return next;
          });
        }}
        aria-label="Как начислены очки"
        aria-expanded={open}
      >
        i
      </button>
      {open && (
        <PointsBreakdownPanel
          pointsDetail={pointsDetail}
          className={inline ? 'points-breakdown-inline' : 'points-tooltip'}
          provisional={provisional}
        />
      )}
    </div>
  );
}
