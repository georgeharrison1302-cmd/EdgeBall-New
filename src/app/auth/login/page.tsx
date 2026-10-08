import Link from "next/link";

import { AuthPanel } from "@/components/auth/AuthPanel";

export const metadata = {
  title: "Sign in · EdgeBall",
  description: "Sign in to EdgeBall with email, magic link, or Google.",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = next?.startsWith("/") ? next : "/portfolio";

  return (
    <main className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <p className="text-xs font-extrabold tracking-wide text-cobalt uppercase">Account</p>
      <h1 className="mt-1 text-2xl font-bold text-ink">Sign in or create an account</h1>
      <p className="mt-2 text-sm text-muted">
        Save slips to your portfolio, manage billing, and unlock Pro analysis.
      </p>
      <div className="mt-8 rounded-2xl border border-line bg-white p-6 shadow-sm">
        <AuthPanel next={destination} />
      </div>
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/" className="font-semibold text-cobalt">
          Back to fixtures
        </Link>
      </p>
    </main>
  );
}
