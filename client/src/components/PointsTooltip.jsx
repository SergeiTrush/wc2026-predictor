import { useState, useRef, useEffect } from 'react';
import PointsBreakdownPanel from './PointsBreakdownPanel';

export default function PointsTooltip({ pointsDetail, provisional = false }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

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
    <div className={`points-tooltip-wrap${provisional ? ' points-tooltip-wrap--live' : ''}`} ref={wrapRef}>
      <span className="points-badge">
        {provisional ? '~' : ''}+{total} оч.
      </span>
      <button
        type="button"
        className="points-info-btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Как начислены очки"
        aria-expanded={open}
      >
        i
      </button>
      {open && (
        <PointsBreakdownPanel
          pointsDetail={pointsDetail}
          className="points-tooltip"
          provisional={provisional}
        />
      )}
    </div>
  );
}
