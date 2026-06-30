import { enrichScoringActual } from './scoring';

const FLAGS = {
  Mexico: '🇲🇽',
  'South Africa': '🇿🇦',
  'South Korea': '🇰🇷',
  Czechia: '🇨🇿',
  Canada: '🇨🇦',
  'Bosnia and Herzegovina': '🇧🇦',
  Qatar: '🇶🇦',
  Switzerland: '🇨🇭',
  Brazil: '🇧🇷',
  Morocco: '🇲🇦',
  Haiti: '🇭🇹',
  Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'United States': '🇺🇸',
  Paraguay: '🇵🇾',
  Australia: '🇦🇺',
  Turkey: '🇹🇷',
  Germany: '🇩🇪',
  Curacao: '🇨🇼',
  'Ivory Coast': '🇨🇮',
  Ecuador: '🇪🇨',
  Netherlands: '🇳🇱',
  Japan: '🇯🇵',
  Sweden: '🇸🇪',
  Tunisia: '🇹🇳',
  Belgium: '🇧🇪',
  Egypt: '🇪🇬',
  Iran: '🇮🇷',
  'New Zealand': '🇳🇿',
  Spain: '🇪🇸',
  'Cape Verde': '🇨🇻',
  'Saudi Arabia': '🇸🇦',
  Uruguay: '🇺🇾',
  France: '🇫🇷',
  Senegal: '🇸🇳',
  Iraq: '🇮🇶',
  Norway: '🇳🇴',
  Argentina: '🇦🇷',
  Algeria: '🇩🇿',
  Austria: '🇦🇹',
  Jordan: '🇯🇴',
  Portugal: '🇵🇹',
  'DR Congo': '🇨🇩',
  Uzbekistan: '🇺🇿',
  Colombia: '🇨🇴',
  England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  Croatia: '🇭🇷',
  Ghana: '🇬🇭',
  Panama: '🇵🇦',
};

export function teamFlag(name) {
  return FLAGS[name] || '⚽';
}

