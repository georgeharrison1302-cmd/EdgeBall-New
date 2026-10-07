import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service · EdgeBall",
  description: "The terms that govern your use of EdgeBall.",
};

export default function TermsPage() {
  return (
    <LegalPage eyebrow="Terms" title="Terms of Service" updated="October 2026">
      <LegalSection title="1. Who we are">
        <p>
          EdgeBall is a football statistics and betting-analysis service operated at
          edgeball.co.uk. EdgeBall is <strong>not a bookmaker</strong> and does not accept, place,
          or settle bets.
        </p>
      </LegalSection>
      <LegalSection title="2. Eligibility">
        <p>
          You must be 18 or older and legally permitted to view gambling-related content in your
          jurisdiction. By creating an account you confirm you meet these requirements.
        </p>
      </LegalSection>
      <LegalSection title="3. The service">
        <p>
          EdgeBall provides stored bookmaker prices, historical statistics, model probabilities,
          and calculated edges for informational purposes. Prices shown are captured from
          third-party odds feeds and may be delayed, suspended, or withdrawn by the bookmaker at
          any time. Always confirm the live price with the bookmaker before placing a bet.
        </p>
        <p>
          Model probabilities and edge figures are statistical estimates. They are not guarantees
          of outcome and are not financial advice.
        </p>
      </LegalSection>
      <LegalSection title="4. Subscriptions and billing">
        <p>
          Paid plans (Pro and Premium) are recurring subscriptions billed through Stripe. You can
          cancel at any time via the Billing Portal; access continues until the end of the paid
          period. Promotional pricing (such as Founders Club discounts) applies for as long as the
          subscription remains active; cancelling forfeits the promotional rate.
        </p>
        <p>
          Refunds are handled case by case — contact support within 14 days of a charge if you
          believe it was made in error.
        </p>
      </LegalSection>
      <LegalSection title="5. Acceptable use">
        <p>
          Do not scrape, resell, or bulk-export our data; share accounts; or use the service for
          unlawful gambling activity. We may suspend accounts that breach these terms.
        </p>
      </LegalSection>
      <LegalSection title="6. Limitation of liability">
        <p>
          To the extent permitted by law, EdgeBall is not liable for betting losses, decisions made
          using our statistics, or inaccuracies in third-party data. The service is provided as is
          without warranties of uninterrupted availability or error-free data.
        </p>
      </LegalSection>
      <LegalSection title="7. Changes">
        <p>
          We may update these terms as the product evolves. Continued use after changes take effect
          constitutes acceptance.
        </p>
      </LegalSection>
      <LegalSection title="8. Contact">
        <p>
          Questions about these terms: <strong>support@edgeball.co.uk</strong>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
