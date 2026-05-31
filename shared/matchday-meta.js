/** Tab labels and order for tournament stages. */
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

const MATCHDAY_LABELS = {
  md1: 'MD1',
  md2: 'MD2',
  md3: 'MD3',
  round_of_32: '1/16',
  round_of_16: '1/8',
  quarter_final: '1/4',
  semi_final: '1/2',
  third_place: '3-е',
  final: 'Финал',
};

/** Derive display date ranges from kickoff ISO strings (UTC calendar dates). */
function computeMatchdayMeta(matches) {
  const ranges = new Map();
  for (const m of matches) {
    const md = m.matchday;
    const day = m.kickoff.slice(0, 10);
    if (!ranges.has(md)) {
      ranges.set(md, { start: day, end: day });
      continue;
    }
    const range = ranges.get(md);
    if (day < range.start) range.start = day;
    if (day > range.end) range.end = day;
  }

  const meta = {};
  for (const md of MATCHDAY_ORDER) {
    const range = ranges.get(md);
    if (!range) continue;
    meta[md] = { label: MATCHDAY_LABELS[md] || md, ...range };
  }
  return meta;
}

module.exports = {
  MATCHDAY_ORDER,
  MATCHDAY_LABELS,
  computeMatchdayMeta,
};
