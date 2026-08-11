import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ThemeToggleButton } from "@/components/ui/ThemeToggle";
import { AuthHeroCard } from "@/components/marketing/AuthHeroCard";
import { MarketingBrandLogo } from "@/components/marketing/MarketingBrandLogo";
import { money } from "@/lib/format";

const NAV_LINKS = [
  { href: "#features", label: "What it does" },
  { href: "#scorecard", label: "Scorecard" },
  { href: "#import", label: "Import" },
];

const TRACKS = ["Banking", "Investment", "Retirement", "Property", "Loans", "Credit cards"];

const FEATURES = [
  {
    title: "A Financial Health Scorecard",
    body: "Savings rate, emergency runway, debt-to-income, financial independence and more, each measured against your custom threshold with the formula in plain sight.",
  },
  {
    title: "Planning Calculators",
    body: "Retirement, house affordability, loan payoff and more — running on your real balances rather than numbers you retype. Save a plan and hold it beside the last one.",
  },
  {
    title: "One Complete Picture",
    body: "Account balances and transactions blend into a single view of your household's finances — so net worth, cash flow and every scorecard metric reflect the whole picture, not just one account at a time.",
  },
  {
    title: "Your Data, Your Way",
    body: "No bank screen-scraping and nothing sold on. You enter what you want tracked, or import it from a file you already have with the security of complete anonymity.",
  },
];

const SCORECARD_PREVIEW = [
  { label: "Savings rate", value: "22%", target: "Target 15% or higher", pct: 73, color: "var(--nw-green)" },
  { label: "Emergency runway", value: "2.4 mo", target: "Target 3 to 6 months of expenses", pct: 40, color: "var(--nw-amber)" },
  { label: "Debt-to-income", value: "18%", target: "Target below 36%", pct: 82, color: "var(--nw-green)" },
];

const IMPORT_PREVIEW = [
  { merchant: "Whole Foods Market", category: "Groceries", amount: -84.12 },
  { merchant: "Employer payroll", category: "Income", amount: 2410 },
  { merchant: "Shell #4412", category: "Transportation", amount: -52.8 },
];

