import { useState } from 'react';
import { api } from '../api';

function formatKickoff(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MatchCard({ match, onSaved, canSetResult }) {
  const pred = match.prediction;
  const [home, setHome] = useState(pred?.home_pred ?? '');
  const [away, setAway] = useState(pred?.away_pred ?? '');
  const [saving, setSaving] = useState(false);
  const [resultHome, setResultHome] = useState(match.home_score ?? '');
  const [resultAway, setResultAway] = useState(match.away_score ?? '');

  const locked = match.locked;
  const hasResult = match.home_score != null;

  const savePrediction = async () => {
    if (home === '' || away === '') return;
    setSaving(true);
    try {
      await api.savePrediction(match.id, Number(home), Number(away));
      onSaved?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const saveResult = async () => {
    if (resultHome === '' || resultAway === '') return;
    try {
      await api.setResult(match.id, Number(resultHome), Number(resultAway));
      onSaved?.();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className={`card match-card ${locked ? 'locked' : ''}`}>
      <div className="match-meta">
        <span>
          {match.match_label}
          {match.group_name ? ` · Group ${match.group_name}` : ''}
        </span>
        <span>{formatKickoff(match.kickoff)}</span>
      </div>
      <div className="team home">{match.home_team}</div>
      <div className="score-inputs">
        <input
          type="number"
          min="0"
          max="20"
          value={locked && hasResult ? match.home_score : home}
          onChange={(e) => setHome(e.target.value)}
          disabled={locked}
          aria-label={`${match.home_team} prediction`}
        />
        <span className="score-sep">:</span>
        <input
          type="number"
          min="0"
          max="20"
          value={locked && hasResult ? match.away_score : away}
          onChange={(e) => setAway(e.target.value)}
          disabled={locked}
          aria-label={`${match.away_team} prediction`}
        />
      </div>
      <div className="team away">{match.away_team}</div>
      {match.venue && (
        <p style={{ gridColumn: '1 / -1', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {match.venue}
        </p>
      )}
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {!locked && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={savePrediction}
            disabled={saving || home === '' || away === ''}
          >
            {saving ? 'Saving…' : pred ? 'Update pick' : 'Save pick'}
          </button>
        )}
        {locked && hasResult && <span className="result-badge">Final</span>}
        {locked && !hasResult && (
          <span className="result-badge" style={{ color: 'var(--text-muted)' }}>
            Locked
          </span>
        )}
        {canSetResult && !hasResult && (
          <>
            <input
              type="number"
              min="0"
              className="btn-sm"
              style={{ width: '2.5rem', padding: '0.3rem' }}
              value={resultHome}
              onChange={(e) => setResultHome(e.target.value)}
              placeholder="H"
              title="Actual home score"
            />
            <input
              type="number"
              min="0"
              style={{ width: '2.5rem', padding: '0.3rem' }}
              value={resultAway}
              onChange={(e) => setResultAway(e.target.value)}
              placeholder="A"
              title="Actual away score"
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={saveResult}>
              Set result
            </button>
          </>
        )}
      </div>
    </div>
  );
}
