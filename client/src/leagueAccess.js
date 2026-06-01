/** Guard against applying stale async results after league id / deps change. */
export function createEffectGuard() {
  let cancelled = false;
  return {
    isActive: () => !cancelled,
    cancel: () => {
      cancelled = true;
    },
  };
}

/** Redirect home when API denies league access (e.g. suspended member). */
export function redirectIfLeagueForbidden(err, navigate) {
  if (err?.sessionExpired || err?.status === 401) return false;
  if (err?.status === 403) {
    navigate('/', { state: { leagueError: err.message }, replace: true });
    return true;
  }
  return false;
}
