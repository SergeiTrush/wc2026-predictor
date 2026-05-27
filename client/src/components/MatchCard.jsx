import { useState, useEffect } from 'react';
import { api } from '../api';
import { teamFlag, formatMatchTime, boosterLabel } from '../utils';

export default function MatchCard({ match, leagueId, onSaved }) {
  const pred = match.prediction;
  const [home, setHome] = useState(pred?.home_pred?.toString() ?? '');
  const [away, setAway] = useState(pred?.away_pred?.toString() ?? '');
  const [firstTeam, setFirstTeam] = useState(pred?.first_team ?? '');
  const [firstPlayer, setFirstPlayer] = useState(pred?.first_player ?? '');
  const [booster, setBooster] = useState(!!pred?.booster);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (pred) {
      setHome(pred.home_pred?.toString() ?? '');
      setAway(pred.away_pred?.toString() ?? '');
      setFirstTeam(pred.first_team || '');
      setFirstPlayer(pred.first_player || '');
      setBooster(!!pred.booster);
    }
  }, [pred?.home_pred, pred?.away_pred, pred?.first_team, pred?.first_player, pred?.booster]);

  const locked = match.locked;
  const mult = boosterLabel(match.stage);

  const save = async (overrides = {}) => {
    if (locked) return;
    const h = overrides.homeScore ?? (home === '' ? null : parseInt(home, 10));
    const a = overrides.awayScore ?? (away === '' ? null : parseInt(away, 10));
    if (h == null || a == null || Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) {
      return;
    }
    setSaving(true);
    setSaved(false);
    try {
      await api.savePrediction({
        matchId: match.id,
        leagueId: leagueId ? Number(leagueId) : undefined,
        homeScore: h,
        awayScore: a,
        firstTeam: overrides.firstTeam ?? (firstTeam || null),
        firstPlayer: overrides.firstPlayer ?? (firstPlayer || null),
        booster: overrides.booster !== undefined ? overrides.booster : booster,
      });
      setSaved(true);
      onSaved?.();
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const applyPopular = (score) => {
    const [h, a] = score.split(':').map((n) => n.trim());
    setHome(h);
    setAway(a);
    save({ homeScore: parseInt(h, 10), awayScore: parseInt(a, 10) });
  };

  const toggleBooster = async () => {
    if (locked) return;
    const next = !booster;
    setBooster(next);
    if (home !== '' && away !== '') {
      await save({ booster: next });
    }
  };

  const onScoreChange = (side, raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    if (side === 'home') setHome(digits);
    else setAway(digits);
  };

  const friends = match.friendsPredicted || 0;
  const footerText = locked
    ? 'Прогнозы закрыты'
    : saved
      ? '✓ Сохранено'
      : saving
        ? 'Сохранение…'
        : friends === 0
          ? 'Будь первым — сделай прогноз!'
          : `${friends} ${friends === 1 ? 'друг сделал' : friends < 5 ? 'друга сделали' : 'друзей сделали'} прогнозы`;

  const canSave = !locked && home !== '' && away !== '';

  return (
    <article className="match-card">
      <div className="match-card-header">
        <span>{formatMatchTime(match.kickoff)}</span>
        <span>
          {locked && <span className="locked-badge">🔒 </span>}
          {match.group_name ? `Группа ${match.group_name}` : match.match_label}
        </span>
      </div>

      <div className="match-teams">
        <div className="team-col">
          <div className="team-flag">{teamFlag(match.home_team)}</div>
          <div className="team-name">{match.home_team}</div>
        </div>
        <div className="score-boxes">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="score-box"
            value={locked && match.home_score != null ? String(match.home_score) : home}
            onChange={(e) => onScoreChange('home', e.target.value)}
            readOnly={locked}
            aria-label={`Счёт ${match.home_team}`}
          />
          <span className="score-sep">:</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="score-box"
            value={locked && match.away_score != null ? String(match.away_score) : away}
            onChange={(e) => onScoreChange('away', e.target.value)}
            readOnly={locked}
            aria-label={`Счёт ${match.away_team}`}
          />
        </div>
        <div className="team-col">
          <div className="team-flag">{teamFlag(match.away_team)}</div>
          <div className="team-name">{match.away_team}</div>
        </div>
      </div>

      {!locked && (
        <div style={{ padding: '0 1rem 0.5rem', textAlign: 'center' }}>
          <button
            type="button"
            className="btn-save-prediction"
            disabled={!canSave || saving}
            onClick={() => save()}
          >
            Сохранить прогноз
          </button>
        </div>
      )}

      {match.popularPredictions?.length > 0 && (
        <div className="popular-section">
          <div className="popular-title">Популярные прогнозы</div>
          <div className="popular-chips">
            {match.popularPredictions.map((p) => (
              <button
                key={p.score}
                type="button"
                className="popular-chip"
                onClick={() => !locked && applyPopular(p.score)}
                disabled={locked}
              >
                {p.score} ({p.percent}%)
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="extra-predictions">
        <div className="extra-row">
          <span>Какая команда откроет счёт</span>
          <select
            value={firstTeam}
            onChange={(e) => setFirstTeam(e.target.value)}
            disabled={locked}
          >
            <option value="">—</option>
            <option value="home">{match.home_team}</option>
            <option value="away">{match.away_team}</option>
            <option value="none">Никто / 0:0</option>
          </select>
        </div>
        <div className="extra-row">
          <span>Какой игрок откроет счёт</span>
          <input
            type="text"
            placeholder="Фамилия"
            value={firstPlayer}
            onChange={(e) => setFirstPlayer(e.target.value)}
            disabled={locked}
          />
        </div>
        <div
          className={`extra-row booster-row ${booster ? 'booster-active' : ''}`}
          onClick={() => toggleBooster()}
          role="button"
          tabIndex={locked ? -1 : 0}
          onKeyDown={(e) => e.key === 'Enter' && toggleBooster()}
        >
          <span>Переставить бустер {mult}</span>
          <span>{booster ? `✓ ${mult} активен` : '+'}</span>
        </div>
      </div>

      <div className="match-card-footer">{footerText}</div>
    </article>
  );
}
