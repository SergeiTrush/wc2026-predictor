/**
 * Knockout tree aligned with FIFA WC 2026 schedule.
 * Slot codes: 1A/2A = group winner/runner-up; 3RD = auto from user's 8 advancing 3rd-place teams.
 */
const R32_THIRD_SLOTS = ['R32-M2', 'R32-M5', 'R32-M7', 'R32-M8', 'R32-M9', 'R32-M10', 'R32-M13', 'R32-M15'];

const KNOCKOUT_TREE = [
  { id: 'R32-M1', round: 'r32', home: '2A', away: '2B', next: 'R16-M1', nextSide: 'home' },
  { id: 'R32-M2', round: 'r32', home: '1E', away: '3RD', thirdSlot: 'R32-M2', next: 'R16-M2', nextSide: 'home' },
  { id: 'R32-M3', round: 'r32', home: '1F', away: '2C', next: 'R16-M1', nextSide: 'away' },
  { id: 'R32-M4', round: 'r32', home: '1C', away: '2F', next: 'R16-M3', nextSide: 'home' },
  { id: 'R32-M5', round: 'r32', home: '1I', away: '3RD', thirdSlot: 'R32-M5', next: 'R16-M2', nextSide: 'away' },
  { id: 'R32-M6', round: 'r32', home: '2E', away: '2I', next: 'R16-M3', nextSide: 'away' },
  { id: 'R32-M7', round: 'r32', home: '1A', away: '3RD', thirdSlot: 'R32-M7', next: 'R16-M4', nextSide: 'home' },
  { id: 'R32-M8', round: 'r32', home: '1L', away: '3RD', thirdSlot: 'R32-M8', next: 'R16-M4', nextSide: 'away' },
  { id: 'R32-M9', round: 'r32', home: '1D', away: '3RD', thirdSlot: 'R32-M9', next: 'R16-M6', nextSide: 'home' },
  { id: 'R32-M10', round: 'r32', home: '1G', away: '3RD', thirdSlot: 'R32-M10', next: 'R16-M6', nextSide: 'away' },
  { id: 'R32-M11', round: 'r32', home: '2K', away: '2L', next: 'R16-M5', nextSide: 'home' },
  { id: 'R32-M12', round: 'r32', home: '1H', away: '2J', next: 'R16-M5', nextSide: 'away' },
  { id: 'R32-M13', round: 'r32', home: '1B', away: '3RD', thirdSlot: 'R32-M13', next: 'R16-M8', nextSide: 'home' },
  { id: 'R32-M14', round: 'r32', home: '1J', away: '2H', next: 'R16-M7', nextSide: 'home' },
  { id: 'R32-M15', round: 'r32', home: '1K', away: '3RD', thirdSlot: 'R32-M15', next: 'R16-M8', nextSide: 'away' },
  { id: 'R32-M16', round: 'r32', home: '2D', away: '2G', next: 'R16-M7', nextSide: 'away' },

  { id: 'R16-M1', round: 'r16', home: null, away: null, next: 'QF1', nextSide: 'home' },
  { id: 'R16-M2', round: 'r16', home: null, away: null, next: 'QF1', nextSide: 'away' },
  { id: 'R16-M3', round: 'r16', home: null, away: null, next: 'QF3', nextSide: 'home' },
  { id: 'R16-M4', round: 'r16', home: null, away: null, next: 'QF3', nextSide: 'away' },
  { id: 'R16-M5', round: 'r16', home: null, away: null, next: 'QF2', nextSide: 'home' },
  { id: 'R16-M6', round: 'r16', home: null, away: null, next: 'QF2', nextSide: 'away' },
  { id: 'R16-M7', round: 'r16', home: null, away: null, next: 'QF4', nextSide: 'home' },
  { id: 'R16-M8', round: 'r16', home: null, away: null, next: 'QF4', nextSide: 'away' },

  { id: 'QF1', round: 'qf', home: null, away: null, next: 'SF1', nextSide: 'home' },
  { id: 'QF2', round: 'qf', home: null, away: null, next: 'SF1', nextSide: 'away' },
  { id: 'QF3', round: 'qf', home: null, away: null, next: 'SF2', nextSide: 'home' },
  { id: 'QF4', round: 'qf', home: null, away: null, next: 'SF2', nextSide: 'away' },

  { id: 'SF1', round: 'sf', home: null, away: null, next: 'FINAL', nextSide: 'home' },
  { id: 'SF2', round: 'sf', home: null, away: null, next: 'FINAL', nextSide: 'away' },

  { id: 'FINAL', round: 'final', home: null, away: null, next: null },
];

const ROUND_ORDER = ['r32', 'r16', 'qf', 'sf', 'final'];
const ROUND_LABELS = {
  r32: '1/16 финала',
  r16: '1/8 финала',
  qf: 'Четвертьфинал',
  sf: 'Полуфинал',
  final: 'Финал',
};

module.exports = { KNOCKOUT_TREE, R32_THIRD_SLOTS, ROUND_ORDER, ROUND_LABELS };
