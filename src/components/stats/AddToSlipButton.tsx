"use client";

import type { SlipMarketKind } from "@/utils/betslip/checkCorrelation";

import { useBetSlip, type BetSlipSelection } from "./BetSlipContext";
import { OddsPill } from "./OddsPill";
import { isPriced, type DecimalOdds } from "./types";

/**
 * Adds a priced selection to the active BetSlip context via OddsPill.
 * Never invents a price.
 */
export function AddToSlipButton({
  selectionId,
  marketName,
  decimalOdds,
  label,
  match,
  player,
  fixtureId,
  marketKind,
  line,
  /** Optional override when the parent owns slip state instead of BetSlipProvider. */
  onAdd,
  added: addedOverride,
  size = "md",
}: {
  selectionId: string | number;
  marketName: string;
  decimalOdds?: DecimalOdds;
  label?: string;
  match?: string;
  player?: string;
  fixtureId?: number;
  marketKind?: SlipMarketKind;
  line?: number;
  onAdd?: () => void;
  added?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const slip = useBetSlip();
  const priced = isPriced(decimalOdds);
  const added = addedOverride ?? slip?.hasLeg(selectionId) ?? false;

  if (!priced) {
    return <OddsPill decimalOdds={null} size={size} />;
  }

  function handleClick() {
    if (added) return;
    if (onAdd) {
      onAdd();
      return;
    }
    const selection: BetSlipSelection = {
      id: selectionId,
      marketName,
      decimalOdds: decimalOdds!,
      label: label ?? marketName,
      match,
      player,
      fixtureId,
      marketKind,
      line,
    };
    slip?.addLeg(selection);
  }

  return (
    <OddsPill
      label={label}
      decimalOdds={decimalOdds}
      onClick={handleClick}
      added={added}
      disabled={!onAdd && !slip}
      size={size}
    />
  );
}
