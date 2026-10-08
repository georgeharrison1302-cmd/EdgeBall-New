"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="text-xs font-extrabold tracking-wide text-cobalt uppercase">Something went wrong</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-ink">We could not load this page</h1>
      <p className="mt-2 text-sm text-muted">
        A data source did not respond. Nothing was lost — try again in a moment.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-full bg-cobalt px-5 py-2.5 text-sm font-bold text-white hover:bg-cobalt-dark"
      >
        Try again
      </button>
    </main>
  );
}
