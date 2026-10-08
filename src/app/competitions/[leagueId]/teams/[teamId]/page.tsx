import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { loadClubExtras, type ResultRow } from "../../../club-extras";
import { leagueTitle, listSelectableSeasons, loadTeam, loadTeamSheetTotals, parseSeason } from "../../../data";
import { count, Form, Stat } from "../../../ui";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ leagueId: string; teamId: string }>;
  searchParams: Promise<{ season?: string; asof?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { leagueId } = await params;
  const league = Number(leagueId);
  if (!Number.isInteger(league)) return { title: "Team · EdgeBall" };
  const name = await leagueTitle(league);
  return { title: name ? `Club · ${name} · EdgeBall` : "Team · EdgeBall" };
}

export default async function TeamPage({ params, searchParams }: PageProps) {
  const { leagueId, teamId } = await params;
  const { season: seasonParam, asof: asOfParam } = await searchParams;
  const league = Number(leagueId);
  const team = Number(teamId);
  if (!Number.isInteger(league) || !Number.isInteger(team)) notFound();
  const season = parseSeason(seasonParam, await listSelectableSeasons(league));
  const asOf = asOfParam && /^\d{4}-\d{2}-\d{2}$/.test(asOfParam) ? asOfParam : null;
  const [page, extras, sheets] = await Promise.all([
    loadTeam(league, team, season, asOf),
    loadClubExtras(team),
    loadTeamSheetTotals(league, season),
  ]);
  const row = page.standing;
  const sheet = sheets.find((item) => item.teamId === team) ?? null;
  const stats = [
    ...page.stats,
    { label: "xG / game", value: averageText(sheet?.xg ?? null) },
    { label: "xG home / game", value: averageText(sheet?.homeXg ?? null) },
    { label: "xG away / game", value: averageText(sheet?.awayXg ?? null) },
    { label: "xC / game", value: averageText(sheet?.xc ?? null) },
    { label: "xC home / game", value: averageText(sheet?.homeXc ?? null) },
    { label: "xC away / game", value: averageText(sheet?.awayXc ?? null) },
    { label: "Corners home / game", value: averageText(sheet?.homeCorners ?? null) },
    { label: "Corners away / game", value: averageText(sheet?.awayCorners ?? null) },
    { label: "Corners / game", value: averageText(sheet?.corners ?? null) },
  ];

  return (
    <div>
      <p className="text-sm text-muted">
        <Link href="/competitions" className="text-cobalt">
          Competitions
        </Link>
        <span> / </span>
        <Link href={`/competitions/${page.leagueId}?season=${season}`} className="text-cobalt">
          {page.league}
        </Link>
      </p>
      <div className="mt-3 flex items-center gap-3">
        {page.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" decoding="async" src={page.logoUrl} alt="" className="h-12 w-12 object-contain" />
        ) : null}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{page.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {page.league} · {season}
          </p>
          <p className="mt-1 text-sm text-muted">
            {[page.code, page.founded ? `Founded ${page.founded}` : null, page.venue].filter(Boolean).join(" · ")}
          </p>
          {page.alsoIn.length > 0 ? (
            <p className="mt-2 text-sm text-muted">
              Also in{" "}
              {page.alsoIn.map((competition, index) => (
                <span key={competition.leagueId}>
                  {index > 0 ? ", " : null}
                  <Link
                    href={`/competitions/${competition.leagueId}/teams/${page.teamId}?season=${season}`}
                    className="text-cobalt"
                  >
                    {competition.name}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </div>

      {row ? (
        <>
        <p className="mt-4 text-sm text-muted">
          {place(row.rank)} in the {page.league}
          {row.description ? ` · ${row.description}` : ""}
        </p>
        {row.homeRecord || row.awayRecord ? (
          <p className="mt-1 text-sm text-muted">
            {row.homeRecord ? `Home ${row.homeRecord}` : ""}
            {row.homeRecord && row.awayRecord ? " · " : ""}
            {row.awayRecord ? `Away ${row.awayRecord}` : ""}
          </p>
        ) : null}
        <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-[11px] tracking-wide text-muted uppercase">
              <tr>
                <th className="px-3 py-3" title="Table position">#</th>
                <th className="px-2 py-3 text-right" title="Played (matches)">P</th>
                <th className="px-2 py-3 text-right" title="Wins">W</th>
                <th className="px-2 py-3 text-right" title="Draws">D</th>
                <th className="px-2 py-3 text-right" title="Losses">L</th>
                <th className="px-2 py-3 text-right" title="Goals for">GF</th>
                <th className="px-2 py-3 text-right" title="Goals against">GA</th>
                <th className="px-2 py-3 text-right" title="Goal difference">GD</th>
                <th className="px-2 py-3 text-right" title="Expected goals per game">xG</th>
                <th className="px-2 py-3 text-right" title="Expected goals conceded per game">xC</th>
                <th className="px-2 py-3 text-right" title="Corners per game (home)">Corners H</th>
                <th className="px-2 py-3 text-right" title="Corners per game (away)">Corners A</th>
                <th className="px-2 py-3 text-right" title="Corners per game">Corners</th>
                <th className="px-2 py-3 text-right" title="Points">Pts</th>
                <th className="px-3 py-3" title="Recent form (last five results)">Form</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-3">{count(row.rank)}</td>
                <td className="px-2 py-3 text-right">{count(row.played)}</td>
                <td className="px-2 py-3 text-right">{count(row.win)}</td>
                <td className="px-2 py-3 text-right">{count(row.draw)}</td>
                <td className="px-2 py-3 text-right">{count(row.lose)}</td>
                <td className="px-2 py-3 text-right">{count(row.goalsFor)}</td>
                <td className="px-2 py-3 text-right">{count(row.goalsAgainst)}</td>
                <td className="px-2 py-3 text-right">{count(row.goalsDiff)}</td>
                <td className="px-2 py-3 text-right font-semibold text-cobalt">{averageText(sheet?.xg ?? null) ?? "–"}</td>
                <td className="px-2 py-3 text-right">{averageText(sheet?.xc ?? null) ?? "–"}</td>
                <td className="px-2 py-3 text-right">{averageText(sheet?.homeCorners ?? null) ?? "–"}</td>
                <td className="px-2 py-3 text-right">{averageText(sheet?.awayCorners ?? null) ?? "–"}</td>
                <td className="px-2 py-3 text-right">{averageText(sheet?.corners ?? null) ?? "–"}</td>
                <td className="px-2 py-3 text-right font-semibold">{count(row.points)}</td>
                <td className="px-3 py-3">
                  <Form value={row.form} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <p className="mt-5 text-sm text-muted">No {season} standing stored for this club.</p>
      )}

      <h2 className="mt-8 text-lg font-semibold">Next fixture</h2>
      {extras.next ? (
        <ResultList rows={[extras.next]} />
      ) : (
        <p className="mt-2 text-sm text-muted">No next fixture stored (fixtures).</p>
      )}

      <h2 className="mt-8 text-lg font-semibold">Recent results</h2>
      {extras.recent.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Recent results are not stored (fixtures).</p>
      ) : (
        <ResultList rows={extras.recent} />
      )}

      <h2 className="mt-8 text-lg font-semibold">Coach</h2>
      {extras.coach ? (
        <div className="mt-3">
          <div className="flex items-center gap-3">
            {extras.coach.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" decoding="async" src={extras.coach.photo} alt="" className="h-12 w-12 rounded-full object-cover bg-line" />
            ) : null}
            <div>
              <p className="font-semibold">{extras.coach.name}</p>
              <p className="text-sm text-muted">
                {[extras.coach.age === null ? null : String(extras.coach.age), extras.coach.nationality].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          {extras.coach.spells.length > 0 ? (
            <ul className="mt-3 divide-y divide-[#f1f5f9] overflow-hidden rounded-2xl border border-line bg-white">
              {extras.coach.spells.map((spell, index) => (
                <li key={`${spell.type}-${spell.start}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="font-semibold">{spell.type ?? "Sidelined"}</span>
                  <span className="text-muted">
                    {spell.start ?? ""}
                    {spell.start || spell.end ? " – " : ""}
                    {spell.end ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {extras.coach.career.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Career history is not stored.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#f1f5f9] overflow-hidden rounded-2xl border border-line bg-white">
              {extras.coach.career.map((job, index) => (
                <li key={`${job.team}-${job.start ?? "open"}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="font-semibold">{job.team}</span>
                  <span className="text-muted">
                    {job.start ?? ""}
                    {job.start || job.end ? " – " : ""}
                    {job.end ?? "present"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">Coach is not stored (coaches).</p>
      )}

      <h2 className="mt-8 text-lg font-semibold">Venue</h2>
      <p className="mt-2 text-sm text-muted">
        {extras.venue ? extras.venue.name : "Venue is not stored (venues)."}
      </p>
      {extras.venue ? (
        <p className="mt-1 text-sm text-muted">
          {[
            extras.venue.place,
            extras.venue.capacity == null ? null : extras.venue.capacity.toLocaleString("en-GB"),
            extras.venue.surface,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      {extras.venue?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img loading="lazy" decoding="async" src={extras.venue.imageUrl} alt="" className="mt-3 h-40 w-full max-w-xl rounded-2xl object-cover" />
      ) : null}

      <h2 className="mt-8 text-lg font-semibold">Season totals</h2>
      <p className="mt-1 text-sm text-muted">
        {asOf ? `From the start of the season through ${asOf}.` : "Season so far."} Each match is in the list above.
      </p>
      {stats.every((stat) => stat.value === null || stat.value === "") ? (
        <p className="mt-4 text-sm text-muted">
          {asOf ? `No totals stored up to ${asOf}.` : "No season totals stored."}
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat) => (
            <Stat key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </div>
      )}

      <h2 className="mt-8 text-lg font-semibold">Squad</h2>
      <p className="mt-1 text-sm text-muted">Current registered roster. Season lines are the stored {season} totals.</p>
      {page.squad.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No squad stored.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {page.squad.map((player) => (
            <li key={player.id}>
              <Link
                href={`/competitions/${page.leagueId}/players/${player.id}?season=${season}`}
                className="flex items-center gap-3 px-4 py-3"
              >
                {player.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img loading="lazy" decoding="async" src={player.photoUrl} alt="" className="h-10 w-10 rounded-full object-cover bg-line" />
                ) : (
                  <span className="h-10 w-10 rounded-full bg-line" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {player.number !== null ? `${player.number} ` : ""}
                    {player.name}
                    {player.injured ? <span className="ml-2 text-xs font-semibold text-amber-700">Unavailable</span> : null}
                  </span>
                  <span className="block text-xs text-muted">
                    {[player.age === null ? null : String(player.age), player.position, player.line].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <List title="Trophies" empty="Trophies are not stored." rows={extras.trophies} />
      <List title="Transfers" empty="Transfers are not stored." rows={extras.transfers} />
      <List title="Injuries" empty="Injuries are not stored." rows={extras.injuries} />
      {extras.injuries.length > 0 ? (
        <p className="mt-1 text-xs text-muted">Stored reason only. This is not a prediction that the player misses the next match.</p>
      ) : null}
      <List title="Sidelined" empty="Sidelined spells are not stored." rows={extras.sidelined} />
    </div>
  );
}

function averageText(value: number | null) {
  return value == null ? null : value.toFixed(2);
}

function place(rank: number | null) {
  if (!rank) return "Unranked";
  const teen = rank % 100;
  const suffix = teen >= 11 && teen <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[rank % 10] ?? "th";
  return `${rank}${suffix}`;
}

function ResultList({ rows }: { rows: ResultRow[] }) {
  return (
    <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
      {rows.map((row) => (
        <li key={row.id}>
          <Link href={`/fixtures/${row.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span>
              <span className="block font-semibold">{row.label}</span>
              <span className={`text-xs ${row.statusLabel ? "font-semibold text-amber-700" : "text-muted"}`}>
                {row.kickoff}
                {row.statusLabel ? ` · ${row.statusLabel}` : ""}
              </span>
            </span>
            <b>{row.statusLabel ?? row.score ?? "v"}</b>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function List({ title, empty, rows }: { title: string; empty: string; rows: string[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white text-sm">
          {rows.map((row, index) => (
            <li key={`${row}-${index}`} className="px-4 py-3">
              {row}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
