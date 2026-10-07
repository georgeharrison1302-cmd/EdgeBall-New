"use client";

import Image from "next/image";
import { useState } from "react";

type Props = {
  src?: string | null;
  alt: string;
  width: number;
  height: number;
  /** Shown as initials when src is missing or fails. */
  fallbackText?: string;
  className?: string;
  /** Extra classes for the fallback surface. */
  fallbackClassName?: string;
  /** object-fit for the image. */
  fit?: "cover" | "contain";
  /** Prefer unoptimized for API-Football CDN when needed. */
  unoptimized?: boolean;
};

/**
 * next/image wrapper that swaps to initials/placeholder on null src or load error.
 */
export function FallbackImage({
  src,
  alt,
  width,
  height,
  fallbackText = "?",
  className = "",
  fallbackClassName = "bg-[#e2e8f0] text-[#64748b]",
  fit = "contain",
  unoptimized = true,
}: Props) {
  const [failed, setFailed] = useState(false);
  const url = typeof src === "string" ? src.trim() : "";
  const showImage = Boolean(url) && !failed;

  if (!showImage) {
    return (
      <span
        role="img"
        aria-label={alt}
        title={alt}
        className={`inline-flex shrink-0 items-center justify-center font-extrabold leading-none ${fallbackClassName} ${className}`.trim()}
        style={{ width, height, fontSize: Math.max(9, Math.round(width * 0.32)) }}
      >
        {fallbackText.slice(0, 3).toUpperCase()}
      </span>
    );
  }

  return (
    <Image
      src={url}
      alt={alt}
      width={width}
      height={height}
      unoptimized={unoptimized}
      className={`shrink-0 ${fit === "cover" ? "object-cover" : "object-contain"} ${className}`.trim()}
      style={{ width, height }}
      onError={() => setFailed(true)}
    />
  );
}

export function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}
