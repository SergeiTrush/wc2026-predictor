/** Map external API team names → names used in our seed database. */
const ALIASES = {
  'united states': 'United States',
  usa: 'United States',
  'u.s.a.': 'United States',
  'czech republic': 'Czechia',
  czechia: 'Czechia',
  'ivory coast': 'Ivory Coast',
  "cote d'ivoire": 'Ivory Coast',
  'côte d\'ivoire': 'Ivory Coast',
  'dr congo': 'DR Congo',
  'congo dr': 'DR Congo',
  'democratic republic of the congo': 'DR Congo',
  'bosnia-herzegovina': 'Bosnia and Herzegovina',
  'bosnia & herzegovina': 'Bosnia and Herzegovina',
  curaçao: 'Curacao',
  'korea republic': 'South Korea',
  'south korea': 'South Korea',
  'republic of korea': 'South Korea',
  korea: 'South Korea',
  'saudi arabia': 'Saudi Arabia',
  'new zealand': 'New Zealand',
  'cape verde': 'Cape Verde',
  'cabo verde': 'Cape Verde',
  turkiye: 'Turkey',
  türkiye: 'Turkey',
  'ir iran': 'Iran',
  irn: 'Iran',
};

const CANONICAL = new Set([
  'Mexico', 'South Africa', 'South Korea', 'Czechia', 'Canada', 'Bosnia and Herzegovina',
  'Qatar', 'Switzerland', 'Brazil', 'Morocco', 'Haiti', 'Scotland', 'United States', 'Paraguay',
  'Australia', 'Turkey', 'Germany', 'Curacao', 'Ivory Coast', 'Ecuador', 'Netherlands', 'Japan',
  'Sweden', 'Tunisia', 'Belgium', 'Egypt', 'Iran', 'New Zealand', 'Spain', 'Cape Verde',
  'Saudi Arabia', 'Uruguay', 'France', 'Senegal', 'Iraq', 'Norway', 'Argentina', 'Algeria',
  'Austria', 'Jordan', 'Portugal', 'DR Congo', 'Uzbekistan', 'Colombia', 'England', 'Croatia',
  'Ghana', 'Panama',
]);

function normalizeKey(name) {
  return (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function mapApiTeamName(apiName) {
  if (!apiName) return null;
  const key = normalizeKey(apiName);
  if (ALIASES[key]) return ALIASES[key];
  for (const canonical of CANONICAL) {
    if (normalizeKey(canonical) === key) return canonical;
  }
  if (CANONICAL.has(apiName.trim())) return apiName.trim();
  return null;
}

/** Extra Bzzoiro search terms when the canonical DB name does not match the API index. */
const API_SEARCH_NAMES = {
  'United States': ['USA'],
  'Ivory Coast': ["Côte d'Ivoire", 'Cote d Ivoire'],
  Turkey: ['Türkiye', 'Turkiye'],
  'Bosnia and Herzegovina': ['Bosnia-Herzegovina', 'Bosnia & Herzegovina'],
  'Cape Verde': ['Cabo Verde'],
  'South Korea': ['Korea Republic', 'Republic of Korea'],
  Curacao: ['Curaçao'],
  'DR Congo': ['Congo DR', 'Democratic Republic of the Congo'],
  Czechia: ['Czech Republic'],
};

function apiSearchNames(teamName) {
  const trimmed = (teamName || '').trim();
  if (!trimmed) return [];

  const names = new Set([trimmed]);
  const extras = API_SEARCH_NAMES[trimmed];
  if (extras) extras.forEach((n) => names.add(n));

  const key = normalizeKey(trimmed);
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (normalizeKey(canonical) !== key) continue;
    if (alias.length > 2 && alias !== key) {
      const label = alias.replace(/\b\w/g, (c) => c.toUpperCase());
      names.add(label);
    }
  }

  return [...names];
}

module.exports = { mapApiTeamName, normalizeKey, apiSearchNames };
