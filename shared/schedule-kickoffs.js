const { kickoffEt } = require('./kickoff');

function buildScheduleKickoffs(GROUP, KNOCKOUT) {
  const rows = [];
  for (const [, , date, time, , , md] of GROUP) {
    rows.push({ matchday: md, kickoff: kickoffEt(date, time) });
  }
  for (const [, , date, time, stage] of KNOCKOUT) {
    rows.push({ matchday: stage, kickoff: kickoffEt(date, time) });
  }
  return rows;
}

module.exports = { buildScheduleKickoffs };
