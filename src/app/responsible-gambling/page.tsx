import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Responsible Gambling · EdgeBall",
  description: "Tools, limits, and support resources for gambling safely.",
};

export default function ResponsibleGamblingPage() {
  return (
    <LegalPage eyebrow="18+" title="Responsible Gambling" updated="October 2026">
      <LegalSection title="Bet with your head, not over it">
        <p>
          EdgeBall is an analysis tool. Betting involves real risk: model probabilities and edges
          describe likelihood, never certainty. Never bet money you cannot afford to lose, and
          never chase losses.
        </p>
      </LegalSection>
      <LegalSection title="Set limits before you start">
        <p>
          Decide your stake budget, time budget, and stop-loss before placing any bet. Use deposit
          limits, loss limits, reality checks, and time-outs offered by your bookmaker — those
          controls sit with them, since EdgeBall does not take bets.
        </p>
      </LegalSection>
      <LegalSection title="Warning signs">
        <p>
          Betting more than planned, hiding gambling from others, borrowing to bet, or gambling to
          escape problems are signs to stop and get support.
        </p>
      </LegalSection>
      <LegalSection title="Support (UK)">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>GamCare</strong> — free support and counselling, 24/7:{" "}
            <Link href="https://www.gamcare.org.uk" className="text-[#2563eb] hover:underline">
              gamcare.org.uk
            </Link>{" "}
            · 0808 8020 133
          </li>
          <li>
            <strong>BeGambleAware</strong> — advice and tools:{" "}
            <Link href="https://www.begambleaware.org" className="text-[#2563eb] hover:underline">
              begambleaware.org
            </Link>
          </li>
          <li>
            <strong>GamStop</strong> — free national self-exclusion from UK-licensed sites:{" "}
            <Link href="https://www.gamstop.co.uk" className="text-[#2563eb] hover:underline">
              gamstop.co.uk
            </Link>
          </li>
          <li>
            <strong>Gamblers Anonymous</strong> — peer support meetings:{" "}
            <Link href="https://www.gamblersanonymous.org.uk" className="text-[#2563eb] hover:underline">
              gamblersanonymous.org.uk
            </Link>
          </li>
        </ul>
      </LegalSection>
      <LegalSection title="Under-18s">
        <p>
          EdgeBall is strictly 18+. If you share a device with a minor, use filtering software such
          as NetNanny or GamBlock to block gambling-related content.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
