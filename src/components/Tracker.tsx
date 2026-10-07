import Link from "next/link";

/** Legacy placeholder — Tracker page now renders ModelGrading directly. */
export default function Tracker() {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">Model accuracy moved up</p>
      <p className="mt-2 max-w-xl text-sm text-gray-500">
        Public tip grading lives on this Tracker route. Personal bankroll tracking is under{" "}
        <Link href="/portfolio" className="font-semibold text-blue-600">
          Portfolio
        </Link>
        .
      </p>
    </section>
  );
}
