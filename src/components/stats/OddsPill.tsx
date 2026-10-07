"use client";

import { useDisplayPrefs } from "@/components/display/DisplayPrefsProvider";

import { isPriced, type DecimalOdds } from "./types";

/**
 * Sportsbook price pill — selection secondary, @odds primary, full press target.
 * Disabled / unpriced → "No Book Odds". Never invents a price.
 */
export function OddsPill({
  label,
  decimalOdds,
  onClick,
  added = false,
  disabled = false,
  size = "md",
  variant = "pill",
  className = "",
}: {
  label?: string;
  decimalOdds: DecimalOdds;
  onClick?: () => void;
  added?: boolean;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "pill" | "card";
  className?: string;
}) {
  const { formatOddsLabel } = useDisplayPrefs();
  const priced = isPriced(decimalOdds);
  const pad =
    size === "lg" ? "px-4 py-2.5 text-sm" : size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-xs";

  if (!priced) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-[var(--line)] bg-white font-semibold text-[var(--muted)] ${pad} ${className}`.trim()}
      >
        No Book Odds
      </span>
    );
  }

  const priceLabel = formatOddsLabel(decimalOdds);
  const interactive = Boolean(onClick) && !disabled && !added;

  if (!onClick) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--line)] bg-[var(--canvas)] font-bold tabular-nums text-[var(--cobalt)] ${pad} ${className}`.trim()}
      >
        {label ? <span className="font-medium text-[var(--ink)]/70">{label}</span> : null}
        <span>{priceLabel}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || added}
      aria-label={
        added
          ? `${label ? `${label} ` : ""}${priceLabel} already on slip`
          : `Add ${label ? `${label} ` : ""}${priceLabel} to slip`
      }
      className={`inline-flex w-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-bold tabular-nums transition-colors ${pad} ${
        variant === "card" ? "rounded-xl" : "rounded-full"
      } ${
        added
          ? "border-2 border-[var(--cobalt)] bg-blue-50 text-[var(--cobalt)] ring-2 ring-[var(--cobalt)]/20"
          : interactive && variant === "card"
            ? "border border-[#e2e8f0] bg-white text-[#0f172a] shadow-sm hover:border-[#2563eb] hover:bg-[#eff6ff]"
            : interactive
              ? "bg-[var(--cobalt)] text-white shadow-sm shadow-blue-600/20 hover:bg-[var(--cobalt-dark)]"
              : "border border-[var(--line)] bg-white text-[var(--muted)]"
      } ${className}`.trim()}
    >
      {label ? (
        <span className={`font-medium ${added || !interactive || variant === "card" ? "text-inherit" : "text-white/85"}`}>
          {label}
        </span>
      ) : null}
      <span>{priceLabel}</span>
    </button>
  );
}
