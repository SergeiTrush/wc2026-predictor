import { useState, useEffect } from 'react';
import { api } from '../api';
import { teamFlag, formatMatchTime, boosterLabel } from '../utils';

export default function MatchCard({ match, leagueId, onSaved }) {
  const pred = match.prediction;
  const [home, setHome] = useState(pred?.home_pred ?? '');
  const [away, setAway] = useState(pred?.away_pred ?? '');
  const [firstTeam, setFirstTeam] = useState(pred?.first_team ?? '');
  const [firstPlayer, setFirstPlayer] = useState(pred?.first_player ?? '');
  const [booster, setBooster] = useState(!!pred?.booster);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pred) {
      setHome(pred.home_pred);
      setAway(pred.away_pred);
      setFirstTeam(pred.first_team || '');
      setFirstPlayer(pred.first_player || '');
      setBooster(!!pred.booster);
    }
  }, [pred]);

  const locked = match.locked;
  const mult = boosterLabel(match.stage);

  const save = async (overrides = {}) => {
    const h = overrides.homeScore ?? (home === '' ? null : Number(home));
    const a = overrides.awayScore ?? (away === '' ? null : Number(away));
    if (h == null || a == null || Number.isNaN(h) || Number.isNaN(a)) return;
    setSaving(true);
    try {
      await api.savePrediction({
        matchId: match.id,
        homeScore: h,
        awayScore: a,
        firstTeam: overrides.firstTeam ?? (firstTeam || null),
        firstPlayer: overrides.firstPlayer ?? (firstPlayer || null),
        booster: overrides.booster !== undefined ? overrides.booster : booster,
      });
      onSaved?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const applyPopular = (score) => {
    const [h, a] = score.split(':').map(Number);
    setHome(h);
    setAway(a);
    save({ homeScore: h, awayScore: a });
  };

  const toggleBooster = () => {
    const next = !booster;
    setBooster(next);
    if (home !== '' && away !== '') save({ booster: next });
  };

  const friends = match.friendsPredicted || 0;
  const footerText =
    friends === 0
      ? 'Будь первым — сделай прогноз!'
      : `${friends} ${friends === 1 ? 'друг сделал' : friends < 5 ? 'друга сделали' : 'друзей сделали'} прогнозы`;

  return (
    <article className="match-card">
      <div className="match-card-header">
        <span>{formatMatchTime(match.kickoff)}</span>
        <span>{match.group_name ? `Группа ${match.group_name}` : match.match_label}</span>
      </div>

      <div className="match-teams">
        <div className="team-col">
          <div className="team-flag">{teamFlag(match.home_team)}</div>
          <div className="team-name">{match.home_team}</div>
        </div>
        <div className="score-boxes">
          <input
            type="number"
            min="0"
            max="15"
            className="score-box"
            value={locked && match.home_score != null ? match.home_score : home}
            onChange={(e) => setHome(e.target.value)}
            onBlur={() => !locked && save()}
            disabled={locked}
          />
          <span className="score-sep">:</span>
          <input
            type="number"
            min="0"
            max="15"
            className="score-box"
            value={locked && match.away_score != null ? match.away_score : away}
            onChange={(e) => setAway(e.target.value)}
            onBlur={() => !locked && save()}
            disabled={locked}
          />
        </div>
        <div className="team-col">
          <div className="team-flag">{teamFlag(match.away_team)}</div>
          <div className="team-name">{match.away_team}</div>
        </div>
      </div>

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
            onChange={(e) => {
              setFirstTeam(e.target.value);
              if (home !== '' && away !== '') save({ firstTeam: e.target.value });
            }}
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
            onBlur={() => !locked && home !== '' && away !== '' && save()}
            disabled={locked}
          />
        </div>
        <div
          className={`extra-row booster-row ${booster ? 'booster-active' : ''}`}
          onClick={() => !locked && toggleBooster()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && !locked && toggleBooster()}
        >
          <span>Переставить бустер {mult}</span>
          <span>{booster ? `✓ ${mult} активен` : '+'}</span>
        </div>
      </div>

      <div className="match-card-footer">{saving ? 'Сохранение…' : footerText}</div>
    </article>
  );
}
