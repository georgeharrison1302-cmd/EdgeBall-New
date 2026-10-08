"use client";

import { useSyncExternalStore } from "react";

import type { SubscriptionTier } from "@/types/billing";

export type AccessState = {
  unlocked: boolean;
  status: "active" | "inactive" | "past_due" | null;
  tier: SubscriptionTier | null;
  signedIn: boolean;
};

const STORAGE_KEY = "edgeball-access-v1";
/** Rendered on the server and for first-time visitors: assume a free guest. */
const GUEST: AccessState = { unlocked: false, status: null, tier: null, signedIn: false };

let snapshot: AccessState | null = null;
let started = false;
const listeners = new Set<() => void>();

function read(): AccessState {
  if (snapshot) return snapshot;
  try {
    const cached = window.localStorage.getItem(STORAGE_KEY);
    snapshot = cached ? (JSON.parse(cached) as AccessState) : GUEST;
  } catch {
    snapshot = GUEST;
  }
  return snapshot;
}

function publish(next: AccessState) {
  const current = read();
  if (JSON.stringify(current) === JSON.stringify(next)) return;
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((listener) => listener());
}

/** Re-read membership from the server (call after sign-in/out or checkout). */
export async function refreshAccess() {
  try {
    const response = await fetch("/api/access", { cache: "no-store" });
    if (response.ok) publish((await response.json()) as AccessState);
  } catch {
    /* offline: keep the last known state */
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    void refreshAccess();
    window.addEventListener("focus", () => void refreshAccess());
  }
  return () => {
    listeners.delete(listener);
  };
}

export function useAccess(): AccessState {
  return useSyncExternalStore(subscribe, read, () => GUEST);
}
