import { HitRateStrip } from "@/components/stats/HitRateStrip";

export function FormTracker({
  form,
  thresholdLabel = "hit",
}: {
  form: Array<boolean | null>;
  thresholdLabel?: string;
}) {
  return (
    <HitRateStrip
      values={form.filter((item): item is boolean => item !== null)}
      thresholdLabel={thresholdLabel}
    />
  );
}
