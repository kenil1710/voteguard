import type { Metadata } from "next";
import Link from "next/link";
import { ProposalBrowser } from "@/components/ProposalBrowser";
import { Empty } from "@/components/ui";
import { getProposals, getStats } from "@/lib/contract";
import { configured } from "@/lib/genlayer";

export const metadata: Metadata = {
  title: "Proposals",
  description:
    "Every DAO proposal VoteGuard has assessed, filterable by DAO, verdict and platform.",
};

export const revalidate = 60;

export default async function ProposalsPage() {
  const [{ rows, total }, stats] = await Promise.all([
    getProposals(0, 100),
    getStats(),
  ]);

  return (
    <>
      <header className="mb-8">
        <div className="label mb-2">Registry</div>
        <h1 className="font-display text-4xl tracking-tight text-white">
          Assessed proposals
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-300">
          {total} proposal{total === 1 ? "" : "s"} across{" "}
          {Number(stats?.daos_tracked ?? 0)} DAO
          {Number(stats?.daos_tracked ?? 0) === 1 ? "" : "s"}. Every row was
          agreed by five independent validators and recomputes from its own
          stored evidence.
        </p>
      </header>

      {!configured ? (
        <Empty title="No contract configured">
          Set <code className="font-mono">NEXT_PUBLIC_VOTEGUARD</code> to a
          deployed VoteGuard address.
        </Empty>
      ) : rows.length === 0 ? (
        <Empty title="Nothing assessed yet">
          The contract is live and has no assessments on record.{" "}
          <Link href="/analyze" className="font-semibold text-royal-300 hover:text-royal-200">
            Submit the first proposal →
          </Link>
        </Empty>
      ) : (
        <ProposalBrowser rows={rows} />
      )}
    </>
  );
}
