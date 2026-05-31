/** Map schedule match_label → stable bracket slot id (matches knockout-bracket.js). */

const MATCH_LABEL_TO_SLOT = {
  'R32 M1': 'R32-M1',
  'R32 M2': 'R32-M2',
  'R32 M3': 'R32-M3',
  'R32 M4': 'R32-M4',
  'R32 M5': 'R32-M5',
  'R32 M6': 'R32-M6',
  'R32 M7': 'R32-M7',
  'R32 M8': 'R32-M8',
  'R32 M9': 'R32-M9',
  'R32 M10': 'R32-M10',
  'R32 M11': 'R32-M11',
  'R32 M12': 'R32-M12',
  'R32 M13': 'R32-M13',
  'R32 M14': 'R32-M14',
  'R32 M15': 'R32-M15',
  'R32 M16': 'R32-M16',
  'R16 M1': 'R16-M1',
  'R16 M2': 'R16-M2',
  'R16 M3': 'R16-M3',
  'R16 M4': 'R16-M4',
  'R16 M5': 'R16-M5',
  'R16 M6': 'R16-M6',
  'R16 M7': 'R16-M7',
  'R16 M8': 'R16-M8',
  QF1: 'QF1',
  QF2: 'QF2',
  QF3: 'QF3',
  QF4: 'QF4',
  SF1: 'SF1',
  SF2: 'SF2',
  '3rd place': 'THIRD',
  Final: 'FINAL',
};

/** FIFA winner slot → R32 match with a third-placed opponent. */
const FIFA_THIRD_WINNER_SLOT_TO_R32 = {
  '1A': 'R32-M7',
  '1B': 'R32-M13',
  '1D': 'R32-M9',
  '1E': 'R32-M2',
  '1G': 'R32-M10',
  '1I': 'R32-M5',
  '1K': 'R32-M15',
  '1L': 'R32-M8',
};

const PLACEHOLDER_RE =
  /^(?:\d+(?:st|nd) Group [A-L]|Winner .+|Loser SF[12]|3rd place)$/i;

function matchLabelToBracketSlot(matchLabel) {
  if (!matchLabel) return null;
  return MATCH_LABEL_TO_SLOT[matchLabel.trim()] || null;
}

function isPlaceholderTeam(name) {
  if (!name || typeof name !== 'string') return true;
  return PLACEHOLDER_RE.test(name.trim());
}

function isKnockoutStage(stage) {
  return stage && stage !== 'group';
}

module.exports = {
  MATCH_LABEL_TO_SLOT,
  FIFA_THIRD_WINNER_SLOT_TO_R32,
  matchLabelToBracketSlot,
  isPlaceholderTeam,
  isKnockoutStage,
};
