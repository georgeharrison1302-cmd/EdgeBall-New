import type { Metadata } from "next";
import Link from "next/link";

import { Shell } from "../competitions/ui";
import { searchCatalog, type SearchHit } from "./load";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search · EdgeBall",
  description: "Find a club or a player from the stored names.",
};

type PageProps = { searchParams: Promise<{ q?: string }> };

export default async function SearchPage({ searchParams }: PageProps) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const results = query.length >= 2 ? await searchCatalog(query) : { teams: [], players: [] };

  return (
    <Shell current="search">
      <p className="text-[11px] font-extrabold tracking-[0.12em] text-[#2563eb] uppercase">Search</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Clubs and players</h1>
      <form action="/search" className="mt-5 flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Name"
          className="min-w-0 flex-1 rounded-full border border-[#e2e8f0] bg-white px-4 py-2 text-sm"
        />
        <button type="submit" className="rounded-full bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white">
          Search
        </button>
      </form>
      {query.length < 2 ? (
        <p className="mt-6 text-sm text-[#64748b]">Type at least two letters.</p>
      ) : (
        <div className="mt-6 space-y-8">
          <HitList
            title="Clubs"
            empty={query.length < 3 ? "Type at least three letters for a club." : "No club stored under that name."}
            hits={results.teams}
          />
          <HitList title="Players" empty="No player stored under that name." hits={results.players} />
        </div>
      )}
    </Shell>
  );
}

function HitList({ title, empty, hits }: { title: string; empty: string; hits: SearchHit[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      {hits.length === 0 ? (
        <p className="mt-2 text-sm text-[#64748b]">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-[#f1f5f9] overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white">
          {hits.map((hit) => (
            <li key={hit.id}>
              {hit.href ? (
                <Link href={hit.href} className="flex items-center gap-3 px-4 py-3">
                  <Face image={hit.image} />
                  <span>
                    <span className="block font-semibold">{hit.name}</span>
                    <span className="block text-xs text-[#64748b]">{hit.detail}</span>
                  </span>
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3">
                  <Face image={hit.image} />
                  <span>
                    <span className="block font-semibold">{hit.name}</span>
                    <span className="block text-xs text-[#64748b]">{hit.detail}</span>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Face({ image }: { image: string | null }) {
  if (!image) return <span className="h-8 w-8 rounded-full bg-[#e2e8f0]" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt="" className="h-8 w-8 rounded-full bg-[#e2e8f0] object-contain" />
  );
}
