import { NextResponse } from "next/server";

import { FREE_WATCH_LIMIT } from "@/lib/alerts/rules";
import { getSubscriptionAccess } from "@/utils/subscription";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

type Body = { kind?: string; entityId?: number; label?: string; href?: string };

function parse(body: Body) {
  const kind = body.kind === "team" || body.kind === "fixture" ? body.kind : null;
  const entityId = Number(body.entityId);
  if (!kind || !Number.isInteger(entityId) || entityId <= 0) return null;
  return { kind, entityId };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ items: [], signedIn: false });
  const { data, error } = await supabase
    .from("user_watchlist")
    .select("kind, entity_id")
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    signedIn: true,
    items: (data ?? []).map((row) => ({ kind: row.kind, entityId: Number(row.entity_id) })),
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Body;
  const target = parse(body);
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 120) : "";
  const href = typeof body.href === "string" && body.href.startsWith("/") && !body.href.startsWith("//")
    ? body.href.slice(0, 200)
    : "";
  if (!target || !label || !href) return NextResponse.json({ error: "Invalid watch item" }, { status: 400 });

  const access = await getSubscriptionAccess();
  if (!access.unlocked) {
    const { count } = await supabase
      .from("user_watchlist")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if ((count ?? 0) >= FREE_WATCH_LIMIT) {
      return NextResponse.json(
        { error: `Free accounts can follow ${FREE_WATCH_LIMIT} items. Upgrade for unlimited follows and alerts.`, upgrade: true },
        { status: 402 },
      );
    }
  }

  const { error } = await supabase.from("user_watchlist").upsert(
    { user_id: user.id, kind: target.kind, entity_id: target.entityId, label, href },
    { onConflict: "user_id,kind,entity_id", ignoreDuplicates: true },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const target = parse((await request.json().catch(() => ({}))) as Body);
  if (!target) return NextResponse.json({ error: "Invalid watch item" }, { status: 400 });

  const { error } = await supabase
    .from("user_watchlist")
    .delete()
    .eq("user_id", user.id)
    .eq("kind", target.kind)
    .eq("entity_id", target.entityId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
