import { resolveFirstTeamDisplay, resolveFirstPlayerDisplay } from '../predictionExtras';

function ExtraPick({ label, pick }) {
  return (
    <div className={`friends-prediction-extra${pick.empty ? ' friends-prediction-extra--empty' : ''}`}>
      <span className="friends-prediction-extra-label">{label}</span>
      <span className="friends-prediction-extra-value" title={pick.label}>
        {pick.flag ? (
          <span className="friends-prediction-extra-flag" aria-hidden="true">
            {pick.flag}
          </span>
        ) : null}
        <span className="friends-prediction-extra-text">{pick.label}</span>
      </span>
    </div>
  );
}

export default function FriendsPredictionExtras({ firstTeam, firstPlayer, homeTeam, awayTeam, squadPlayers }) {
  const teamPick = resolveFirstTeamDisplay(firstTeam, homeTeam, awayTeam);
  const playerPick = resolveFirstPlayerDisplay(firstPlayer, squadPlayers);

  if (teamPick.empty && playerPick.empty) {
    return null;
  }

  return (
    <div className="friends-prediction-extras">
      <ExtraPick label="Команда, открывшая счет" pick={teamPick} />
      <ExtraPick label="Игрок, открывший счет" pick={playerPick} />
    </div>
  );
}
