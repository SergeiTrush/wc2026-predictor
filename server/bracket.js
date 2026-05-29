const { GROUPS, GROUP_KEYS } = require('./data/groups');
const { KNOCKOUT_TREE, R32_THIRD_SLOTS, ROUND_ORDER, ROUND_LABELS } = require('./data/knockout-bracket');

function emptyBracketPicks() {
  return {
    groups: {},
    advancingThirds: [],
    thirdSlotTeams: {},
    winners: {},
    champion: null,
  };
}

function resolveSlot(slot, groups, thirdSlotTeams) {
  if (!slot) return null;
  if (slot === '3RD') return null;
  const m = slot.match(/^([124])?([A-L])$/);
  if (!m) return null;
  const pos = m[1] ? Number(m[1]) - 1 : 0;
  const g = m[2];
  const order = groups[g];
  if (!order || !order[pos]) return null;
  return order[pos];
}

function resolveThirdForMatch(match, thirdSlotTeams) {
  if (!match.thirdSlot) return null;
  return thirdSlotTeams[match.thirdSlot] || null;
}

function buildResolvedBracket(picks) {
  const groups = picks.groups || {};
  const thirdSlotTeams = picks.thirdSlotTeams || {};
  const winners = picks.winners || {};

  const resolved = {};
  for (const m of KNOCKOUT_TREE) {
    let home = m.home;
    let away = m.away;

    if (home && home.startsWith('W:')) {
      home = winners[home.slice(2)] || null;
    } else if (home === '3RD') {
      home = resolveThirdForMatch(m, thirdSlotTeams);
    } else {
      home = resolveSlot(home, groups, thirdSlotTeams);
    }

    if (away && away.startsWith('W:')) {
      away = winners[away.slice(2)] || null;
    } else if (away === '3RD') {
      away = resolveThirdForMatch(m, thirdSlotTeams);
    } else {
      away = resolveSlot(away, groups, thirdSlotTeams);
    }

    if (!m.home && !m.away) {
      const feeders = KNOCKOUT_TREE.filter((x) => x.next === m.id);
      const homeFeed = feeders.find((x) => x.nextSide === 'home');
      const awayFeed = feeders.find((x) => x.nextSide === 'away');
      home = homeFeed ? winners[homeFeed.id] || null : null;
      away = awayFeed ? winners[awayFeed.id] || null : null;
    }

    resolved[m.id] = {
      ...m,
      homeTeam: home,
      awayTeam: away,
      winner: winners[m.id] || null,
      label: ROUND_LABELS[m.round],
    };
  }

  return resolved;
}

function validateGroupPicks(groups) {
  const errors = [];
  for (const g of GROUP_KEYS) {
    const order = groups[g];
    if (!order || order.length !== 4) {
      errors.push(`Группа ${g}: укажите порядок всех 4 команд`);
      continue;
    }
    const expected = new Set(GROUPS[g]);
    const got = new Set(order);
    if (expected.size !== got.size || [...expected].some((t) => !got.has(t))) {
      errors.push(`Группа ${g}: неверный состав команд`);
    }
  }
  return errors;
}

function validateBracketPicks(picks) {
  const errors = validateGroupPicks(picks.groups || {});
  const advancing = picks.advancingThirds || [];
  if (advancing.length !== 8) {
    errors.push('Выберите ровно 8 лучших третьих мест (как в формате ЧМ-2026)');
  }
  const thirdSlots = picks.thirdSlotTeams || {};
  for (const slot of R32_THIRD_SLOTS) {
    if (!thirdSlots[slot]) errors.push(`Назначьте команду для слота ${slot}`);
  }
  const resolved = buildResolvedBracket(picks);
  for (const m of KNOCKOUT_TREE) {
    const r = resolved[m.id];
    if (!r.homeTeam || !r.awayTeam) continue;
    if (!picks.winners[m.id]) {
      errors.push(`Выберите победителя: ${m.id}`);
    } else {
      const w = picks.winners[m.id];
      if (w !== r.homeTeam && w !== r.awayTeam) {
        errors.push(`Неверный победитель ${m.id}`);
      }
    }
  }
  if (!picks.champion) errors.push('Выберите чемпиона');
  return errors;
}

function bracketPoints(userPicks, actual) {
  let pts = 0;
  if (!actual) return pts;
  for (const g of GROUP_KEYS) {
    const u = userPicks.groups?.[g] || [];
    const a = actual.groups?.[g] || [];
    for (let i = 0; i < 4; i++) {
      if (u[i] && u[i] === a[i]) pts += i === 0 ? 5 : i === 1 ? 3 : 0;
    }
  }
  const koPoints = { r32: 3, r16: 5, qf: 8, sf: 13, final: 25 };
  for (const m of KNOCKOUT_TREE) {
    if (userPicks.winners?.[m.id] && userPicks.winners[m.id] === actual.winners?.[m.id]) {
      pts += koPoints[m.round] || 3;
    }
  }
  if (userPicks.champion && userPicks.champion === actual.champion) pts += 50;
  return pts;
}

module.exports = {
  GROUPS,
  GROUP_KEYS,
  KNOCKOUT_TREE,
  R32_THIRD_SLOTS,
  ROUND_ORDER,
  ROUND_LABELS,
  emptyBracketPicks,
  buildResolvedBracket,
  validateBracketPicks,
  validateGroupPicks,
  bracketPoints,
};
