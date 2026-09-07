import Link from "next/link";
import { NETWORK, VOTEGUARD, explorerAddress, configured } from "@/lib/genlayer";
import { shortAddress } from "@/lib/format";
import { ConnectWallet } from "./ConnectWallet";

function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path
        d="M16 4 26 8v7.8c0 6-4 10.5-10 12.6-6-2.1-10-6.6-10-12.6V8l10-4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M11.4 16.1 14.6 19.5 20.8 12.6"
        fill="none"
        stroke="var(--color-verdict-good)"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5">
      <Mark className={`${small ? "h-6 w-6" : "h-7 w-7"} text-royal-400`} />
      <span
        className={`font-display tracking-tight text-ink-100 ${small ? "text-lg" : "text-xl"}`}
      >
        Vote<span className="text-royal-400">Guard</span>
      </span>
    </Link>
  );
}

/**
 * The marketing header names no network and carries no address. The split is
 * structural: the landing page has no import path to chain state at all, so it
 * cannot half-render because an RPC was slow.
 */
export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-700/40 bg-ink-900/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Wordmark />
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/proposals"
            className="rounded px-3 py-2 text-ink-300 transition-colors hover:text-white"
          >
            Proposals
          </Link>
          <Link
            href="/docs"
            className="rounded px-3 py-2 text-ink-300 transition-colors hover:text-white"
          >
            Methodology
          </Link>
          <Link
            href="/analyze"
            className="ml-1 rounded-md bg-royal-500 px-3.5 py-2 font-semibold text-white transition-colors hover:bg-royal-400"
          >
            Analyse a proposal
          </Link>
        </nav>
      </div>
    </header>
  );
}

const NAV = [
  { href: "/analyze", label: "Analyse" },
  { href: "/proposals", label: "Proposals" },
  { href: "/docs", label: "Methodology" },
];

/**
 * Every page that can touch the chain carries this: the network it is pointed
 * at, the contract it reads, and the wallet control. The badge and the address
 * stay server-rendered — only <ConnectWallet /> needs the browser.
 */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-700/40 bg-ink-900/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5">
        <Wordmark small />
        <nav className="hidden items-center gap-1 text-sm sm:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded px-3 py-2 text-ink-300 transition-colors hover:text-white"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          <span className="hidden rounded-full border border-royal-500/40 bg-royal-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-royal-300 sm:inline-block">
            {NETWORK}
          </span>
          {configured ? (
            <a
              href={explorerAddress(VOTEGUARD)}
              target="_blank"
              rel="noreferrer"
              className="hidden font-mono text-[11px] text-ink-400 transition-colors hover:text-ink-200 lg:inline-block"
              title={VOTEGUARD}
            >
              {shortAddress(VOTEGUARD)}
            </a>
          ) : null}
          <ConnectWallet />
        </div>
      </div>
      <MobileNav />
    </header>
  );
}

/** The nav the header drops below `sm`, kept reachable rather than hidden. */
function MobileNav() {
  return (
    <nav className="flex items-center gap-1 border-t border-ink-700/40 px-3 py-1.5 text-sm sm:hidden">
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className="rounded px-2.5 py-1.5 text-ink-300 transition-colors hover:text-white"
        >
          {n.label}
        </Link>
      ))}
      <span className="ml-auto rounded-full border border-royal-500/40 bg-royal-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-royal-300">
        {NETWORK}
      </span>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="mt-20 border-t border-ink-700/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Wordmark small />
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-400">
            An on-chain risk oracle for DAO governance proposals. Five GenLayer
            validators read the proposal independently and agree on one
            assessment; every stored number recomputes from the evidence beside
            it.
          </p>
        </div>
        <div>
          <div className="label mb-3">Product</div>
          <ul className="space-y-2 text-sm text-ink-300">
            <li>
              <Link href="/analyze" className="hover:text-white">
                Analyse a proposal
              </Link>
            </li>
            <li>
              <Link href="/proposals" className="hover:text-white">
                Browse assessments
              </Link>
            </li>
            <li>
              <Link href="/docs" className="hover:text-white">
                Scoring methodology
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="label mb-3">On chain</div>
          <ul className="space-y-2 text-sm text-ink-300">
            <li className="capitalize">Network: {NETWORK}</li>
            {configured ? (
              <li>
                <a
                  href={explorerAddress(VOTEGUARD)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs hover:text-white"
                >
                  {shortAddress(VOTEGUARD)}
                </a>
              </li>
            ) : null}
            <li>
              <Link href="/docs#integrate" className="hover:text-white">
                Integration guide
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-700/40 py-5 text-center text-xs text-ink-500">
        VoteGuard is an analysis tool, not financial or governance advice. Read
        the proposal.
      </div>
    </footer>
  );
}
