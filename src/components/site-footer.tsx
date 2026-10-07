"use client";

import Link from "next/link";
import { useState } from "react";

import BrandMark from "@/components/BrandMark";
import { useDisplayPrefs } from "@/components/display/DisplayPrefsProvider";
import {
  TIME_ZONE_OPTIONS,
  type CurrencyCode,
  type OddsFormat,
} from "@/utils/display-prefs";

const leagues = [
  { href: "/competitions?league=39", label: "Premier League" },
  { href: "/competitions?league=40", label: "Championship" },
  { href: "/competitions?league=41", label: "League One" },
  { href: "/competitions?league=2", label: "Champions League" },
  { href: "/competitions?league=140", label: "La Liga" },
  { href: "/competitions?league=135", label: "Serie A" },
  { href: "/competitions?league=78", label: "Bundesliga" },
];

const tools = [
  { href: "/", label: "Match Hub" },
  { href: "/props", label: "Player Props" },
  { href: "/match-props", label: "Match Props" },
  { href: "/referees", label: "Referee Desk" },
  { href: "/generator", label: "Bet Builder" },
  { href: "/ladder", label: "Ladder Challenge" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/pricing", label: "Pricing" },
];

const selectClass =
  "rounded-full border border-[#e2e8f0] bg-white px-3 py-1.5 text-xs font-semibold text-[#0f172a] outline-none focus:border-[#2563eb]";

export default function SiteFooter() {
  const [note, setNote] = useState("");
  const { prefs, setPrefs } = useDisplayPrefs();

  return (
    <footer className="mt-16 border-t border-gray-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div>
          <BrandMark className="text-sm font-semibold" />
          <p className="mt-2 text-sm text-gray-500">
            Stored fixtures, Bet365 prices, and card edges. 18+ only.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Football
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {leagues.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-slate-900 hover:text-blue-600"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/competitions" className="font-medium text-blue-600">
                See all leagues
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Tools
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {tools.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-slate-900 hover:text-blue-600"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Company
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {[
              { href: "/terms", label: "Terms of Service" },
              { href: "/privacy", label: "Privacy Policy" },
              { href: "/responsible-gambling", label: "Responsible Gambling" },
              { href: "/affiliate-disclosure", label: "Affiliate Disclosure" },
            ].map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-slate-900 hover:text-blue-600">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              setNote("Newsletter isn't open yet.");
            }}
          >
            <label
              htmlFor="newsletter"
              className="text-xs font-semibold tracking-wide text-gray-500 uppercase"
            >
              Newsletter
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="newsletter"
                type="email"
                required
                placeholder="you@email.com"
                className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm text-slate-900 outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                className="rounded-full bg-blue-600 px-4 text-sm font-semibold text-white"
              >
                Join
              </button>
            </div>
            {note ? <p className="mt-2 text-xs text-gray-500">{note}</p> : null}
          </form>
        </div>
      </div>

      <div className="border-t border-gray-200 bg-[#f8fafc]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-gray-500">
            18+ only. Prices are stored Bet365 numbers, not a profit record. Defaults: UK.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[#64748b] uppercase">
              Odds
              <select
                className={selectClass}
                value={prefs.oddsFormat}
                onChange={(event) =>
                  setPrefs({ oddsFormat: event.target.value as OddsFormat })
                }
                aria-label="Odds format"
              >
                <option value="decimal">Decimal</option>
                <option value="fractional">Fractional</option>
                <option value="american">American</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[#64748b] uppercase">
              Currency
              <select
                className={selectClass}
                value={prefs.currency}
                onChange={(event) =>
                  setPrefs({ currency: event.target.value as CurrencyCode })
                }
                aria-label="Currency format"
              >
                <option value="GBP">GBP £</option>
                <option value="EUR">EUR €</option>
                <option value="USD">USD $</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[#64748b] uppercase">
              Time
              <select
                className={selectClass}
                value={prefs.timeZone}
                onChange={(event) => setPrefs({ timeZone: event.target.value })}
                aria-label="Time format timezone"
              >
                {TIME_ZONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
    </footer>
  );
}
