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

export function formatMatchTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Сегодня, ${time}`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + `, ${time}`;
}

export function boosterLabel(stage) {
  if (stage === 'quarter_final') return '3×';
  if (stage === 'semi_final') return '4×';
  if (stage === 'final') return '5×';
  return '2×';
}
