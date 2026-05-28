import { breakdownMatchPoints } from '../scoring.js';

const EXAMPLE_PRED = {
  home_pred: 2,
  away_pred: 1,
  first_team: 'home',
  first_player: 'Lozano',
  booster: 1,
};

const EXAMPLE_ACTUAL = {
  home_score: 2,
  away_score: 1,
  first_scorer_team: 'home',
  first_scorer_player: 'Lozano',
  stage: 'group',
};

function ExampleRow({ label, points, highlight }) {
  return (
    <div className={`scoring-row ${highlight ? 'scoring-row-total' : ''}`}>
      <span>{label}</span>
      <span>{points > 0 ? `+${points}` : '0'} оч.</span>
    </div>
  );
}

export default function ScoringModal({ onClose }) {
  const b = breakdownMatchPoints(EXAMPLE_PRED, EXAMPLE_ACTUAL);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Как начисляются очки</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <p className="scoring-intro">
          Как в Euro Match Predictor: очки за категории складываются. Бустер умножает сумму за матч
          (без андердога).
        </p>

        <div className="scoring-section">
          <h3>Счёт матча</h3>
          <div className="scoring-row">
            <span>Исход (победа / ничья)</span>
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
        </div>

        <div className="scoring-section">
          <h3>Дополнительно</h3>
          <div className="scoring-row">
            <span>Команда, открывшая счёт</span>
            <span>2 оч.</span>
          </div>
          <div className="scoring-row">
            <span>Игрок, открывший счёт</span>
            <span>8 оч.</span>
          </div>
          <div className="scoring-row">
            <span>Андердог (редкий прогноз в лиге)</span>
            <span>5 оч.</span>
          </div>
        </div>

        <div className="scoring-section">
          <h3>Бустер</h3>
          <p className="scoring-note">
            Один бустер на тур (день матчей). Умножает очки за выбранный матч:
          </p>
          <div className="scoring-row">
            <span>Группа / 1/16 / 1/8</span>
            <span>×2</span>
          </div>
          <div className="scoring-row">
            <span>Четвертьфинал</span>
            <span>×3</span>
          </div>
          <div className="scoring-row">
            <span>Полуфинал</span>
            <span>×4</span>
          </div>
          <div className="scoring-row">
            <span>Финал</span>
            <span>×5</span>
          </div>
        </div>

        <div className="scoring-section scoring-example">
          <h3>Пример расчёта</h3>
          <p className="scoring-note">
            Прогноз <strong>2:1</strong>, факт <strong>2:1</strong>, первая команда и игрок угаданы,
            бустер на матч (группа ×2):
          </p>
          <ExampleRow label="Исход" points={b.outcome} />
          <ExampleRow label="Голы хозяев" points={b.homeGoals} />
          <ExampleRow label="Голы гостей" points={b.awayGoals} />
          <ExampleRow label="Разница" points={b.goalDifference} />
          <ExampleRow label="Команда открыла счёт" points={b.firstTeam} />
          <ExampleRow label="Игрок открыл счёт" points={b.firstPlayer} />
          <ExampleRow label={`Подытог ×${b.boosterMultiplier} (бустер)`} points={b.afterBooster} highlight />
          <ExampleRow label="Итого за матч" points={b.total} highlight />
        </div>
      </div>
    </div>
  );
}
