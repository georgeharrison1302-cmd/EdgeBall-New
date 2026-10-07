import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type PlayerIdentity = {
  id: number;
  name: string;
  photo: string | null;
};

type DirectoryOptions = {
  /** When set, squad lookup prefers these clubs (player+team). */
  teamIds?: number[];
};

const CHUNK = 200;

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function chunks<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

/**
 * Resolve display name + photo for player ids.
 * Order: players → player_profiles → team_squads → `Player ${id}`.
 *
 * Season stats often reference ids that never landed in `players`; profiles/squads usually have them.
 */
export async function loadPlayerDirectory(
  supabase: SupabaseClient,
  playerIds: Iterable<number>,
  options: DirectoryOptions = {},
): Promise<Map<number, PlayerIdentity>> {
  const ids = [...new Set([...playerIds].filter((id) => Number.isInteger(id) && id > 0))];
  const out = new Map<number, PlayerIdentity>();
  if (ids.length === 0) return out;

  const teamIds = [...new Set((options.teamIds ?? []).filter((id) => Number.isInteger(id) && id > 0))];
  const peopleById = new Map<number, { name: string | null; photo: string | null }>();
  const profileById = new Map<number, { name: string | null; photo: string | null }>();
  const squadById = new Map<number, { name: string | null; photo: string | null }>();

  for (const batch of chunks(ids, CHUNK)) {
    const [{ data: people }, { data: profiles }, { data: squads }] = await Promise.all([
      supabase.from("players").select("id, name, photo").in("id", batch),
      supabase.from("player_profiles").select("player_id, name, photo").in("player_id", batch),
      teamIds.length
        ? supabase
            .from("team_squads")
            .select("player_id, team_id, player_name, photo")
            .in("player_id", batch)
            .in("team_id", teamIds)
        : supabase.from("team_squads").select("player_id, player_name, photo").in("player_id", batch),
    ]);

    for (const row of people ?? []) {
      peopleById.set(Number(row.id), {
        name: clean(row.name),
        photo: clean((row as { photo?: unknown }).photo),
      });
    }
    for (const row of profiles ?? []) {
      profileById.set(Number(row.player_id), {
        name: clean(row.name),
        photo: clean(row.photo),
      });
    }
    for (const row of squads ?? []) {
      const playerId = Number(row.player_id);
      if (squadById.has(playerId) && squadById.get(playerId)?.name) continue;
      squadById.set(playerId, {
        name: clean((row as { player_name?: unknown }).player_name),
        photo: clean(row.photo),
      });
    }
  }

  for (const id of ids) {
    const person = peopleById.get(id);
    const profile = profileById.get(id);
    const squad = squadById.get(id);
    out.set(id, {
      id,
      name: person?.name ?? profile?.name ?? squad?.name ?? `Player ${id}`,
      photo: person?.photo ?? profile?.photo ?? squad?.photo ?? null,
    });
  }
  return out;
}

export function playerLabel(directory: Map<number, PlayerIdentity>, playerId: number) {
  return directory.get(playerId)?.name ?? `Player ${playerId}`;
}

export function playerPhoto(directory: Map<number, PlayerIdentity>, playerId: number) {
  return directory.get(playerId)?.photo ?? null;
}
