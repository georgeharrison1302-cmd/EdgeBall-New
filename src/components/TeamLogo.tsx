"use client";

import Image from "next/image";
import { useState } from "react";

export function TeamLogo({ src, name, size = 20 }: { src: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  if (!src || failed) {
    return (
      <span
        className="flex flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[9px] font-bold text-slate-500"
        style={{ width: size, height: size }}
      >
        {initials}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      className="flex-shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}
