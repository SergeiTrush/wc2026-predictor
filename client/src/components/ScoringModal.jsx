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
          <h3>Bracket Challenge (FIFA)</h3>
          <div className="scoring-row">
            <span>1-е место в группе</span>
            <span>5 оч.</span>
          </div>
          <div className="scoring-row">
            <span>2-е место в группе</span>
            <span>3 оч.</span>
          </div>
          <div className="scoring-row">
            <span>Победитель 1/16</span>
            <span>3 оч.</span>
          </div>
          <div className="scoring-row">
            <span>Победитель 1/8</span>
            <span>5 оч.</span>
          </div>
          <div className="scoring-row">
            <span>Четвертьфинал</span>
            <span>8 оч.</span>
          </div>
          <div className="scoring-row">
            <span>Полуфинал</span>
            <span>13 оч.</span>
          </div>
          <div className="scoring-row">
            <span>Финал + чемпион</span>
            <span>25 + 50 оч.</span>
          </div>
        </div>

        <div className="scoring-section">
          <h3>Прогнозы матчей (Euro Predictor)</h3>
          <div className="scoring-row">
            <span>Исход</span>
            <span>3 оч.</span>
          </div>
          <div className="scoring-row">
            <span>Голы хозяев / гостей</span>
            <span>2 + 2 оч.</span>
          </div>
          <div className="scoring-row">
            <span>Разница в счёте</span>
            <span>3 оч.</span>
          </div>
          <div className="scoring-row">
            <span>Команда / игрок откроет счёт</span>
            <span>2 / 8 оч.</span>
          </div>
          <div className="scoring-row">
            <span>Андердог-бонус</span>
            <span>5 оч.</span>
          </div>
          <div className="scoring-row">
            <span>Бустер на тур</span>
            <span>2×–5×</span>
          </div>
        </div>
      </div>
    </div>
  );
}
