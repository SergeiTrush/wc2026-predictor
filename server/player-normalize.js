function extractSurname(fullName) {
  const parts = (fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '';
  const last = parts[parts.length - 1];
  if (last.length <= 2 && parts.length >= 2) return parts[parts.length - 2];
  return last;
}

function playerDedupeKey(p) {
  if (p.id != null) return `id:${p.id}`;
  return `name:${p.surname.toLowerCase()}`;
}

function normalizePlayers(rawPlayers) {
  const seen = new Set();
  const unique = [];

  for (const raw of rawPlayers) {
    const p = {
      id: raw.id,
      name: raw.name,
      surname: extractSurname(raw.name),
      number: raw.number ?? null,
      position: raw.position ?? null,
    };
    if (!p.surname) continue;

    const key = playerDedupeKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
  }

  return unique.sort((a, b) => a.surname.localeCompare(b.surname, 'ru'));
}

function toPlayer({ id, name, number, position }) {
  return {
    id: id ?? null,
    name: name || '',
    number: number != null && number !== '' ? Number(number) : null,
    position: position ?? null,
  };
}

module.exports = { extractSurname, normalizePlayers, toPlayer };
