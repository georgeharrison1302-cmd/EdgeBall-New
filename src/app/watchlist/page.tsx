import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyReason } from "@/components/stats/EmptyReason";
import { FollowButton } from "@/components/watchlist/FollowButton";
import { MarkReadButton } from "@/components/watchlist/MarkReadButton";
import { FREE_WATCH_LIMIT } from "@/lib/alerts/rules";
import { ago } from "@/lib/freshness/load";
import { getSubscriptionAccess } from "@/utils/subscription";

import { loadWatchlist } from "./load";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Watchlist · EdgeBall",
  description: "Teams and fixtures you follow, with alerts for lineups, kickoff and new model tips.",
  robots: { index: false, follow: false },
};

export default async function WatchlistPage() {
  const access = await getSubscriptionAccess();
  if (!access.userId) redirect("/auth/login?next=/watchlist");
  const { items, alerts } = await loadWatchlist(access.userId);
  const unread = alerts.filter((alert) => !alert.read).length;

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <header>
        <p className="text-[11px] font-extrabold tracking-wide text-cobalt uppercase">Watchlist</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-ink">What you follow</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Follow teams and fixtures from their pages. Premium members get an alert when lineups are
          confirmed, when a followed match is about to kick off, and when the model publishes a new tip
          on it.
        </p>
      </header>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold tracking-wide text-ink uppercase">
            Alerts{access.unlocked && unread > 0 ? ` · ${unread} new` : ""}
          </h2>
          {access.unlocked && unread > 0 ? <MarkReadButton /> : null}
        </div>
        {!access.unlocked ? (
          <div className="mt-3 rounded-2xl border border-[#dbeafe] bg-[#eff6ff] px-5 py-4">
            <p className="text-sm font-bold text-ink">Alerts are a Premium feature</p>
            <p className="mt-1 text-sm text-muted">
              Free accounts can follow up to {FREE_WATCH_LIMIT} items. Premium unlocks unlimited follows and
              in-app alerts for lineups, kickoff and new model tips.
            </p>
            <Link
              href="/pricing"
              className="mt-3 inline-block rounded-full bg-cobalt px-4 py-2 text-xs font-bold text-white hover:bg-cobalt-dark"
            >
              See Premium
            </Link>
          </div>
        ) : alerts.length === 0 ? (
          <div className="mt-3">
            <EmptyReason
              variant="panel"
              title="No alerts yet"
              detail="Alerts appear when a followed fixture gets lineups, nears kickoff or receives a new model tip"
              source="user_alerts"
            />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
            {alerts.map((alert) => (
              <li key={alert.id} className={alert.read ? "" : "bg-[#f8fbff]"}>
                <Link href={alert.href ?? "/"} className="flex items-start gap-3 px-4 py-3">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${alert.read ? "bg-line" : "bg-cobalt"}`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-ink">{alert.title}</span>
                    {alert.body ? <span className="block text-xs text-muted">{alert.body}</span> : null}
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold text-faint">{ago(alert.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-extrabold tracking-wide text-ink uppercase">
          Following · {items.length}
          {!access.unlocked ? ` of ${FREE_WATCH_LIMIT}` : ""}
        </h2>
        {items.length === 0 ? (
          <div className="mt-3">
            <EmptyReason
              variant="panel"
              title="Nothing followed yet"
              detail="Use the Follow button on a team page or a Match Hub"
              source="user_watchlist"
            />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
            {items.map((item) => (
              <li key={`${item.kind}-${item.entityId}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={item.href} className="text-sm font-bold text-ink hover:text-cobalt">
                    {item.label}
                  </Link>
                  <p className="text-xs text-muted">
                    {item.kind === "team" ? "Team" : "Fixture"}
                    {item.next ? (
                      <>
                        {" · next: "}
                        <Link href={`/fixtures/${item.next.id}`} className="font-semibold text-cobalt">
                          {item.next.label}
                        </Link>
                        {item.next.kickoff ? ` · ${new Date(item.next.kickoff).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : ""}
                      </>
                    ) : item.kind === "team" ? " · no upcoming fixture stored" : ""}
                  </p>
                </div>
                <FollowButton kind={item.kind} entityId={item.entityId} label={item.label} href={item.href} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
