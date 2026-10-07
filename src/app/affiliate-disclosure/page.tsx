import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Affiliate Disclosure · EdgeBall",
  description: "How EdgeBall is funded and how bookmaker links work.",
};

export default function AffiliateDisclosurePage() {
  return (
    <LegalPage eyebrow="Disclosure" title="Affiliate Disclosure" updated="October 2026">
      <LegalSection title="How EdgeBall makes money">
        <p>
          EdgeBall is funded by Pro and Premium subscriptions. We may also earn commission when you
          follow a link to a bookmaker and open an account or place a bet. This never changes the
          price you see or the terms you get.
        </p>
      </LegalSection>
      <LegalSection title="Editorial independence">
        <p>
          Odds displayed are stored prices captured from our odds feed — they are not written or
          adjusted by us. Model probabilities, edges, and hit rates are computed from stored data
          and are not influenced by any commercial relationship.
        </p>
      </LegalSection>
      <LegalSection title="No guarantee">
        <p>
          Affiliate relationships do not affect rankings, edges, or which bookmaker&apos;s prices we
          store. Where a bookmaker link exists it may be an affiliate link; where none exists we
          show the price without a link.
        </p>
      </LegalSection>
      <LegalSection title="Questions">
        <p>
          If anything here is unclear, email <strong>support@edgeball.co.uk</strong>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
