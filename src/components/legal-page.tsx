import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm text-muted">
        <Link href="/" className="text-cobalt">
          EdgeBall
        </Link>
        <span> / Legal</span>
      </p>
      <p className="mt-6 text-[11px] font-extrabold tracking-wide text-cobalt uppercase">
        {eyebrow}
      </p>
      <h1 className="mt-1 text-3xl font-black tracking-tight text-ink">{title}</h1>
      <p className="mt-2 text-xs font-semibold text-faint">Last updated: {updated}</p>
      <div className="mt-8 space-y-8 text-sm leading-relaxed text-[#475569]">{children}</div>
      <div className="mt-12 rounded-2xl border border-line bg-white p-5">
        <p className="text-xs font-extrabold tracking-wide text-muted uppercase">
          More legal
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
          <Link href="/terms" className="text-cobalt hover:underline">
            Terms of Service
          </Link>
          <Link href="/privacy" className="text-cobalt hover:underline">
            Privacy Policy
          </Link>
          <Link href="/responsible-gambling" className="text-cobalt hover:underline">
            Responsible Gambling
          </Link>
          <Link href="/affiliate-disclosure" className="text-cobalt hover:underline">
            Affiliate Disclosure
          </Link>
        </div>
      </div>
    </main>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
