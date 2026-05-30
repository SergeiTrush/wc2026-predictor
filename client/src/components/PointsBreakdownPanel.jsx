export default function PointsBreakdownPanel({ pointsDetail, className = '', provisional = false }) {
  if (!pointsDetail) return null;

  const { lines, total } = pointsDetail;

  return (
    <div className={`points-breakdown-panel ${className}`.trim()}>
      <div className="points-breakdown-title">
        {provisional ? 'Очки по текущему счёту' : 'Как начислены очки'}
      </div>
      {provisional && (
        <p className="points-breakdown-live-note">Счёт может измениться до финального свистка</p>
      )}
      {lines.length === 0 ? (
        <p className="points-breakdown-empty">Ни одна категория не совпала</p>
      ) : (
        <ul className="points-breakdown-list">
          {lines.map((line) => (
            <li key={line.label}>
              <span>{line.label}</span>
              <span>+{line.points}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="points-breakdown-total">Итого: {total} оч.</div>
    </div>
  );
}
