"use server";

import { redirect } from "next/navigation";

/** Legacy server-action entry point; pricing now posts to /api/checkout. */
export async function startProCheckout() {
  redirect("/pricing");
}
