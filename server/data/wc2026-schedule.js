/**
 * FIFA World Cup 2026 group stage — official matchday windows & kickoffs (US Eastern, UTC-4).
 * Source: FIFA / confirmed host schedule (June 2026), ET kickoffs.
 *
 * Columns: home, away, date (YYYY-MM-DD, ET calendar), time (HH:MM ET), group, venue, md
 */

const GROUP = [
  // Matchday 1 — June 11–18 (UTC; late ET games e.g. Uzbekistan–Colombia spill to 18th)
  ['Mexico', 'South Africa', '2026-06-11', '15:00', 'A', 'Mexico City Stadium', 'md1'],
  ['South Korea', 'Czechia', '2026-06-11', '22:00', 'A', 'Estadio Guadalajara', 'md1'],
  ['Canada', 'Bosnia and Herzegovina', '2026-06-12', '15:00', 'B', 'BMO Field', 'md1'],
  ['United States', 'Paraguay', '2026-06-12', '21:00', 'D', 'SoFi Stadium', 'md1'],
  ['Qatar', 'Switzerland', '2026-06-13', '15:00', 'B', "Levi's Stadium", 'md1'],
  ['Brazil', 'Morocco', '2026-06-13', '18:00', 'C', 'MetLife Stadium', 'md1'],
  ['Haiti', 'Scotland', '2026-06-13', '21:00', 'C', 'Gillette Stadium', 'md1'],
  ['Australia', 'Turkey', '2026-06-14', '00:00', 'D', 'BC Place', 'md1'],
  ['Germany', 'Curacao', '2026-06-14', '13:00', 'E', 'NRG Stadium', 'md1'],
  ['Ivory Coast', 'Ecuador', '2026-06-14', '19:00', 'E', 'Lincoln Financial Field', 'md1'],
  ['Netherlands', 'Japan', '2026-06-14', '16:00', 'F', 'AT&T Stadium', 'md1'],
  ['Sweden', 'Tunisia', '2026-06-14', '22:00', 'F', 'Estadio BBVA', 'md1'],
  ['Spain', 'Cape Verde', '2026-06-15', '12:00', 'H', 'Mercedes-Benz Stadium', 'md1'],
  ['Belgium', 'Egypt', '2026-06-15', '15:00', 'G', 'Lumen Field', 'md1'],
  ['Saudi Arabia', 'Uruguay', '2026-06-15', '18:00', 'H', 'Hard Rock Stadium', 'md1'],
  ['Iran', 'New Zealand', '2026-06-15', '21:00', 'G', 'SoFi Stadium', 'md1'],
  ['France', 'Senegal', '2026-06-16', '15:00', 'I', 'MetLife Stadium', 'md1'],
  ['Iraq', 'Norway', '2026-06-16', '18:00', 'I', 'Gillette Stadium', 'md1'],
  ['Argentina', 'Algeria', '2026-06-16', '21:00', 'J', 'Arrowhead Stadium', 'md1'],
  ['Austria', 'Jordan', '2026-06-17', '00:00', 'J', "Levi's Stadium", 'md1'],
  ['Portugal', 'DR Congo', '2026-06-17', '13:00', 'K', 'NRG Stadium', 'md1'],
  ['Uzbekistan', 'Colombia', '2026-06-17', '22:00', 'K', 'Estadio Azteca', 'md1'],
  ['England', 'Croatia', '2026-06-17', '16:00', 'L', 'AT&T Stadium', 'md1'],
  ['Ghana', 'Panama', '2026-06-17', '19:00', 'L', 'BMO Field', 'md1'],

  // Matchday 2 — June 18–23
  ['Czechia', 'South Africa', '2026-06-18', '12:00', 'A', 'Mercedes-Benz Stadium', 'md2'],
  ['Switzerland', 'Bosnia and Herzegovina', '2026-06-18', '15:00', 'B', 'SoFi Stadium', 'md2'],
  ['Canada', 'Qatar', '2026-06-18', '18:00', 'B', 'BC Place', 'md2'],
  ['Mexico', 'South Korea', '2026-06-18', '21:00', 'A', 'Estadio Guadalajara', 'md2'],
  ['United States', 'Australia', '2026-06-19', '15:00', 'D', 'Lumen Field', 'md2'],
  ['Scotland', 'Morocco', '2026-06-19', '18:00', 'C', 'Gillette Stadium', 'md2'],
  ['Brazil', 'Haiti', '2026-06-19', '20:30', 'C', 'Lincoln Financial Field', 'md2'],
  ['Turkey', 'Paraguay', '2026-06-19', '23:00', 'D', "Levi's Stadium", 'md2'],
  ['Germany', 'Ivory Coast', '2026-06-20', '16:00', 'E', 'BMO Field', 'md2'],
  ['Ecuador', 'Curacao', '2026-06-20', '20:00', 'E', 'Arrowhead Stadium', 'md2'],
  ['Netherlands', 'Sweden', '2026-06-20', '13:00', 'F', 'NRG Stadium', 'md2'],
  ['Tunisia', 'Japan', '2026-06-21', '00:00', 'F', 'Estadio BBVA', 'md2'],
  ['Spain', 'Saudi Arabia', '2026-06-21', '12:00', 'H', 'Mercedes-Benz Stadium', 'md2'],
  ['Belgium', 'Iran', '2026-06-21', '15:00', 'G', 'SoFi Stadium', 'md2'],
  ['Uruguay', 'Cape Verde', '2026-06-21', '18:00', 'H', 'Hard Rock Stadium', 'md2'],
  ['New Zealand', 'Egypt', '2026-06-21', '21:00', 'G', 'BC Place', 'md2'],
  ['France', 'Iraq', '2026-06-22', '17:00', 'I', 'Lincoln Financial Field', 'md2'],
  ['Norway', 'Senegal', '2026-06-22', '20:00', 'I', 'MetLife Stadium', 'md2'],
  ['Argentina', 'Austria', '2026-06-22', '13:00', 'J', 'AT&T Stadium', 'md2'],
  ['Jordan', 'Algeria', '2026-06-22', '23:00', 'J', "Levi's Stadium", 'md2'],
  ['Portugal', 'Uzbekistan', '2026-06-23', '13:00', 'K', 'NRG Stadium', 'md2'],
  ['Colombia', 'DR Congo', '2026-06-23', '22:00', 'K', 'Estadio Guadalajara', 'md2'],
  ['England', 'Ghana', '2026-06-23', '16:00', 'L', 'Gillette Stadium', 'md2'],
  ['Panama', 'Croatia', '2026-06-23', '19:00', 'L', 'BMO Field', 'md2'],

  // Matchday 3 — June 24–27
  ['Switzerland', 'Canada', '2026-06-24', '15:00', 'B', 'BC Place', 'md3'],
  ['Bosnia and Herzegovina', 'Qatar', '2026-06-24', '15:00', 'B', 'Lumen Field', 'md3'],
  ['Scotland', 'Brazil', '2026-06-24', '18:00', 'C', 'Hard Rock Stadium', 'md3'],
  ['Morocco', 'Haiti', '2026-06-24', '18:00', 'C', 'Mercedes-Benz Stadium', 'md3'],
  ['Czechia', 'Mexico', '2026-06-24', '21:00', 'A', 'Mexico City Stadium', 'md3'],
  ['South Africa', 'South Korea', '2026-06-24', '21:00', 'A', 'Estadio Monterrey', 'md3'],
  ['Ecuador', 'Germany', '2026-06-25', '16:00', 'E', 'MetLife Stadium', 'md3'],
  ['Curacao', 'Ivory Coast', '2026-06-25', '16:00', 'E', 'Lincoln Financial Field', 'md3'],
  ['Tunisia', 'Netherlands', '2026-06-25', '19:00', 'F', 'AT&T Stadium', 'md3'],
  ['Japan', 'Sweden', '2026-06-25', '19:00', 'F', 'Arrowhead Stadium', 'md3'],
  ['Turkey', 'United States', '2026-06-25', '22:00', 'D', 'SoFi Stadium', 'md3'],
  ['Paraguay', 'Australia', '2026-06-25', '22:00', 'D', "Levi's Stadium", 'md3'],
  ['Norway', 'France', '2026-06-26', '15:00', 'I', 'Gillette Stadium', 'md3'],
  ['Senegal', 'Iraq', '2026-06-26', '15:00', 'I', 'BMO Field', 'md3'],
  ['New Zealand', 'Belgium', '2026-06-26', '23:00', 'G', 'BC Place', 'md3'],
  ['Egypt', 'Iran', '2026-06-26', '23:00', 'G', 'Lumen Field', 'md3'],
  ['Uruguay', 'Spain', '2026-06-26', '20:00', 'H', 'Estadio Guadalajara', 'md3'],
  ['Cape Verde', 'Saudi Arabia', '2026-06-26', '20:00', 'H', 'NRG Stadium', 'md3'],
  ['Panama', 'England', '2026-06-27', '17:00', 'L', 'MetLife Stadium', 'md3'],
  ['Croatia', 'Ghana', '2026-06-27', '17:00', 'L', 'Lincoln Financial Field', 'md3'],
  ['Colombia', 'Portugal', '2026-06-27', '19:30', 'K', 'Hard Rock Stadium', 'md3'],
  ['DR Congo', 'Uzbekistan', '2026-06-27', '19:30', 'K', 'Mercedes-Benz Stadium', 'md3'],
  ['Jordan', 'Argentina', '2026-06-27', '22:00', 'J', 'Arrowhead Stadium', 'md3'],
  ['Algeria', 'Austria', '2026-06-27', '22:00', 'J', 'AT&T Stadium', 'md3'],
];

