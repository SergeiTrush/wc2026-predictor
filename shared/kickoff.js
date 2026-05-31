/** Kickoff in US Eastern (EDT, UTC−4) for June–July 2026. */
function kickoffEt(date, timeEt) {
  const [h, m] = timeEt.split(':').map(Number);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return new Date(`${date}T${hh}:${mm}:00-04:00`).toISOString();
}

module.exports = { kickoffEt };