export default function MarketingPage() {
  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-40 border-b border-nw-border bg-nw-bg nw-marketing-green">
        <div className="max-w-[1280px] mx-auto px-6 md:px-12 py-5 flex items-center justify-between gap-6">
          <MarketingBrandLogo variant="wordmark" width={140} height={29} />
          <nav className="hidden sm:flex items-center gap-8 text-sm">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="text-nw-muted hover:text-nw-text">
                {link.label}
              </a>
            ))}
            <Link href="/login" className="text-nw-green font-semibold">
              Sign in
            </Link>
            <ThemeToggleButton />
          </nav>
          <div className="flex sm:hidden items-center gap-3">
            <ThemeToggleButton className="px-1.5" />
            <Link href="/login" className="text-nw-green font-semibold text-sm">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <section className="nw-marketing-white">
        <div className="max-w-[1280px] mx-auto px-6 md:px-12 py-16 md:py-24 grid grid-cols-1 md:grid-cols-[1.05fr_0.95fr] gap-12 md:gap-16 items-center">
          <div className="order-2 md:order-1 flex flex-col gap-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-nw-green-line bg-nw-green-tint px-4 py-1.5 text-xs uppercase tracking-wider text-nw-mint font-semibold self-start">
              Net worth · Account balances · Transactions
            </div>
            <h1 className="max-w-2xl text-3xl md:text-5xl leading-tight tracking-tight">
              Know exactly what your household is worth.
            </h1>
            <p className="max-w-lg text-lg text-nw-muted leading-relaxed">
              NestWorth tracks every account you own and owe, scores your financial health
              against published thresholds, and shows the trend over time. Bring your budget
              history with you from EveryDollar.
            </p>
          </div>
          <div className="hidden md:flex md:order-2 md:justify-end">
            <AuthHeroCard />
          </div>
        </div>
      </section>

      <section className="border-t border-b border-nw-border bg-nw-rail nw-marketing-green">
        <div className="max-w-[1280px] mx-auto px-6 md:px-12 py-5 flex items-center gap-6 flex-wrap text-sm text-nw-muted">
          <span className="uppercase tracking-wider text-xs font-semibold text-nw-text">Tracks</span>
          {TRACKS.map((t, i) => (
            <span key={t} className="flex items-center gap-6">
              {i > 0 && <span className="text-nw-border">·</span>}
              {t}
            </span>
          ))}
        </div>
      </section>

      <section id="features" className="max-w-[1280px] mx-auto px-6 md:px-12 py-16 md:py-24">
        <h2 className="max-w-xl text-3xl md:text-4xl tracking-tight">
          Everything in one ledger, scored and charted.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
          {FEATURES.map((f) => (
            <div key={f.title} className="nw-elevate rounded-2xl border border-nw-border bg-nw-surface p-8 flex flex-col gap-3">
              <div className="text-xl">{f.title}</div>
              <p className="text-nw-muted leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="scorecard" className="border-t border-nw-border bg-nw-rail">
        <div className="max-w-[1280px] mx-auto px-6 md:px-12 py-16 md:py-24 grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
          <div>
            <div className="text-xs uppercase tracking-wider text-nw-green font-semibold">The scorecard</div>
            <h2 className="text-3xl md:text-4xl tracking-tight mt-3">A number, and the reason for it.</h2>
            <p className="text-lg text-nw-muted leading-relaxed mt-4">
              Every metric shows its formula, its inputs and the threshold it is measured
              against. Nothing is a black box, and nothing tells you what to do with your money.
            </p>
          </div>
          <div className="nw-elevate rounded-2xl border border-nw-border bg-nw-surface p-7 flex flex-col gap-5">
            {SCORECARD_PREVIEW.map((m) => (
              <div key={m.label}>
                <div className="flex justify-between text-sm">
                  <span>{m.label}</span>
                  <span className="font-semibold" style={{ color: m.color }}>
                    {m.value}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-nw-track mt-2 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${m.pct}%`, background: m.color }} />
                </div>
                <div className="text-xs text-nw-muted mt-1.5">{m.target}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="import" className="max-w-[1280px] mx-auto px-6 md:px-12 py-16 md:py-24 grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
        <div className="nw-elevate rounded-2xl border border-nw-border bg-nw-surface p-6 order-2 md:order-1">
          <div className="flex justify-between items-baseline mb-3">
            <div className="text-base font-semibold">Imported transactions</div>
            <div className="text-xs text-nw-muted">142 rows · 6 duplicates skipped</div>
          </div>
          <div className="grid grid-cols-[1fr_110px_100px] gap-3 text-[11px] uppercase tracking-wider text-nw-muted font-semibold px-2 pb-2 border-b border-nw-border">
            <div>Merchant</div>
            <div>Category</div>
            <div className="text-right">Amount</div>
          </div>
          {IMPORT_PREVIEW.map((row) => (
            <div
              key={row.merchant}
              className="grid grid-cols-[1fr_110px_100px] gap-3 px-2 py-3 border-b border-nw-border last:border-b-0 text-sm"
            >
              <div>{row.merchant}</div>
              <div className="text-nw-muted">{row.category}</div>
              <div className={"text-right " + (row.amount > 0 ? "text-nw-green" : "")}>
                {row.amount > 0 ? "+" : ""}
                {money(row.amount, { maximumFractionDigits: 2 })}
              </div>
            </div>
          ))}
        </div>
        <div className="order-1 md:order-2">
          <div className="text-xs uppercase tracking-wider text-nw-green font-semibold">Import from EveryDollar</div>
          <h2 className="text-3xl md:text-4xl tracking-tight mt-3">Bring your history with you.</h2>
          <p className="text-lg text-nw-muted leading-relaxed mt-4">
            Export your transactions as CSV and drop the file in. Rows are fingerprinted on
            import, so re-importing an overlapping export adds nothing twice.
          </p>
        </div>
      </section>

      <section className="border-t border-nw-border bg-nw-green-tint nw-marketing-green-cta">
        <div className="max-w-[1280px] mx-auto px-6 md:px-12 py-16 flex items-center justify-between gap-8 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-xl md:text-3xl tracking-tight whitespace-normal md:whitespace-nowrap">
              Know your net worth. Grow it with confidence.
            </h2>
            <p className="text-nw-mint mt-3 whitespace-normal md:whitespace-nowrap">
              Track your assets, debts, and progress in one private, simple dashboard.
            </p>
          </div>
          <Link href="/signup">
            <Button variant="primary" className="nw-cta-button px-8 py-4 text-base whitespace-nowrap">
              Create your household
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-nw-border bg-nw-bg nw-marketing-green">
        <div className="max-w-[1280px] mx-auto px-6 md:px-12 py-10 flex items-center justify-between gap-8 flex-wrap">
          <div className="flex items-center gap-4">
            <MarketingBrandLogo variant="wordmark" width={130} height={27} />
            <span className="text-sm text-nw-muted">Where every dollar becomes your nest egg</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-nw-muted">
            <a href="#features" className="text-nw-muted hover:text-nw-text">
              What it does
            </a>
            <Link href="/login" className="text-nw-muted hover:text-nw-text">
              Sign in
            </Link>
            <ThemeToggleButton />
            <span>© 2026 NestWorth</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
