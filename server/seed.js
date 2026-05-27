/** World Cup 2026 fixtures (group stage + knockout). Times in US Eastern (EDT, UTC-4). */
function kickoff(isoDate, timeEt) {
  const [h, m] = timeEt.split(':').map(Number);
  const d = new Date(`${isoDate}T00:00:00-04:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const groupMatches = [
  // Group A
  ['Mexico', 'South Africa', '2026-06-11', '15:00', 'A', 'Mexico City Stadium'],
  ['South Korea', 'Czechia', '2026-06-11', '22:00', 'A', 'Estadio Guadalajara'],
  ['Czechia', 'South Africa', '2026-06-18', '12:00', 'A', 'Mercedes-Benz Stadium'],
  ['Mexico', 'South Korea', '2026-06-18', '21:00', 'A', 'Estadio Guadalajara'],
  ['Czechia', 'Mexico', '2026-06-24', '21:00', 'A', 'Mexico City Stadium'],
  ['South Africa', 'South Korea', '2026-06-24', '21:00', 'A', 'Estadio Monterrey'],
  // Group B
  ['Canada', 'Bosnia and Herzegovina', '2026-06-12', '15:00', 'B', 'BMO Field'],
  ['Qatar', 'Switzerland', '2026-06-13', '15:00', 'B', "Levi's Stadium"],
  ['Bosnia and Herzegovina', 'Switzerland', '2026-06-18', '15:00', 'B', 'SoFi Stadium'],
  ['Canada', 'Qatar', '2026-06-18', '18:00', 'B', 'BC Place'],
  ['Switzerland', 'Canada', '2026-06-24', '15:00', 'B', 'BC Place'],
  ['Bosnia and Herzegovina', 'Qatar', '2026-06-24', '15:00', 'B', 'Lumen Field'],
  // Group C
  ['Brazil', 'Morocco', '2026-06-13', '18:00', 'C', 'MetLife Stadium'],
  ['Haiti', 'Scotland', '2026-06-13', '21:00', 'C', 'Gillette Stadium'],
  ['Scotland', 'Morocco', '2026-06-19', '18:00', 'C', 'Lincoln Financial Field'],
  ['Brazil', 'Haiti', '2026-06-19', '21:00', 'C', 'Gillette Stadium'],
  ['Scotland', 'Brazil', '2026-06-24', '18:00', 'C', 'Hard Rock Stadium'],
  ['Morocco', 'Haiti', '2026-06-24', '18:00', 'C', 'Mercedes-Benz Stadium'],
  // Group D
  ['United States', 'Paraguay', '2026-06-12', '21:00', 'D', 'SoFi Stadium'],
  ['Australia', 'Turkey', '2026-06-13', '00:00', 'D', 'BC Place'],
  ['Turkey', 'Paraguay', '2026-06-20', '00:00', 'D', "Levi's Stadium"],
  ['United States', 'Australia', '2026-06-19', '15:00', 'D', 'Lumen Field'],
  ['Turkey', 'United States', '2026-06-25', '22:00', 'D', 'SoFi Stadium'],
  ['Paraguay', 'Australia', '2026-06-25', '22:00', 'D', "Levi's Stadium"],
  // Group E
  ['Germany', 'Curacao', '2026-06-14', '13:00', 'E', 'NRG Stadium'],
  ['Ivory Coast', 'Ecuador', '2026-06-14', '19:00', 'E', 'Lincoln Financial Field'],
  ['Germany', 'Ivory Coast', '2026-06-20', '16:00', 'E', 'BMO Field'],
  ['Ecuador', 'Curacao', '2026-06-20', '20:00', 'E', 'Arrowhead Stadium'],
  ['Ecuador', 'Germany', '2026-06-25', '16:00', 'E', 'MetLife Stadium'],
  ['Curacao', 'Ivory Coast', '2026-06-25', '16:00', 'E', 'Lincoln Financial Field'],
  // Group F
  ['Netherlands', 'Japan', '2026-06-14', '16:00', 'F', 'AT&T Stadium'],
  ['Sweden', 'Tunisia', '2026-06-14', '22:00', 'F', 'Estadio BBVA'],
  ['Tunisia', 'Japan', '2026-06-20', '13:00', 'F', 'Estadio BBVA'],
  ['Netherlands', 'Sweden', '2026-06-20', '00:00', 'F', 'NRG Stadium'],
  ['Tunisia', 'Netherlands', '2026-06-25', '19:00', 'F', 'AT&T Stadium'],
  ['Japan', 'Sweden', '2026-06-25', '19:00', 'F', 'Arrowhead Stadium'],
  // Group G
  ['Belgium', 'Egypt', '2026-06-15', '15:00', 'G', 'SoFi Stadium'],
  ['Iran', 'New Zealand', '2026-06-15', '21:00', 'G', 'Lumen Field'],
  ['Belgium', 'Iran', '2026-06-21', '15:00', 'G', 'SoFi Stadium'],
  ['New Zealand', 'Egypt', '2026-06-21', '21:00', 'G', 'BC Place'],
  ['New Zealand', 'Belgium', '2026-06-26', '20:00', 'G', 'Lumen Field'],
  ['Egypt', 'Iran', '2026-06-26', '20:00', 'G', 'BC Place'],
  // Group H
  ['Spain', 'Cape Verde', '2026-06-15', '12:00', 'H', 'Mercedes-Benz Stadium'],
  ['Saudi Arabia', 'Uruguay', '2026-06-15', '18:00', 'H', 'Hard Rock Stadium'],
  ['Spain', 'Saudi Arabia', '2026-06-21', '12:00', 'H', 'Mercedes-Benz Stadium'],
  ['Uruguay', 'Cape Verde', '2026-06-21', '18:00', 'H', 'Hard Rock Stadium'],
  ['Uruguay', 'Spain', '2026-06-26', '20:00', 'H', 'NRG Stadium'],
  ['Cape Verde', 'Saudi Arabia', '2026-06-26', '20:00', 'H', 'Estadio Akron'],
  // Group I
  ['France', 'Senegal', '2026-06-16', '15:00', 'I', 'MetLife Stadium'],
  ['Iraq', 'Norway', '2026-06-16', '18:00', 'I', 'Gillette Stadium'],
  ['France', 'Iraq', '2026-06-22', '17:00', 'I', 'Lincoln Financial Field'],
  ['Norway', 'Senegal', '2026-06-22', '20:00', 'I', 'MetLife Stadium'],
  ['Norway', 'France', '2026-06-26', '15:00', 'I', 'Gillette Stadium'],
  ['Senegal', 'Iraq', '2026-06-26', '15:00', 'I', 'BMO Field'],
  // Group J
  ['Argentina', 'Algeria', '2026-06-16', '21:00', 'J', 'Arrowhead Stadium'],
  ['Austria', 'Jordan', '2026-06-17', '00:00', 'J', "Levi's Stadium"],
  ['Argentina', 'Austria', '2026-06-22', '13:00', 'J', 'AT&T Stadium'],
  ['Jordan', 'Algeria', '2026-06-22', '23:00', 'J', "Levi's Stadium"],
  ['Jordan', 'Argentina', '2026-06-27', '22:00', 'J', 'Arrowhead Stadium'],
  ['Algeria', 'Austria', '2026-06-27', '22:00', 'J', 'AT&T Stadium'],
  // Group K
  ['Portugal', 'DR Congo', '2026-06-17', '13:00', 'K', 'NRG Stadium'],
  ['Uzbekistan', 'Colombia', '2026-06-17', '22:00', 'K', 'Estadio Azteca'],
  ['Portugal', 'Uzbekistan', '2026-06-23', '13:00', 'K', 'NRG Stadium'],
  ['Colombia', 'DR Congo', '2026-06-23', '22:00', 'K', 'Estadio Akron'],
  ['Colombia', 'Portugal', '2026-06-27', '19:30', 'K', 'Hard Rock Stadium'],
  ['DR Congo', 'Uzbekistan', '2026-06-27', '19:30', 'K', 'Mercedes-Benz Stadium'],
  // Group L
  ['England', 'Croatia', '2026-06-17', '16:00', 'L', 'AT&T Stadium'],
  ['Ghana', 'Panama', '2026-06-17', '19:00', 'L', 'BMO Field'],
  ['England', 'Ghana', '2026-06-23', '16:00', 'L', 'Gillette Stadium'],
  ['Panama', 'Croatia', '2026-06-23', '19:00', 'L', 'BMO Field'],
  ['Panama', 'England', '2026-06-27', '17:00', 'L', 'MetLife Stadium'],
  ['Croatia', 'Ghana', '2026-06-27', '17:00', 'L', 'Lincoln Financial Field'],
];

const knockoutMatches = [
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
  ['Loser SF1', 'Loser SF2', '2026-07-18', '17:00', 'third_place', '3rd place', 'Hard Rock Stadium'],
  ['Winner SF1', 'Winner SF2', '2026-07-19', '15:00', 'final', 'Final', 'MetLife Stadium'],
];

function buildMatches() {
  const rows = [];
  for (const [home, away, date, time, group, venue] of groupMatches) {
    const ko = kickoff(date, time);
    rows.push({
      home_team: home,
      away_team: away,
      kickoff: ko,
      matchday: date,
      stage: 'group',
      group_name: group,
      venue,
      match_label: `Group ${group}`,
    });
  }
  for (const [home, away, date, time, stage, label, venue] of knockoutMatches) {
    const ko = kickoff(date, time);
    rows.push({
      home_team: home,
      away_team: away,
      kickoff: ko,
      matchday: date,
      stage,
      group_name: null,
      venue,
      match_label: label,
    });
  }
  return rows;
}

const { prepare, transaction } = require('./sqlite-helpers');

function seedDatabase(db) {
  const count = prepare(db, 'SELECT COUNT(*) AS n FROM matches').get().n;
  if (count > 0) {
    return { seeded: false, matchCount: count };
  }

  const insert = prepare(
    db,
    `INSERT INTO matches (home_team, away_team, kickoff, matchday, stage, group_name, venue, match_label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const matches = buildMatches();
  transaction(db, () => {
    for (const m of matches) {
      insert.run(
        m.home_team,
        m.away_team,
        m.kickoff,
        m.matchday,
        m.stage,
        m.group_name,
        m.venue,
        m.match_label
      );
    }
  });
  return { seeded: true, matchCount: matches.length };
}

module.exports = { seedDatabase, buildMatches };
