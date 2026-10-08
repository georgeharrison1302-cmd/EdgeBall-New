"use client";

import { FallbackImage, initialsFromName } from "@/components/ui/FallbackImage";
import { teamLogoUrl } from "@/components/assets/media-urls";

type Props = {
  src?: string | null;
  teamId?: number | null;
  teamName: string;
  size?: number;
  className?: string;
};

/**
 * Team crest / badge (default 32×32, rounded-md). Falls back to initials.
 */
export function TeamBadge({
  src,
  teamId,
  teamName,
  size = 32,
  className = "",
}: Props) {
  const resolved = src?.trim() || teamLogoUrl(teamId);
  const code =
    teamName.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() ||
    initialsFromName(teamName);

  return (
    <FallbackImage
      src={resolved}
      alt={teamName}
      width={size}
      height={size}
      fallbackText={code}
      fit="contain"
      className={`overflow-hidden rounded-md ${className}`.trim()}
      fallbackClassName="rounded-md bg-[#f1f5f9] text-muted"
    />
  );
}
