import { formatDayMonth } from './utils';
import { MATCHDAY_ORDER, MATCHDAY_META } from './generated-matchday-meta.js';

export function matchdayKey(match) {
  return match.matchday || match.kickoff?.slice(0, 10) || '';
}

function matchdaySortIndex(day) {
  const i = MATCHDAY_ORDER.indexOf(day);
  return i === -1 ? 999 : i;
}

export function formatMatchdayTabDate(day) {
  const meta = MATCHDAY_META[day];
  if (!meta) return formatDayMonth(day);
  if (meta.start === meta.end) return formatDayMonth(meta.start);
  const [, sm, sd] = meta.start.split('-').map(Number);
  const [, em] = meta.end.split('-').map(Number);
  if (sm === em) {
    return `${sd} – ${formatDayMonth(meta.end)}`;
  }
  return `${formatDayMonth(meta.start)} – ${formatDayMonth(meta.end)}`;
}

const CALENDAR_MATCHDAY = /^\d{4}-\d{2}-\d{2}$/;

export function matchdaysFromMatches(matches) {
  const dayMap = new Map();
  for (const m of matches) {
    let day = matchdayKey(m);
    if (CALENDAR_MATCHDAY.test(day)) continue;
    if (!day) continue;
    if (!dayMap.has(day)) {
      const meta = MATCHDAY_META[day] || {};
      dayMap.set(day, {
        day,
        label: meta.label || day,
        count: 0,
        predicted: 0,
      });
    }
    const entry = dayMap.get(day);
    entry.count += 1;
    if (m.prediction?.home_pred != null && m.prediction?.away_pred != null) {
      entry.predicted += 1;
    }
  }
  return [...dayMap.values()].sort((a, b) => matchdaySortIndex(a.day) - matchdaySortIndex(b.day));
}

export function filterMatchesByDay(matches, day) {
  if (!day) return matches;
  return matches.filter((m) => matchdayKey(m) === day);
}

export function pickDefaultMatchday(days) {
  if (!days.length) return null;
  const now = new Date().toISOString().slice(0, 10);
  for (const d of days) {
    const meta = MATCHDAY_META[d.day];
    if (meta?.end && meta.end >= now) return d;
  }
  return days[days.length - 1];
}

export const KNOCKOUT_MATCHDAYS = [
  'round_of_32',
  'round_of_16',
  'quarter_final',
  'semi_final',
  'third_place',
  'final',
];

export function isKnockoutMatchday(day) {
  return KNOCKOUT_MATCHDAYS.includes(day);
}

export function isKnockoutMatch(match) {
  const day = match.matchday || match.stage || '';
  if (isKnockoutMatchday(day)) return true;
  if (match.stage && match.stage !== 'group') return true;
  const kick = match.kickoff?.slice(0, 10);
  if (!kick) return false;
  return KNOCKOUT_MATCHDAYS.some((d) => {
    const meta = MATCHDAY_META[d];
    return meta && kick >= meta.start && kick <= meta.end;
  });
}

/** Regulation-time scoring rule (shown in «Как начисляются очки»). */
export const KNOCKOUT_SCORE_HINT =
  'Счёт после 90 минут (доп. время и пенальти не учитываются)';
