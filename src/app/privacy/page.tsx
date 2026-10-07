import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy · EdgeBall",
  description: "How EdgeBall collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Privacy" title="Privacy Policy" updated="October 2026">
      <LegalSection title="1. Data we collect">
        <p>
          <strong>Account data:</strong> email address, authentication provider (password, magic
          link, or Google), and display metadata, processed by Supabase Auth.
        </p>
        <p>
          <strong>Billing data:</strong> subscription status, plan tier, Stripe customer ID, and
          renewal dates. Card details are handled entirely by Stripe — we never see or store them.
        </p>
        <p>
          <strong>Product data:</strong> bet slips you save, portfolio history, display preferences
          (odds format, currency, timezone), and feature usage needed to operate the service.
        </p>
      </LegalSection>
      <LegalSection title="2. How we use it">
        <p>
          To authenticate you, run your subscription, grade your saved slips, personalise the
          product, and send essential account emails (confirmation, sign-in, recovery). We do not
          sell your data.
        </p>
      </LegalSection>
      <LegalSection title="3. Third-party processors">
        <p>
          Supabase (authentication, database), Stripe (payments, billing portal), and our hosting
          provider. Each processes data under its own privacy terms and only as needed to deliver
          the service.
        </p>
      </LegalSection>
      <LegalSection title="4. Retention and deletion">
        <p>
          Account and bet data are kept while your account is active. You can request deletion by
          emailing support@edgeball.co.uk — we remove your account, slips, and subscription record,
          subject to records we must legally retain (e.g. Stripe transaction history).
        </p>
      </LegalSection>
      <LegalSection title="5. Cookies">
        <p>
          We use strictly necessary cookies for authentication sessions and display preferences.
          We do not run advertising trackers.
        </p>
      </LegalSection>
      <LegalSection title="6. Your rights (UK GDPR)">
        <p>
          You can request access, correction, export, or deletion of your personal data, and object
          to certain processing. Contact support@edgeball.co.uk and we will respond within 30 days.
          You can also complain to the ICO.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
