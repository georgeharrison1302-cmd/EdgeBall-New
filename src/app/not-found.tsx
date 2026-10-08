import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="text-xs font-extrabold tracking-wide text-cobalt uppercase">404</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-ink">Page not found</h1>
      <p className="mt-2 text-sm text-muted">
        That page does not exist or the fixture is no longer stored.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-cobalt px-5 py-2.5 text-sm font-bold text-white hover:bg-cobalt-dark"
      >
        Back to fixtures
      </Link>
    </main>
  );
}
