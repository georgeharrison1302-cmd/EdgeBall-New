import type { ApiFootballLeague } from "./endpoints";

export const TARGET_SEASON_FROM = 2021;
export const TARGET_SEASON_TO = 2026;
export const TARGET_SEASON_DEPTH = TARGET_SEASON_TO - TARGET_SEASON_FROM + 1;

export const PREMIER_LEAGUE_ID = 39;
export const CHAMPIONS_LEAGUE_ID = 2;
export const LA_LIGA_ID = 140;

export const TARGET_LEAGUE_IDS = [
  39, 40, 45, 48, 41, 42, 43, 179, 180, 2, 3, 848, 140, 143, 135, 137, 78, 61,
  203, 88, 94, 144, 218, 103, 113, 119, 207, 197, 106, 210, 235, 333, 141, 136,
  79, 62, 253, 262, 71, 13, 11, 128, 307, 15, 7, 35, 9, 6, 36, 4, 960, 5, 32,
  34, 29, 31, 30, 33, 37,
] as const;

export const TARGET_LEAGUE_ID_SET = new Set<number>(TARGET_LEAGUE_IDS);

export function isTargetLeagueId(id: number) {
  return TARGET_LEAGUE_ID_SET.has(id);
}

export type TargetCompetition = {
  name: string;
  country: string;
  aliases?: string[];
};

export const TARGET_COMPETITIONS: TargetCompetition[] = [
  { name: "Premier League", country: "England" },
  { name: "Championship", country: "England" },
  { name: "FA Cup", country: "England" },
  {
    name: "League Cup",
    country: "England",
    aliases: ["Carabao Cup", "EFL Cup"],
  },
  { name: "League One", country: "England" },
  { name: "League Two", country: "England" },
  { name: "Premiership", country: "Scotland", aliases: ["Scottish Premiership"] },
  {
    name: "Championship",
    country: "Scotland",
    aliases: ["Scottish Championship"],
  },
  { name: "National League", country: "England" },
  {
    name: "UEFA Champions League",
    country: "World",
    aliases: ["Champions League"],
  },
  {
    name: "UEFA Europa League",
    country: "World",
    aliases: ["Europa League"],
  },
  {
    name: "UEFA Europa Conference League",
    country: "World",
    aliases: ["Europa Conference League"],
  },
  { name: "La Liga", country: "Spain" },
  { name: "Copa Del Rey", country: "Spain", aliases: ["Copa del Rey"] },
  { name: "Serie A", country: "Italy" },
  { name: "Coppa Italia", country: "Italy" },
  { name: "Bundesliga", country: "Germany" },
  { name: "Ligue 1", country: "France" },
  { name: "Süper Lig", country: "Turkey", aliases: ["Super Lig"] },
  { name: "Eredivisie", country: "Netherlands" },
  {
    name: "Primeira Liga",
    country: "Portugal",
    aliases: ["Liga Portugal"],
  },
  {
    name: "Jupiler Pro League",
    country: "Belgium",
    aliases: ["Belgian Pro League", "Pro League"],
  },
  { name: "Bundesliga", country: "Austria", aliases: ["Austrian Bundesliga"] },
  { name: "Eliteserien", country: "Norway" },
  { name: "Allsvenskan", country: "Sweden" },
  { name: "Superliga", country: "Denmark" },
  { name: "Super League", country: "Switzerland" },
  {
    name: "Super League 1",
    country: "Greece",
    aliases: ["Super League", "Greek Super League"],
  },
  { name: "Ekstraklasa", country: "Poland" },
  { name: "HNL", country: "Croatia", aliases: ["1. HNL", "1.HNL"] },
  {
    name: "Premier League",
    country: "Russia",
    aliases: ["Russian Premier League"],
  },
  {
    name: "Premier League",
    country: "Ukraine",
    aliases: ["Ukrainian Premier League"],
  },
  {
    name: "Segunda División",
    country: "Spain",
    aliases: ["La Liga 2", "LaLiga 2"],
  },
  { name: "Serie B", country: "Italy" },
  { name: "2. Bundesliga", country: "Germany", aliases: ["Bundesliga 2"] },
  { name: "Ligue 2", country: "France" },
  {
    name: "Major League Soccer",
    country: "USA",
    aliases: ["MLS"],
  },
  { name: "Liga MX", country: "Mexico" },
  {
    name: "Serie A",
    country: "Brazil",
    aliases: ["Campeonato Brasileiro"],
  },
  { name: "CONMEBOL Libertadores", country: "World", aliases: ["Copa Libertadores"] },
  {
    name: "CONMEBOL Sudamericana",
    country: "World",
    aliases: ["Copa Sudamericana"],
  },
  {
    name: "Liga Profesional Argentina",
    country: "Argentina",
    aliases: ["Liga Profesional de Fútbol"],
  },
  { name: "Pro League", country: "Saudi-Arabia", aliases: ["Saudi Pro League"] },
  { name: "FIFA Club World Cup", country: "World" },
  { name: "Asian Cup", country: "World", aliases: ["AFC Asian Cup"] },
  {
    name: "Asian Cup Qualification",
    country: "World",
    aliases: ["AFC Asian Cup Qualification"],
  },
  { name: "Copa America", country: "World" },
  {
    name: "Africa Cup of Nations",
    country: "World",
    aliases: ["Africa Cup Of Nations"],
  },
  {
    name: "Africa Cup of Nations Qualification",
    country: "World",
    aliases: ["Africa Cup of Nations Qualifications"],
  },
  {
    name: "Euro Championship",
    country: "World",
    aliases: ["European Championship"],
  },
  {
    name: "Euro Championship - Qualification",
    country: "World",
    aliases: ["Euro Qualification"],
  },
  { name: "UEFA Nations League", country: "World" },
  {
    name: "World Cup - Qualification Europe",
    country: "World",
    aliases: ["WC Qualification Europe"],
  },
  {
    name: "World Cup - Qualification South America",
    country: "World",
    aliases: ["WC Qualification South America"],
  },
  {
    name: "World Cup - Qualification Africa",
    country: "World",
    aliases: ["CAF World Cup Qualifiers", "WC Qualification Africa"],
  },
  {
    name: "World Cup - Qualification CONCACAF",
    country: "World",
    aliases: ["WC Qualification Concacaf"],
  },
  {
    name: "World Cup - Qualification Asia",
    country: "World",
    aliases: ["WC Qualification Asia"],
  },
  {
    name: "World Cup - Qualification Oceania",
    country: "World",
    aliases: ["WC Qualification Oceania"],
  },
  {
    name: "World Cup - Qualification Intercontinental Play-offs",
    country: "World",
    aliases: ["WC Qualification Intercontinental Playoffs"],
  },
];

