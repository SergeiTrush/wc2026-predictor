import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { teamFlag } from '../utils';
import AppHeader from '../components/AppHeader';

export default function LeagueGroupsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [groups, setGroups] = useState({});

  useEffect(() => {
    api.matches({ stage: 'group' }).then((d) => {
      const map = {};
      for (const m of d.matches) {
        if (!map[m.group_name]) map[m.group_name] = new Set();
        map[m.group_name].add(m.home_team);
        map[m.group_name].add(m.away_team);
      }
      const sorted = {};
      'ABCDEFGHIJKL'.split('').forEach((g) => {
        if (map[g]) sorted[g] = [...map[g]].sort();
      });
      setGroups(sorted);
    });
  }, []);

  return (
    <div className="app-root">
      <AppHeader active="groups" leagueId={id} onOpenMenu={() => navigate(`/league/${id}/settings`)} />
      <div className="page-content groups-grid">
        {Object.entries(groups).map(([g, teams]) => (
          <div key={g} className="group-card">
            <h3>Группа {g}</h3>
            {teams.map((t) => (
              <div key={t} className="group-team">
                {teamFlag(t)} {t}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
