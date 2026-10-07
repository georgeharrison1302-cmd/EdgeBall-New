import { OddsText } from "@/components/display/OddsText";
import { EmptyReason } from "@/components/stats/EmptyReason";

import { EdgeBar } from "./edge-bar";
import { FormTracker } from "./form-tracker";
import type { RankedProp } from "./load";

export function HeroSection({ prop }: { prop: RankedProp | null }) {
  if (!prop) {
    return (
      <section className="rounded-3xl border border-[#e2e8f0] bg-white px-5 py-8">
        <EmptyReason
          detail="No priced prop has a stored match log for this match"
          source="prematch_odds / fixture_player_statistics"
        />
      </section>
    );
  }

  const points = prop.edge * 100;
  const signed = `${points > 0 ? "+" : ""}${points.toFixed(1)}`;

  return (
    <section className="rounded-3xl border border-[#e2e8f0] bg-white px-5 py-6">
      <p className="text-sm text-[#64748b]">
        {prop.match} · {prop.time}
      </p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#0f172a]">{prop.player}</h2>
      <p className="mt-1 text-lg text-[#0f172a]">{prop.label}</p>
      <div className="mt-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[#64748b]">Edge</p>
          <p className="text-4xl font-semibold tracking-tight text-[#2563eb]">{signed}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-[#64748b]">Price</p>
          <p className="text-3xl font-semibold tracking-tight text-[#2563eb]">
            <OddsText decimal={prop.odds} prefix="" />
          </p>
        </div>
      </div>
      <div className="mt-5">
        <EdgeBar implied={prop.implied} hitRate={prop.hitRate} />
      </div>
      <div className="mt-4">
        <FormTracker form={prop.form} />
      </div>
    </section>
  );
}
