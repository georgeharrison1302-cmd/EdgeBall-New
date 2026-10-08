import type { Metadata } from "next";

import { MarketTable } from "@/components/record/MarketTable";
import { ProfitCurve } from "@/components/record/ProfitCurve";
import { EmptyReason } from "@/components/stats/EmptyReason";
import { DataFreshness } from "@/components/ui/DataFreshness";

import { loadModelRecord } from "./load";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Model Record · EdgeBall",
  description:
    "Every model tip EdgeBall has published, frozen at the price we saw and graded after full time — wins, losses, ROI and calibration, nothing hidden.",
};

const pct = (value: number | null, digits = 0) =>
  value == null ? "—" : `${(value * 100).toFixed(digits)}%`;
const units = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}u`;

export default async function RecordPage() {
  const record = await loadModelRecord();
  const lowSample = record.settled < 100;

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
      <header>
        <p className="text-[11px] font-extrabold tracking-wide text-cobalt uppercase">Model record</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-ink">Our tips, graded in public</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Every tip is stored at the moment it is generated — price, model probability and edge are
          frozen and never rewritten. Tips are settled after full time from stored results. Flat 1-unit
          stakes. This is a record of the model, not advice to bet.
        </p>
        <div className="mt-3">
          <DataFreshness jobs={["tips", "results", "odds"]} />
        </div>
      </header>

      {record.tracked === 0 ? (
        <EmptyReason
          variant="panel"
          title="No tips recorded yet"
          detail="The ledger fills as the model publishes tips and fixtures finish"
          source="model_tips"
        />
      ) : (
        <>
          {lowSample ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              Small sample: {record.settled} settled tips. Results this early are mostly noise — treat the
              ROI as provisional until the sample is well past 100.
            </p>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Stat label="Settled tips" value={String(record.settled)} sub={`${record.pending} pending`} />
            <Stat label="Record" value={`${record.wins}-${record.losses}`} sub={`${pct(record.hitRate)} hit rate`} />
            <Stat
              label="Profit"
              value={units(record.profit)}
              tone={record.profit >= 0 ? "good" : "bad"}
              sub="flat 1u stakes"
            />
            <Stat
              label="ROI"
              value={record.roi == null ? "—" : `${record.roi >= 0 ? "+" : ""}${(record.roi * 100).toFixed(1)}%`}
              tone={record.roi != null && record.roi >= 0 ? "good" : "bad"}
              sub="profit per unit staked"
            />
            <Stat label="Max drawdown" value={`${record.maxDrawdown.toFixed(1)}u`} sub="peak to trough" />
            <Stat
              label="Beat the close"
              value={
                record.clv.priced === 0
                  ? "—"
                  : `${pct(record.clv.beatClose / record.clv.priced)}`
              }
              tone={record.clv.avgClv == null ? undefined : record.clv.avgClv >= 0 ? "good" : "bad"}
              sub={
                record.clv.priced === 0
                  ? "needs stamped closing prices"
                  : `avg CLV ${record.clv.avgClv! >= 0 ? "+" : ""}${(record.clv.avgClv! * 100).toFixed(1)}% · ${record.clv.priced} priced`
              }
            />
          </section>

          <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-sm font-extrabold tracking-wide text-ink uppercase">Cumulative profit</h2>
            {record.curve.length >= 2 ? (
              <div className="mt-3">
                <ProfitCurve points={record.curve} />
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">The curve appears once at least two tips are settled.</p>
            )}
          </section>

          <section>
            <h2 className="text-sm font-extrabold tracking-wide text-ink uppercase">By market</h2>
            <div className="mt-3">
              <MarketTable markets={record.markets} />
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-sm font-extrabold tracking-wide text-ink uppercase">Model versions</h2>
            <p className="mt-1 text-sm text-muted">
              We changed how probabilities are built after the calibration below showed the first
              version was overconfident. Old tips stay in the record untouched; new tips are tracked
              separately so the fix is judged on its own results.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {record.versions.map((version) => (
                <div key={version.label} className="rounded-xl border border-line bg-surface px-4 py-3">
                  <p className="text-sm font-black text-ink">
                    {version.label}
                    <span className="ml-2 text-xs font-semibold text-muted">{version.tips} tips · {version.settled} settled</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{version.note}</p>
                  <p className="mt-2 text-sm font-bold tabular-nums text-ink">
                    {version.settled ? `${version.wins}-${version.settled - version.wins} · ${units(version.profit)}` : "No settled tips yet"}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-sm font-extrabold tracking-wide text-ink uppercase">Calibration</h2>
            <p className="mt-1 text-sm text-muted">
              When the model says a tip has a given chance, how often does it win? Close agreement
              between the two columns means the probabilities can be trusted. Only published
              (edge-flagged) tips are included, so this is not a full-market calibration.
            </p>
            {record.calibration.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Needs settled tips.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {record.calibration.map((bin) => (
                  <div key={bin.label}>
                    <div className="flex items-baseline justify-between text-xs font-semibold">
                      <span className="text-ink">Model said {bin.label}</span>
                      <span className="text-muted tabular-nums">
                        predicted {pct(bin.predicted)} · won {pct(bin.actual)} · n={bin.n}
                      </span>
                    </div>
                    <div className="relative mt-1.5 h-2 rounded-full bg-canvas">
                      <span className="absolute inset-y-0 left-0 rounded-full bg-[#cbd5e1]" style={{ width: `${bin.predicted * 100}%` }} />
                      <span className="absolute inset-y-0 left-0 rounded-full bg-cobalt/80" style={{ width: `${bin.actual * 100}%`, height: "50%", top: "25%" }} />
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-faint">
                  Grey bar: model probability. Blue bar: realised win rate.
                </p>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-white p-5 text-sm text-muted shadow-sm">
            <h2 className="text-sm font-extrabold tracking-wide text-ink uppercase">How to read this</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>
                {record.price
                  ? `Average bookmaker price implied a ${pct(record.price.implied, 1)} win chance; tips actually won ${pct(record.price.actual, 1)}.`
                  : "Price versus result appears once tips settle."}
              </li>
              <li>
                {record.clv.priced > 0
                  ? `Beat the close on ${record.clv.beatClose} of ${record.clv.priced} tips with a stamped closing price (avg CLV ${record.clv.avgClv! >= 0 ? "+" : ""}${(record.clv.avgClv! * 100).toFixed(2)}%). CLV is the sharpest truth test we have — a consistently positive number means our prices beat the market's final answer.`
                  : "Closing-line value (did we beat the final price?) appears once tips have stamped closing prices — these are frozen at kickoff as tips settle."}
              </li>
              <li>Prices come from stored Bet365 snapshots and may have moved by the time you look.</li>
              <li>Past performance does not predict future results. 18+. Gamble responsibly.</li>
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-extrabold tracking-wide text-muted uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${tone === "good" ? "text-cobalt" : tone === "bad" ? "text-red-600" : "text-ink"}`}>
        {value}
      </p>
      <p className="text-[11px] font-semibold text-faint">{sub}</p>
    </div>
  );
}
