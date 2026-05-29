import { useEffect, useState } from 'react';
import { api } from '../api';

export function useLeagueOwner(leagueId) {
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    if (!leagueId) return;
    api
      .league(leagueId)
      .then((d) => setIsOwner(Boolean(Number(d.league?.is_owner))))
      .catch(() => setIsOwner(false));
  }, [leagueId]);

  return isOwner;
}
