import type { MatchLogRow } from "@/app/competitions/match-types";

export function PlayerBreakdown({ rows }: { rows: MatchLogRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted">Match-by-match log is not stored.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-[11px] tracking-wide text-muted uppercase">
          <tr>
            <th className="px-3 py-2">Opponent</th>
            <th className="px-2 py-2">Ref</th>
            <th className="px-2 py-2 text-right">Min</th>
            <th className="px-2 py-2 text-right">Fouls</th>
            <th className="px-2 py-2 text-right">SOT</th>
            <th className="px-3 py-2 text-right">Card</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.fixtureId} className="border-t border-[#f1f5f9]">
              <td className="px-3 py-2">
                <span className="font-semibold text-slate-900">{row.opponent}</span>
                <span className="block text-[11px] text-muted">{row.kickoff}</span>
              </td>
              <td className="px-2 py-2 text-muted">{row.referee ?? "—"}</td>
              <td className="px-2 py-2 text-right">{shown(row.minutes)}</td>
              <td className="px-2 py-2 text-right">{shown(row.foulsCommitted)}</td>
              <td className="px-2 py-2 text-right">{shown(row.shotsOn)}</td>
              <td className="px-3 py-2 text-right font-semibold">
                {(row.yellow ?? 0) + (row.red ?? 0) > 0 ? "Yes" : row.yellow == null && row.red == null ? "—" : "No"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function shown(value: number | null) {
  return value == null ? "—" : String(value);
}
