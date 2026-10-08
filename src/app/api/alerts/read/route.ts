import { NextResponse } from "next/server";

import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

/** Mark every unread alert for the signed-in user as read. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { error } = await supabase
    .from("user_alerts")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
