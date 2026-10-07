import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types";

function adminOptions() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return {
    url,
    serviceRoleKey,
    options: {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  } as const;
}

export function createAdminClient() {
  const { url, serviceRoleKey, options } = adminOptions();
  return createClient<Database>(url, serviceRoleKey, options);
}

/** Ingest writes table names as strings, so it stays off the generated table types. */
export function createIngestClient() {
  const { url, serviceRoleKey, options } = adminOptions();
  return createClient(url, serviceRoleKey, options);
}
