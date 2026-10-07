import { redirect } from "next/navigation";

type Search = {
  date?: string;
  league?: string;
  status?: string;
  priced?: string;
  view?: string;
};

/** Match Hub lives at `/` — keep /fixtures as a stable alias. */
export default async function FixturesRedirect({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.date) query.set("date", params.date);
  if (params.league) query.set("league", params.league);
  if (params.status) query.set("status", params.status);
  if (params.priced) query.set("priced", params.priced);
  if (params.view) query.set("view", params.view);
  const qs = query.toString();
  redirect(qs ? `/?${qs}` : "/");
}
