import { formatDayMonth } from './utils';

const MATCHDAY_ORDER = [
  'md1',
  'md2',
  'md3',
  'round_of_32',
  'round_of_16',
  'quarter_final',
  'semi_final',
  'third_place',
  'final',
];

const MATCHDAY_META = {
  md1: { label: 'MD1', start: '2026-06-11', end: '2026-06-17' },
  md2: { label: 'MD2', start: '2026-06-18', end: '2026-06-23' },
  md3: { label: 'MD3', start: '2026-06-24', end: '2026-06-27' },
  round_of_32: { label: '1/16', start: '2026-06-28', end: '2026-07-03' },
  round_of_16: { label: '1/8', start: '2026-07-04', end: '2026-07-07' },
  quarter_final: { label: '1/4', start: '2026-07-09', end: '2026-07-11' },
  semi_final: { label: '1/2', start: '2026-07-14', end: '2026-07-15' },
  third_place: { label: '3-е', start: '2026-07-18', end: '2026-07-18' },
  final: { label: 'Финал', start: '2026-07-19', end: '2026-07-19' },
};

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
  return isKnockoutMatchday(day);
}
