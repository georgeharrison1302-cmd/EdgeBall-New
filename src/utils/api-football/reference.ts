import "server-only";
import { createIngestClient } from "@/utils/supabase/admin";

export type StoredCountry = {
  name: string;
  code: string | null;
  flag_url: string | null;
};

export type CountryLookup = {
  name?: string;
  code?: string;
  search?: string;
};

function searchTerm(value: string | undefined) {
  if (value == null) return null;
  const term = value.trim().replace(/[%_]/g, "");
  if (term.length < 3) return "";
  return term;
}

export async function listTimezones() {
  const supabase = createIngestClient();
  const names: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("timezones")
      .select("name")
      .order("name")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) names.push(String(row.name));
    if (!data || data.length < 1000) break;
  }
  return names;
}

export async function isKnownSeason(year: number) {
  if (!Number.isInteger(year)) return false;
  const supabase = createIngestClient();
  const { data, error } = await supabase.from("seasons").select("year").eq("year", year).maybeSingle();
  if (error) throw error;
  return data != null;
}

export async function isKnownTimezone(name: string) {
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("timezones")
    .select("name")
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

export async function findCountries(query: CountryLookup = {}) {
  const searched = searchTerm(query.search);
  if (searched === "") return [];

  const supabase = createIngestClient();
  let request = supabase.from("countries").select("name, code, flag_url").order("name");
  if (query.name) request = request.eq("name", query.name);
  if (query.code) request = request.eq("code", query.code);
  if (searched) request = request.ilike("name", `%${searched}%`);

  const { data, error } = await request;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    name: String(row.name),
    code: row.code == null ? null : String(row.code),
    flag_url: row.flag_url == null ? null : String(row.flag_url),
  })) satisfies StoredCountry[];
}
