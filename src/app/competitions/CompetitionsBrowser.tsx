"use client";

import Link from "next/link";
import { useState } from "react";

export type CompetitionNavItem = {
  id: number;
  name: string;
  country: string;
  logoUrl: string | null;
  flagUrl: string | null;
  hasTable: boolean;
};

export type CountryGroup = {
  country: string;
  flagUrl: string | null;
  leagues: CompetitionNavItem[];
};

export default function CompetitionsBrowser({
  groups,
}: {
  groups: CountryGroup[];
}) {
  const [query, setQuery] = useState("");
  const [openCountries, setOpenCountries] = useState<string[]>([]);

  const needle = query.trim().toLowerCase();
  const visible = groups
    .map((group) => {
      if (!needle) return group;
      const countryHit = group.country.toLowerCase().includes(needle);
      const leagues = countryHit
        ? group.leagues
        : group.leagues.filter((league) => league.name.toLowerCase().includes(needle));
      return { ...group, leagues };
    })
    .filter((group) => group.leagues.length > 0);

  function toggleCountry(country: string) {
    setOpenCountries((current) =>
      current.includes(country) ? current.filter((item) => item !== country) : [...current, country],
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <aside className="lg:sticky lg:top-4 lg:col-span-4 lg:self-start">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-3">
            <label htmlFor="competition-search" className="sr-only">
              Search competitions
            </label>
            <input
              id="competition-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Competitions..."
              className="mb-0 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>
          <nav aria-label="Competitions by country" className="max-h-[calc(100vh-11rem)] overflow-y-auto py-1">
            {visible.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-gray-500">
                {groups.length === 0 ? "No competitions stored yet." : "No competitions match that search."}
              </p>
            ) : (
              visible.map((group) => {
                const opened = openCountries.includes(group.country) || Boolean(needle);
                return (
                  <div key={group.country} className="border-b border-gray-100 last:border-b-0">
                    <button
                      type="button"
                      aria-expanded={opened}
                      onClick={() => toggleCountry(group.country)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left outline-none hover:bg-gray-50 focus-visible:bg-gray-50"
                    >
                      {group.flagUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={group.flagUrl} alt="" className="h-3.5 w-5 shrink-0 rounded-sm object-cover" />
                      ) : (
                        <span className="h-3.5 w-5 shrink-0 rounded-sm bg-gray-100" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{group.country}</span>
                      <span className="text-[10px] font-bold text-gray-400">{group.leagues.length}</span>
                    </button>
                    {opened ? (
                      <ul className="ml-5 border-l border-gray-200 pb-1">
                        {group.leagues.map((league) => (
                          <li key={league.id}>
                            <Link
                              href={`/competitions/${league.id}`}
                              className="flex w-full items-center gap-2 py-2 pr-3 pl-3 text-left text-sm text-gray-600 outline-none hover:bg-gray-50 hover:text-slate-900"
                            >
                              {league.logoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={league.logoUrl} alt="" className="h-4 w-4 shrink-0 object-contain" />
                              ) : (
                                <span className="h-4 w-4 shrink-0 rounded-sm bg-gray-100" />
                              )}
                              <span className="min-w-0 truncate">{league.name}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })
            )}
          </nav>
        </div>
      </aside>
      <section className="lg:col-span-8">
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-10 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Stored competitions</p>
          <p className="mt-2 text-sm text-gray-500">
            {groups.reduce((sum, group) => sum + group.leagues.length, 0)} leagues from API-Football. Open a competition for
            the live table, fixtures and season rates.
          </p>
        </div>
      </section>
    </div>
  );
}
