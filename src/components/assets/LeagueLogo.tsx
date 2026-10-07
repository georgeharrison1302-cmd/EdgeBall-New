"use client";

import { FallbackImage, initialsFromName } from "@/components/ui/FallbackImage";
import { leagueLogoUrl } from "@/components/assets/media-urls";

type Props = {
  src?: string | null;
  leagueId?: number | null;
  leagueName: string;
  size?: number;
  className?: string;
};

/**
 * League logo (default 24×24, transparent PNG friendly). Falls back to initials.
 */
export function LeagueLogo({
  src,
  leagueId,
  leagueName,
  size = 24,
  className = "",
}: Props) {
  const resolved = src?.trim() || leagueLogoUrl(leagueId);
  return (
    <FallbackImage
      src={resolved}
      alt={leagueName}
      width={size}
      height={size}
      fallbackText={initialsFromName(leagueName)}
      fit="contain"
      className={className}
      fallbackClassName="rounded-sm bg-transparent text-[#94a3b8]"
    />
  );
}