/** Knockout — ET kickoffs; matchday = stage key for UI tabs */
const KNOCKOUT = [
  ['2nd Group A', '2nd Group B', '2026-06-28', '15:00', 'round_of_32', 'R32 M1', 'SoFi Stadium'],
  ['1st Group E', '3rd place', '2026-06-29', '16:30', 'round_of_32', 'R32 M2', 'Gillette Stadium'],
  ['1st Group F', '2nd Group C', '2026-06-29', '21:00', 'round_of_32', 'R32 M3', 'Estadio BBVA'],
  ['1st Group C', '2nd Group F', '2026-06-29', '13:00', 'round_of_32', 'R32 M4', 'NRG Stadium'],
  ['1st Group I', '3rd place', '2026-06-30', '17:00', 'round_of_32', 'R32 M5', 'MetLife Stadium'],
  ['2nd Group E', '2nd Group I', '2026-06-30', '13:00', 'round_of_32', 'R32 M6', 'AT&T Stadium'],
  ['1st Group A', '3rd place', '2026-06-30', '21:00', 'round_of_32', 'R32 M7', 'Estadio Azteca'],
  ['1st Group L', '3rd place', '2026-07-01', '12:00', 'round_of_32', 'R32 M8', 'Mercedes-Benz Stadium'],
  ['1st Group D', '3rd place', '2026-07-01', '20:00', 'round_of_32', 'R32 M9', "Levi's Stadium"],
  ['1st Group G', '3rd place', '2026-07-01', '16:00', 'round_of_32', 'R32 M10', 'Lumen Field'],
  ['2nd Group K', '2nd Group L', '2026-07-02', '19:00', 'round_of_32', 'R32 M11', 'BMO Field'],
  ['1st Group H', '2nd Group J', '2026-07-02', '15:00', 'round_of_32', 'R32 M12', 'SoFi Stadium'],
  ['1st Group B', '3rd place', '2026-07-02', '23:00', 'round_of_32', 'R32 M13', 'BC Place'],
  ['1st Group J', '2nd Group H', '2026-07-03', '18:00', 'round_of_32', 'R32 M14', 'Hard Rock Stadium'],
  ['1st Group K', '3rd place', '2026-07-03', '21:30', 'round_of_32', 'R32 M15', 'Arrowhead Stadium'],
  ['2nd Group D', '2nd Group G', '2026-07-03', '14:00', 'round_of_32', 'R32 M16', 'AT&T Stadium'],
  ['Winner R32 M1', 'Winner R32 M3', '2026-07-04', '13:00', 'round_of_16', 'R16 M1', 'NRG Stadium'],
  ['Winner R32 M2', 'Winner R32 M5', '2026-07-04', '17:00', 'round_of_16', 'R16 M2', 'Lincoln Financial Field'],
  ['Winner R32 M4', 'Winner R32 M6', '2026-07-05', '16:00', 'round_of_16', 'R16 M3', 'MetLife Stadium'],
  ['Winner R32 M7', 'Winner R32 M8', '2026-07-05', '20:00', 'round_of_16', 'R16 M4', 'Estadio Azteca'],
  ['Winner R32 M11', 'Winner R32 M12', '2026-07-06', '15:00', 'round_of_16', 'R16 M5', 'AT&T Stadium'],
  ['Winner R32 M9', 'Winner R32 M10', '2026-07-06', '20:00', 'round_of_16', 'R16 M6', 'Lumen Field'],
  ['Winner R32 M14', 'Winner R32 M16', '2026-07-07', '12:00', 'round_of_16', 'R16 M7', 'Mercedes-Benz Stadium'],
  ['Winner R32 M13', 'Winner R32 M15', '2026-07-07', '16:00', 'round_of_16', 'R16 M8', 'BC Place'],
  ['Winner R16 M1', 'Winner R16 M2', '2026-07-09', '16:00', 'quarter_final', 'QF1', 'Gillette Stadium'],
  ['Winner R16 M5', 'Winner R16 M6', '2026-07-10', '15:00', 'quarter_final', 'QF2', 'SoFi Stadium'],
  ['Winner R16 M3', 'Winner R16 M4', '2026-07-11', '17:00', 'quarter_final', 'QF3', 'Hard Rock Stadium'],
  ['Winner R16 M7', 'Winner R16 M8', '2026-07-11', '21:00', 'quarter_final', 'QF4', 'Arrowhead Stadium'],
  ['Winner QF1', 'Winner QF2', '2026-07-14', '15:00', 'semi_final', 'SF1', 'AT&T Stadium'],
  ['Winner QF3', 'Winner QF4', '2026-07-15', '15:00', 'semi_final', 'SF2', 'Mercedes-Benz Stadium'],
  ['Loser SF1', 'Loser SF2', '2026-07-18', '16:00', 'third_place', '3rd place', 'Hard Rock Stadium'],
  ['Winner SF1', 'Winner SF2', '2026-07-19', '15:00', 'final', 'Final', 'MetLife Stadium'],
];

const SCHEDULE_VERSION = 'fifa-wc2026-official-v12';

const { buildScheduleKickoffs } = require('../../shared/schedule-kickoffs');
const { computeMatchdayMeta, MATCHDAY_ORDER } = require('../../shared/matchday-meta');

const MATCHDAY_META = computeMatchdayMeta(buildScheduleKickoffs(GROUP, KNOCKOUT));

module.exports = {
  GROUP,
  KNOCKOUT,
  SCHEDULE_VERSION,
  MATCHDAY_ORDER,
  MATCHDAY_META,
};
