"use client";

import { useState } from "react";

import { splitMatch } from "@/utils/match-name";

// Presentational media with bulletproof fallbacks. No fetching beyond the <img> itself.

type Size = "sm" | "md" | "lg";

const AVATAR_SIZE: Record<Size, string> = {
  sm: "h-6 w-6 text-[9px]",
  md: "h-9 w-9 text-xs",
  lg: "h-12 w-12 text-sm",
};

const BADGE_SIZE: Record<Size, string> = {
  sm: "h-5 w-5 text-[8px]",
  md: "h-8 w-8 text-[10px]",
  lg: "h-11 w-11 text-xs",
};

/** "Bukayo Saka" -> "BS", "Vinicius Jr" -> "VJ", "Rodri" -> "RO" */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "Arsenal" -> "ARS", "Man City" -> "MAN" */
export function teamCode(name: string) {
  return (
    name
      .replace(/[^A-Za-z]/g, "")
      .slice(0, 3)
      .toUpperCase() || "?"
  );
}

export function PlayerAvatar({
  srcUrl,
  playerName,
  size = "md",
  className = "",
}: {
  srcUrl?: string | null;
  playerName: string;
  size?: Size;
  className?: string;
}) {
  return (
    <Media
      srcUrl={srcUrl}
      label={playerName}
      sizeClass={AVATAR_SIZE[size]}
      shape="rounded-full"
      fit="object-cover"
      fallbackClass="bg-blue-100 text-blue-700"
      fallbackText={initials(playerName)}
      className={className}
    />
  );
}

export function TeamBadge({
  srcUrl,
  teamName,
  size = "md",
  className = "",
}: {
  srcUrl?: string | null;
  teamName: string;
  size?: Size;
  className?: string;
}) {
  return (
    <Media
      srcUrl={srcUrl}
      label={teamName}
      sizeClass={BADGE_SIZE[size]}
      shape="rounded-md"
      fit="object-contain"
      fallbackClass="bg-gray-100 text-gray-500 tracking-wide"
      fallbackText={teamCode(teamName)}
      className={className}
    />
  );
}

/**
 * Shared renderer. The fallback is always painted underneath, so there is never
 * an empty box while the image loads; the <img> fades in on top once ready and
 * is dropped entirely if it fails.
 */
function Media({
  srcUrl,
  label,
  sizeClass,
  shape,
  fit,
  fallbackClass,
  fallbackText,
  className,
}: {
  srcUrl?: string | null;
  label: string;
  sizeClass: string;
  shape: string;
  fit: string;
  fallbackClass: string;
  fallbackText: string;
  className: string;
}) {
  const [imgError, setImgError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showImage = Boolean(srcUrl) && !imgError;

  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      className={`relative shrink-0 overflow-hidden ${shape} ${sizeClass} ${className}`}
    >
      <div
        aria-hidden="true"
        className={`flex h-full w-full items-center justify-center ${shape} font-bold leading-none ${fallbackClass}`}
      >
        {fallbackText}
      </div>
      {showImage ? (
        <img
          src={srcUrl as string}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setImgError(true)}
          className={`absolute inset-0 h-full w-full ${fit} transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      ) : null}
    </div>
  );
}

/** Two overlapping badges for a "Home vs Away" matchup. */
export function MatchupBadges({
  match,
  homeTeamImg,
  awayTeamImg,
  size = "md",
  dark = false,
}: {
  match: string;
  homeTeamImg?: string | null;
  awayTeamImg?: string | null;
  size?: Size;
  /** Match the ring to a dark surface (e.g. the betslip). */
  dark?: boolean;
}) {
  const [home, away] = splitMatch(match);
  const overlap = size === "sm" ? "-ml-1.5" : "-ml-2";
  const ring = dark ? "ring-2 ring-slate-900" : "ring-2 ring-white";
  return (
    <div className="flex shrink-0 items-center">
      <TeamBadge
        srcUrl={homeTeamImg}
        teamName={home}
        size={size}
        className={`z-10 ${ring}`}
      />
      <TeamBadge
        srcUrl={awayTeamImg}
        teamName={away}
        size={size}
        className={`${overlap} ${ring}`}
      />
    </div>
  );
}

/** "Arsenal vs Chelsea" -> ["Arsenal", "Chelsea"] */
export { splitMatch } from "@/utils/match-name";
