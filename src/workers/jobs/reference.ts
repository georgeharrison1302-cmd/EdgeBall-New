import { isEmptyApiResponse } from "@/utils/api-football/client";
import { getCountries, getSeasons } from "@/utils/api-football/endpoints";
import { ingestTimezones } from "@/utils/api-football/ingest";
import type { WorkerJob } from "@/workers/types";
import { cadence } from "@/utils/api-football/cadence";
import { upsertChunks } from "@/workers/db";
import { runTsx } from "@/workers/run-tsx";

export const referenceJobs: WorkerJob[] = [
  {
    id: "timezone",
    lane: "reference",
    endpoints: ["/timezone"],
    intervalMs: cadence.timezone,
    description: "425 timezone strings. Static; stored once.",
    run: () => ingestTimezones(),
  },
  {
    id: "countries",
    lane: "reference",
    endpoints: ["/countries"],
    intervalMs: cadence.countries,
    description: "Country names, codes, flag URLs. Weekly.",
    run: syncCountries,
  },
  {
    id: "seasons",
    lane: "reference",
    endpoints: ["/leagues/seasons"],
    intervalMs: cadence.seasons,
    description: "Available season years. Weekly.",
    run: syncSeasons,
  },
  {
    id: "bookmakers",
    lane: "reference",
    endpoints: ["/odds/bookmakers"],
    intervalMs: cadence.bookmakers,
    description: "Bookmaker IDs and names. A few times per week.",
    run: () => runTsx("scripts/sync-bookmakers.ts"),
  },
  {
    id: "bets",
    lane: "reference",
    endpoints: ["/odds/bets"],
    intervalMs: cadence.bets,
    description: "Pre-match bet type IDs. A few times per week.",
    run: () => runTsx("scripts/sync-bets.ts"),
  },
  {
    id: "live-bets",
    lane: "reference",
    endpoints: ["/odds/live/bets"],
    intervalMs: cadence.liveBets,
    description: "Live bet type IDs. API can refresh every 60s; catalog is cached weekly.",
    run: () => runTsx("scripts/sync-live-bets.ts"),
  },
];

export async function syncCountries() {
  const envelope = await getCountries();
  if (isEmptyApiResponse(envelope)) {
    console.log("Data Not Yet Available resource=countries");
    return { count: 0 };
  }
  const rows = envelope.response
    .filter((country) => country.name)
    .map((country) => ({
      name: country.name,
      code: country.code,
      flag: country.flag,
    }));
  await upsertChunks("countries", rows, "name");
  console.log(`countries stored ${rows.length}`);
  return { count: rows.length };
}

export async function syncSeasons() {
  const envelope = await getSeasons();
  if (isEmptyApiResponse(envelope)) {
    console.log("Data Not Yet Available resource=seasons");
    return { count: 0 };
  }
  const rows = envelope.response
    .filter((year) => Number.isInteger(year))
    .map((year) => ({ year }));
  await upsertChunks("seasons", rows, "year");
  console.log(`seasons stored ${rows.length}`);
  return { count: rows.length };
}
