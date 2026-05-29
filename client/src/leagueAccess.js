/** Redirect home when API denies league access (e.g. suspended member). */
export function redirectIfLeagueForbidden(err, navigate) {
  if (err?.status === 403) {
    navigate('/', { state: { leagueError: err.message }, replace: true });
    return true;
  }
  return false;
}
