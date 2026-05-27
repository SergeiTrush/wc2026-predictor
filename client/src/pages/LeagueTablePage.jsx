import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import AppHeader from '../components/AppHeader';

export default function LeagueTablePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    api.leaderboard(id).then((d) => setLeaderboard(d.leaderboard));
  }, [id]);

  return (
    <div className="app-root">
      <AppHeader active="table" leagueId={id} onOpenMenu={() => navigate(`/league/${id}/settings`)} />
      <div className="page-content">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Игрок</th>
              <th>Очки</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((row, i) => (
              <tr key={row.userId}>
                <td>{i + 1}</td>
                <td>{row.name}</td>
                <td>{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {leaderboard.length === 0 && (
          <p className="empty-hint">Очки появятся после ввода результатов матчей</p>
        )}
      </div>
    </div>
  );
}
