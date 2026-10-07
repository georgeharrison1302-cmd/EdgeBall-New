/** Canonical API-Football media CDN URLs. */
export function playerPhotoUrl(playerId: number | null | undefined) {
  if (playerId == null || !Number.isInteger(playerId) || playerId <= 0) return null;
  return `https://media.api-sports.io/football/players/${playerId}.png`;
}

export function teamLogoUrl(teamId: number | null | undefined) {
  if (teamId == null || !Number.isInteger(teamId) || teamId <= 0) return null;
  return `https://media.api-sports.io/football/teams/${teamId}.png`;
}

export function leagueLogoUrl(leagueId: number | null | undefined) {
  if (leagueId == null || !Number.isInteger(leagueId) || leagueId <= 0) return null;
  return `https://media.api-sports.io/football/leagues/${leagueId}.png`;
}
