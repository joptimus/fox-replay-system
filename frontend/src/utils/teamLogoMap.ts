const TEAM_LOGO_FILES: [string[], string][] = [
  [['alpine'], 'alpine_small_white.avif'],
  [['aston martin', 'aston_martin', 'astonmartin'], 'astonmartin_small_white.avif'],
  [['audi'], 'audi_small_white.avif'],
  [['cadillac'], 'cadillac_small_white.avif'],
  [['ferrari'], 'ferrari_small_white.avif'],
  [['haas'], 'haasf1team_small_white.avif'],
  [['sauber', 'kick sauber', 'kick_sauber', 'kicksauber'], 'kicksauber_small_white.avif'],
  [['mclaren'], 'mclaren_small_white.avif'],
  [['mercedes'], 'mercedes_small_white.avif'],
  [['racing bulls', 'racing_bulls', 'racingbulls', 'rb', 'alphatauri', 'toro rosso'], 'racingbulls_small_white.avif'],
  [['red bull', 'red_bull', 'redbull', 'red bull racing'], 'redbullracing_small_white.avif'],
  [['williams'], 'williams_small_white.avif'],
];

export const getTeamLogoPath = (teamName?: string): string | null => {
  if (!teamName) return null;
  const lower = teamName.toLowerCase();

  for (const [keys, file] of TEAM_LOGO_FILES) {
    for (const key of keys) {
      if (lower.includes(key)) {
        return `/images/team-logos/${file}`;
      }
    }
  }
  return null;
};
