"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { SlipMarketKind } from "@/utils/betslip/checkCorrelation";

export type BetSlipSelection = {
  id: string | number;
  marketName: string;
  decimalOdds: number | null;
  label?: string;
  match?: string;
  player?: string;
  fixtureId?: number;
  marketKind?: SlipMarketKind;
  line?: number;
};

type BetSlipContextValue = {
  legs: BetSlipSelection[];
  open: boolean;
  setOpen: (open: boolean) => void;
  addLeg: (selection: BetSlipSelection) => void;
  removeLeg: (id: string | number) => void;
  clear: () => void;
  hasLeg: (id: string | number) => boolean;
  totalOdds: number | null;
};

const STORAGE_KEY = "edgeball.betslip.v1";

const BetSlipContext = createContext<BetSlipContextValue | null>(null);

function isPriced(odds: number | null | undefined) {
  return odds != null && Number.isFinite(odds) && odds > 1;
}

function readStoredLegs(): BetSlipSelection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BetSlipSelection[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((leg) => isPriced(leg.decimalOdds));
  } catch {
    return [];
  }
}

export function BetSlipProvider({ children }: { children: ReactNode }) {
  const [legs, setLegs] = useState<BetSlipSelection[]>([]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLegs(readStoredLegs());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legs));
    } catch {
      /* ignore quota */
    }
  }, [legs, hydrated]);

  const addLeg = useCallback((selection: BetSlipSelection) => {
    if (!isPriced(selection.decimalOdds)) return;
    setLegs((current) => {
      if (current.some((leg) => leg.id === selection.id)) return current;
      return [...current, selection];
    });
    setOpen(true);
  }, []);

  const removeLeg = useCallback((id: string | number) => {
    setLegs((current) => current.filter((leg) => leg.id !== id));
  }, []);

  const clear = useCallback(() => setLegs([]), []);

  const totalOdds = useMemo(() => {
    if (legs.length === 0) return null;
    return legs.reduce((product, leg) => product * (leg.decimalOdds as number), 1);
  }, [legs]);

  const value = useMemo<BetSlipContextValue>(
    () => ({
      legs,
      open,
      setOpen,
      addLeg,
      removeLeg,
      clear,
      hasLeg: (id) => legs.some((leg) => leg.id === id),
      totalOdds,
    }),
    [legs, open, addLeg, removeLeg, clear, totalOdds],
  );

  return <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>;
}

export function useBetSlip() {
  return useContext(BetSlipContext);
}