function parseLocalDay(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00`);
  }
  return new Date(value);
}

/** e.g. 11 июня, 1 июля (full month, not июн. / июл.) */
export function formatDayMonth(value) {
  return parseLocalDay(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
}

export function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function matchIsFinished(match) {
  if (match?.hasResult === true) return true;
  if (match?.isFinished === true || match?.isFinished === 1 || match?.isFinished === '1') {
    return true;
  }
  if (match?.is_finished != null) {
    return Number(match.is_finished) === 1;
  }
  return false;
}

export function matchHasStoredScore(match) {
  return match?.home_score != null && match?.away_score != null;
}

export function matchHasResult(match) {
  if (match?.hasResult != null) return !!match.hasResult;
  return matchIsFinished(match) && matchHasStoredScore(match);
}

export function liveScoreIsFinished(liveScore) {
  if (!liveScore) return false;
  const status = String(liveScore.status || '').toLowerCase();
  return ['finished', 'ended', 'ft', 'fulltime', 'full_time'].includes(status);
}

export function matchIsLive(match) {
  if (matchHasResult(match)) return false;
  if (liveScoreIsFinished(match?.liveScore)) return false;
  if (match?.isLive != null) return !!match.isLive;
  if (matchHasLiveManualScore(match)) return true;
  const ls = match?.liveScore;
  return !!(ls?.isLive && ls?.homeScore != null && ls?.awayScore != null);
}

/** Started match that is still in play — uses /api/matches isLive + hasResult. */
export function isMatchOnLiveTab(match) {
  if (matchIsFinished(match)) return false;
  if (new Date(match.kickoff).getTime() > Date.now()) return false;
  return matchIsLive(match);
}

export function matchHasLiveManualScore(match) {
  return matchHasStoredScore(match) && !matchIsFinished(match);
}

export function matchHasLiveScore(match) {
  const ls = match?.liveScore;
  if (ls?.homeScore != null && ls?.awayScore != null) return true;
  return matchHasLiveManualScore(match);
}

/** Active in-play feed (BZZoiro or manual DB fallback when no feed). */
export function hasActiveLiveFeed(liveScore) {
  if (!liveScore || liveScoreIsFinished(liveScore)) return false;
  return liveScore.homeScore != null && liveScore.awayScore != null;
}

/** Score shown on the live bar — prefer live feed over stale DB when both exist. */
export function liveBarScoreText(match) {
  if (matchHasResult(match)) {
    return `${match.home_score} : ${match.away_score}`;
  }
  const ls = match?.liveScore;
  if (hasActiveLiveFeed(ls)) {
    return `${ls.homeScore} : ${ls.awayScore}`;
  }
  if (matchHasLiveManualScore(match)) {
    return `${match.home_score} : ${match.away_score}`;
  }
  return null;
}

/** Actual used for provisional points while match is in play. */
export function provisionalScoringActual(match, squadPlayers = null) {
  if (matchHasResult(match)) return enrichScoringActual(match, {}, squadPlayers);
  const ls = match?.liveScore;
  if (hasActiveLiveFeed(ls)) {
    const live = scoringActualFromLive(match, ls);
    if (live) {
      return enrichScoringActual(
        match,
        { home_score: live.home_score, away_score: live.away_score },
        squadPlayers
      );
    }
  }
  if (matchHasLiveManualScore(match)) return enrichScoringActual(match, {}, squadPlayers);
  return null;
}

/** Knockout live score helpers — regulation time (90 min) vs current aggregate. */

export function isLiveExtraTime(liveScore) {
  if (!liveScore) return false;
  const status = liveScore.status;
  if (status === 'extra_time' || status === 'extratime' || status === 'penalties') return true;
  return liveScore.minute != null && liveScore.minute > 90;
}

export function regulationScoresFromLive(liveScore) {
  if (!liveScore) return null;
  if (liveScore.regulationHomeScore != null && liveScore.regulationAwayScore != null) {
    return { home: liveScore.regulationHomeScore, away: liveScore.regulationAwayScore };
  }
  return null;
}

function storedRegulationScores(match) {
  if (!match) return null;
  if (match.home_score != null && match.away_score != null) {
    return { home: Number(match.home_score), away: Number(match.away_score) };
  }
  return null;
}

/** Current aggregate on the live bar (includes extra-time goals). */
export function liveBarDisplayScore(match, liveScore) {
  if (!liveScore || liveScore.homeScore == null || liveScore.awayScore == null) return null;
  return { home: liveScore.homeScore, away: liveScore.awayScore };
}

/** 90-minute score for fantasy points (knockout ET / penalties use frozen regulation). */
export function regulationScoreForPoints(match, liveScore) {
  if (!liveScore) return null;
  if (isKnockoutMatch(match) && isLiveExtraTime(liveScore)) {
    const reg = regulationScoresFromLive(liveScore) ?? storedRegulationScores(match);
    if (reg) return reg;
  }
  return liveBarDisplayScore(match, liveScore);
}

export function scoringActualFromLive(match, liveScore) {
  const display = regulationScoreForPoints(match, liveScore);
  if (!display) return null;
  return {
    home_score: Number(display.home),
    away_score: Number(display.away),
    first_scorer_team: match.first_scorer_team ?? null,
    first_scorer_player: match.first_scorer_player ?? null,
    first_scorer_player_team: match.first_scorer_player_team ?? null,
    first_scorer_is_own_goal: match.first_scorer_is_own_goal ?? null,
    home_team: match.home_team,
    away_team: match.away_team,
    stage: match.stage,
  };
}

function isKnockoutMatch(match) {
  if (!match) return false;
  if (match.stage && match.stage !== 'group') return true;
  const day = match.matchday || '';
  return ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final'].includes(day);
}

/** Admin Results page: stored score or live feed score. */
export function adminMatchScores(match) {
  if (matchHasStoredScore(match)) {
    return {
      home: match.home_score,
      away: match.away_score,
      finalHome: match.final_home_score,
      finalAway: match.final_away_score,
      stored: true,
    };
  }
  const ls = match?.liveScore;
  if (ls?.homeScore != null && ls?.awayScore != null) {
    const reg = regulationScoreForPoints(match, ls);
    const current = liveBarDisplayScore(match, ls);
    if (reg && current && isKnockoutMatch(match) && isLiveExtraTime(ls)) {
      return {
        home: reg.home,
        away: reg.away,
        finalHome: current.home,
        finalAway: current.away,
        stored: false,
      };
    }
    if (reg) return { home: reg.home, away: reg.away, stored: false };
  }
  return null;
}

export function matchHasAdminResult(match) {
  return adminMatchScores(match) != null;
}

/** Match kicked off but final result not in DB yet — may have live score feed. */
export function isMatchInPlayWindow(match) {
  if (!match || matchHasResult(match)) return false;
  const kickoff = new Date(match.kickoff).getTime();
  return !Number.isNaN(kickoff) && kickoff <= Date.now();
}

/** Same condition as showing `.live-score-bar` / `.live-score-pending` on the match card. */
export function isMatchLiveScoreBarVisible(match) {
  if (!match) return false;
  const hasResult = match.hasResult ?? matchHasResult(match);
  return hasResult || !!match.locked || matchHasLiveScore(match);
}

/** @deprecated use isMatchLiveScoreBarVisible */
export const isMatchStarted = isMatchLiveScoreBarVisible;

/** Match kickoff in the user's local timezone. */
export function formatMatchTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const datePart = d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
  const timePart = d.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const nowLocal = new Date().toLocaleDateString('en-CA');
  const matchLocal = d.toLocaleDateString('en-CA');
  if (matchLocal === nowLocal) return `Сегодня, ${timePart}`;
  return `${datePart}, ${timePart}`;
}

export function boosterLabel(stage) {
  if (stage === 'semi_final' || stage === 'third_place' || stage === 'final') return '3×';
  return '2×';
}
