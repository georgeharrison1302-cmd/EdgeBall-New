import { NextResponse } from "next/server";

import { getSubscriptionAccess } from "@/utils/subscription";

export const dynamic = "force-dynamic";

/** Per-visitor membership state for the shell (header badge, upgrade CTA). */
export async function GET() {
  const access = await getSubscriptionAccess();
  return NextResponse.json(
    { unlocked: access.unlocked, status: access.status, tier: access.tier, signedIn: access.signedIn },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
