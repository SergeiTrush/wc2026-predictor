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

export function matchHasResult(match) {
  return match?.home_score != null && match?.away_score != null;
}

/** Same condition as showing `.live-score-bar` / `.live-score-pending` on the match card. */
export function isMatchLiveScoreBarVisible(match) {
  if (!match) return false;
  const hasResult = match.hasResult ?? matchHasResult(match);
  return hasResult || !!match.locked;
}

/** @deprecated use isMatchLiveScoreBarVisible */
export const isMatchStarted = isMatchLiveScoreBarVisible;

/** Match kickoff in US Eastern (host schedule), shown to the user. */
export function formatMatchTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const datePart = d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'America/New_York',
  });
  const timePart = d.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
  const nowEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const matchEt = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  if (matchEt === nowEt) return `Сегодня, ${timePart}`;
  return `${datePart}, ${timePart}`;
}

export function boosterLabel(stage) {
  if (stage === 'quarter_final') return '3×';
  if (stage === 'semi_final') return '4×';
  if (stage === 'final') return '5×';
  return '2×';
}
