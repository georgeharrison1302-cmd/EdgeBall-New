import "server-only";

import { cache } from "react";

import { createAdminClient } from "@/utils/supabase/admin";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.edgeball.co.uk";

export const teamName = cache(async (teamId: number): Promise<string | null> => {
  if (!Number.isInteger(teamId)) return null;
  const { data } = await createAdminClient().from("teams").select("name").eq("id", teamId).maybeSingle();
  return data?.name ?? null;
});

export const playerName = cache(async (playerId: number): Promise<string | null> => {
  if (!Number.isInteger(playerId)) return null;
  const { data } = await createAdminClient().from("players").select("name").eq("id", playerId).maybeSingle();
  return data?.name ?? null;
});
