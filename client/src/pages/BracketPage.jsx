import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import { useLeagueOwner } from '../hooks/useLeagueOwner';
import ModalOverlay from '../components/ModalOverlay';
import ScoringModal from '../components/ScoringModal';
import { teamFlag } from '../utils';

const GROUP_KEYS = 'ABCDEFGHIJKL'.split('');
const ROUND_ORDER = ['r32', 'r16', 'qf', 'sf', 'final'];

export default function BracketPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [groups, setGroups] = useState({});
  const [picks, setPicks] = useState({
    groups: {},
    advancingThirds: [],
    thirdSlotTeams: {},
    winners: {},
    champion: null,
  });
  const [resolved, setResolved] = useState([]);
  const [step, setStep] = useState('groups');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showScoring, setShowScoring] = useState(false);
  const [error, setError] = useState('');
  const isOwner = useLeagueOwner(id);

  const load = useCallback(() => {
    api
      .getBracket(id)
      .then((d) => {
        setGroups(d.groups);
        setPicks(d.picks);
        setResolved(d.resolved || []);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (nextPicks, strict = false) => {
    setSaving(true);
    setError('');
    try {
      const data = await api.saveBracket(id, nextPicks, strict);
      setPicks(data.picks);
      setResolved(data.resolved || []);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const setGroupPosition = (g, position, team) => {
    const order = [...(picks.groups[g] || Array(4).fill(null))];
    for (let i = 0; i < 4; i++) {
      if (order[i] === team) order[i] = null;
    }
    order[position] = team;
    const next = { ...picks, groups: { ...picks.groups, [g]: order } };
    setPicks(next);
    if (order.every(Boolean)) save(next);
  };

  const toggleThird = (team) => {
    const cur = [...(picks.advancingThirds || [])];
    const idx = cur.indexOf(team);
    if (idx >= 0) cur.splice(idx, 1);
    else if (cur.length < 8) cur.push(team);
    else return;
    const thirdSlotTeams = {};
    R32_THIRD_SLOTS.forEach((slot, i) => {
      thirdSlotTeams[slot] = cur[i];
    });
    const next = { ...picks, advancingThirds: cur, thirdSlotTeams };
    setPicks(next);
    save(next);
  };

  const pickWinner = (matchId, team, round) => {
    const winners = { ...picks.winners, [matchId]: team };
    const next = { ...picks, winners };
    if (round === 'final') next.champion = team;
    setPicks(next);
    save(next);
  };

  const thirdPlaceTeams = GROUP_KEYS.map((g) => picks.groups[g]?.[2]).filter(Boolean);

  const matchesByRound = ROUND_ORDER.reduce((acc, r) => {
    acc[r] = resolved.filter((m) => m.round === r);
    return acc;
  }, {});

  return (
    <div className="app-root">
      <AppHeader active="bracket" leagueId={id} />

      <div className="bracket-hero">
        <h2>Bracket Challenge</h2>
        <p>Как на FIFA Play Zone — заполни группы и плей-офф до чемпиона</p>
      </div>

      <div className="step-tabs">
        {[
          ['groups', '1. Группы'],
          ['third', '2. 3-е места'],
          ['knockout', '3. Плей-офф'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`step-tab ${step === key ? 'active' : ''}`}
            onClick={() => setStep(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="error-banner" style={{ margin: '0.75rem' }}>{error}</div>}
      {saved && <div className="save-toast">✓ Сохранено</div>}

      <div className="page-content">
        {step === 'groups' && (
          <div className="groups-bracket-grid">
            {GROUP_KEYS.map((g) => (
              <div key={g} className="group-pick-card">
                <h3>Группа {g}</h3>
                {[0, 1, 2, 3].map((pos) => (
                  <div key={pos} className="group-pick-row">
                    <span className="pos-label">{pos + 1}-е место</span>
                    <select
                      value={picks.groups[g]?.[pos] || ''}
                      onChange={(e) => setGroupPosition(g, pos, e.target.value)}
                    >
                      <option value="">Выбрать…</option>
                      {(groups[g] || []).map((team) => (
                        <option key={team} value={team}>
                          {team}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {step === 'third' && (
          <div>
            <p className="hint-block">
              Выбери 8 лучших команд с 3-го места (формат ЧМ-2026: 12 групп → 8 проходят в
              1/16).
            </p>
            <p className="hint-block">
              Выбрано: {(picks.advancingThirds || []).length} / 8
            </p>
            <div className="third-pick-grid">
              {thirdPlaceTeams.map((team) => (
                <button
                  key={team}
                  type="button"
                  className={`third-pick-btn ${
                    (picks.advancingThirds || []).includes(team) ? 'selected' : ''
                  }`}
                  onClick={() => toggleThird(team)}
                >
                  {teamFlag(team)} {team}
                </button>
              ))}
            </div>
            {thirdPlaceTeams.length < 12 && (
              <p className="empty-hint">Сначала расставь 3-е места во всех группах</p>
            )}
          </div>
        )}

        {step === 'knockout' && (
          <div>
            {ROUND_ORDER.map((round) => (
              <div key={round} className="knockout-round">
                <h3 className="round-title">
                  {matchesByRound[round]?.[0]?.label || round}
                </h3>
                {(matchesByRound[round] || []).map((m) => (
                  <div key={m.id} className="knockout-match">
                    <div className="knockout-match-label">{m.id}</div>
                    <div className="knockout-teams">
                      <button
                        type="button"
                        className={`knockout-team ${
                          picks.winners[m.id] === m.homeTeam ? 'picked' : ''
                        }`}
                        disabled={!m.homeTeam}
                        onClick={() => m.homeTeam && pickWinner(m.id, m.homeTeam, m.round)}
                      >
                        {m.homeTeam ? `${teamFlag(m.homeTeam)} ${m.homeTeam}` : 'TBD'}
                      </button>
                      <span className="knockout-vs">vs</span>
                      <button
                        type="button"
                        className={`knockout-team ${
                          picks.winners[m.id] === m.awayTeam ? 'picked' : ''
                        }`}
                        disabled={!m.awayTeam}
                        onClick={() => m.awayTeam && pickWinner(m.id, m.awayTeam, m.round)}
                      >
                        {m.awayTeam ? `${teamFlag(m.awayTeam)} ${m.awayTeam}` : 'TBD'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {picks.champion && (
              <div className="champion-banner">🏆 Чемпион: {picks.champion}</div>
            )}
          </div>
        )}
      </div>

      <div className="bracket-footer-bar">
        <button
          type="button"
          className="btn-primary"
          disabled={saving}
          onClick={() => save(picks, true)}
        >
          {saving ? 'Сохранение…' : 'Сохранить весь брекет'}
        </button>
      </div>

      {menuOpen && (
        <ModalOverlay onClick={() => setMenuOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Меню</h2>
              <button type="button" className="modal-close" onClick={() => setMenuOpen(false)}>
                ×
              </button>
            </div>
            <button
              type="button"
              className="btn-primary"
              style={{ marginBottom: '0.5rem' }}
              onClick={() => {
                setMenuOpen(false);
                navigate(`/league/${id}/matches`);
              }}
            >
              Прогнозы матчей (счёт)
            </button>
            <button
              type="button"
              className="btn-primary"
              style={{ marginBottom: '0.5rem', background: 'var(--card-blue-light)' }}
              onClick={() => {
                setMenuOpen(false);
                setShowScoring(true);
              }}
            >
              Как начисляются очки
            </button>
            {isOwner && (
              <button
                type="button"
                className="btn-primary btn-menu-owner"
                onClick={() => {
                  setMenuOpen(false);
                  navigate(`/league/${id}/settings`);
                }}
              >
                Настройки лиги
              </button>
            )}
          </div>
        </ModalOverlay>
      )}

      {showScoring && <ScoringModal onClose={() => setShowScoring(false)} />}
    </div>
  );
}

const R32_THIRD_SLOTS = [
  'R32-M2',
  'R32-M5',
  'R32-M7',
  'R32-M8',
  'R32-M9',
  'R32-M10',
  'R32-M13',
  'R32-M15',
];
