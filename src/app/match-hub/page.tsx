import { redirect } from "next/navigation";

import { resolveMatchHubId } from "@/app/match-hub/load";

export const dynamic = "force-dynamic";

/** Legacy query route — Match Hub now lives at /fixtures/[id]. */
export default async function MatchHubRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const fixtureId = await resolveMatchHubId(id);
  if (fixtureId == null) redirect("/");
  redirect(`/fixtures/${fixtureId}`);
}
