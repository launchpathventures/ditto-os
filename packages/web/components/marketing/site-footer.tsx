import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-[960px] px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <p className="text-lg font-bold text-vivid">ditto</p>
            <p className="mt-2 text-sm text-text-muted">
              AI that remembers and improves.
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Product
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Link href="/how-it-works" className="text-sm text-text-secondary hover:text-vivid">
                How It Works
              </Link>
              <Link href="/chief-of-staff" className="text-sm text-text-secondary hover:text-vivid">
                Chief of Staff
              </Link>
              <Link href="/network" className="text-sm text-text-secondary hover:text-vivid">
                Network
              </Link>
              <Link href="/pricing" className="text-sm text-text-secondary hover:text-vivid">
                Pricing
              </Link>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Company
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Link href="/about" className="text-sm text-text-secondary hover:text-vivid">
                About
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <p className="text-xs text-text-muted">
            &copy; {new Date().getFullYear()} Ditto
          </p>
        </div>
      </div>
    </footer>
  );
}
