export default function ScoringModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Как начисляются очки</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="scoring-section">
          <h3>Очки за счёт</h3>
          <div className="scoring-row">
            <span>Исход (победа/ничья/поражение)</span>
            <span>3 оч.</span>
          </div>
          <div className="scoring-row">
            <span>Голы хозяев</span>
            <span>2 оч.</span>
          </div>
          <div className="scoring-row">
            <span>Голы гостей</span>
            <span>2 оч.</span>
          </div>
          <div className="scoring-row">
            <span>Разница в счёте</span>
            <span>3 оч.</span>
          </div>
          <div className="scoring-row">
            <span>Какая команда откроет счёт</span>
            <span>2 оч.</span>
          </div>
          <div className="scoring-row">
            <span>Какой игрок откроет счёт</span>
            <span>8 оч.</span>
          </div>
        </div>

        <div className="scoring-section">
          <h3>Бонусные очки</h3>
          <div className="scoring-row">
            <span>Андердог-бонус</span>
            <span>5 оч.</span>
          </div>
          <p className="scoring-desc">
            Предскажи счёт, который угадали менее 10% участников лиги.
          </p>
          <div className="scoring-row" style={{ marginTop: '0.75rem' }}>
            <span>Бустер · группа / 1/8</span>
            <span>2×</span>
          </div>
          <div className="scoring-row">
            <span>1/4 финала</span>
            <span>3×</span>
          </div>
          <div className="scoring-row">
            <span>1/2 финала</span>
            <span>4×</span>
          </div>
          <div className="scoring-row">
            <span>Финал</span>
            <span>5×</span>
          </div>
          <p className="scoring-desc">
            Один бустер на тур — умножает очки за выбранный матч.
          </p>
        </div>
      </div>
    </div>
  );
}
