import { NextResponse } from "next/server";

import type { SlipMarketKind } from "@/utils/betslip/checkCorrelation";
import type { UserBetLeg } from "@/utils/portfolio/types";
import { createClient } from "@/utils/supabase/server";

type BodyLeg = {
  id: string | number;
  marketName: string;
  decimalOdds: number;
  label?: string;
  match?: string;
  player?: string;
  fixtureId?: number;
  marketKind?: SlipMarketKind;
  line?: number;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: { stake?: number; currency?: string; legs?: BodyLeg[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const stake = Number(body.stake);
  const legsIn = Array.isArray(body.legs) ? body.legs : [];
  if (!Number.isFinite(stake) || stake <= 0) {
    return NextResponse.json({ error: "Stake must be positive" }, { status: 400 });
  }
  if (legsIn.length === 0) {
    return NextResponse.json({ error: "Add at least one priced leg" }, { status: 400 });
  }

  const legs: UserBetLeg[] = [];
  let combined = 1;
  for (const leg of legsIn) {
    const odd = Number(leg.decimalOdds);
    if (!Number.isFinite(odd) || odd <= 1) {
      return NextResponse.json({ error: "Every leg needs book odds > 1" }, { status: 400 });
    }
    combined *= odd;
    legs.push({
      selectionId: leg.id,
      marketName: leg.marketName,
      label: leg.label ?? leg.marketName,
      match: leg.match,
      player: leg.player,
      fixtureId: leg.fixtureId,
      marketKind: leg.marketKind,
      line: leg.line,
      decimalOdds: odd,
      result: "pending",
    });
  }

  const { data, error } = await supabase
    .from("user_bets")
    .insert({
      user_id: user.id,
      stake,
      combined_odds: combined,
      potential_return: stake * combined,
      currency: body.currency === "EUR" || body.currency === "USD" ? body.currency : "GBP",
      status: "active",
      legs,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_bets")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ bets: data ?? [] });
}