export const WORLD_COUNTRIES = new Set([
  "World",
  "Europe",
  "Africa",
  "Asia",
  "South-America",
  "North-America",
  "Oceania",
]);

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function countryMatches(target: TargetCompetition, item: ApiFootballLeague) {
  const country = item.country?.name ?? "";
  if (target.country === "World") {
    return WORLD_COUNTRIES.has(country);
  }
  return normalizeName(country) === normalizeName(target.country);
}

function nameCandidates(target: TargetCompetition) {
  return [target.name, ...(target.aliases ?? [])].map(normalizeName);
}

export function matchTargetCompetition(
  target: TargetCompetition,
  leagues: ApiFootballLeague[],
) {
  const names = nameCandidates(target);
  const inCountry = leagues.filter((item) => countryMatches(target, item));
  const pool = inCountry.length > 0 ? inCountry : leagues;

  const exact = pool.filter((item) =>
    names.includes(normalizeName(item.league.name)),
  );
  const currentExact = exact.filter((item) =>
    item.seasons?.some((season) => season.current),
  );
  if (currentExact.length === 1) return currentExact[0];
  if (exact.length === 1) return exact[0];
  if (currentExact.length > 1) return currentExact[0];
  if (exact.length > 1) return exact[0];

  const partial = pool.filter((item) => {
    const leagueName = normalizeName(item.league.name);
    return names.some((name) => leagueName.includes(name));
  });
  const currentPartial = partial.filter((item) =>
    item.seasons?.some((season) => season.current),
  );
  return currentPartial[0] ?? partial[0] ?? null;
}

export function currentSeasonYear(league: ApiFootballLeague) {
  return (
    league.seasons.find((season) => season.current)?.year ??
    league.seasons[league.seasons.length - 1]?.year ??
    null
  );
}
