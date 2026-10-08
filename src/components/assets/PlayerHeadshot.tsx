"use client";

import { FallbackImage, initialsFromName } from "@/components/ui/FallbackImage";
import { playerPhotoUrl } from "@/components/assets/media-urls";

type Props = {
  src?: string | null;
  playerId?: number | null;
  playerName: string;
  size?: number;
  className?: string;
};

/**
 * Circular player headshot (default 40×40). Falls back to initials.
 */
export function PlayerHeadshot({
  src,
  playerId,
  playerName,
  size = 40,
  className = "",
}: Props) {
  const resolved = src?.trim() || playerPhotoUrl(playerId);
  return (
    <FallbackImage
      src={resolved}
      alt={playerName}
      width={size}
      height={size}
      fallbackText={initialsFromName(playerName)}
      fit="cover"
      className={`overflow-hidden rounded-full ${className}`.trim()}
      fallbackClassName="rounded-full bg-[#dbeafe] text-cobalt-dark"
    />
  );
}
