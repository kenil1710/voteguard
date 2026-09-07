/**
 * The browser half of the chain connection. Deliberately a separate file from
 * `lib/genlayer.ts`, which builds the SERVER read client and is imported by
 * every server component: nothing in here may be reached during SSR, and
 * keeping the two apart is what makes that checkable rather than hoped for.
 *
 * Reads still run on the server. This file exists for the one thing a server
 * cannot do — sign `analyze_proposal` as the person looking at the page.
 */
import { createClient } from "genlayer-js";
import type { CalldataEncodable, TransactionHash } from "genlayer-js/types";
import { CHAIN, NETWORK, VOTEGUARD } from "./genlayer";

/** `chain.id` as the hex string EIP-1193 expects. Derived, never transcribed. */
export const CHAIN_ID_HEX = `0x${CHAIN.id.toString(16)}`;

export const NETWORK_LABEL = NETWORK === "studionet" ? "Studionet" : "Bradbury";

/** Studionet is gasless; Bradbury needs a funded wallet. */
export const IS_GASLESS = Boolean(CHAIN.isStudio);

/** Minimal EIP-1193 shape — avoids depending on wallet-specific typings. */
export type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function hasInjectedWallet(): boolean {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

export async function getWalletChainId(): Promise<string | null> {
  if (!hasInjectedWallet()) return null;
  try {
    const id = await window.ethereum!.request({ method: "eth_chainId" });
    return typeof id === "string" ? id.toLowerCase() : null;
  } catch {
    return null;
  }
}

function addChainParams() {
  return {
    chainId: CHAIN_ID_HEX,
    chainName:
      NETWORK === "studionet"
        ? "GenLayer Studionet"
        : "GenLayer Bradbury Testnet",
    rpcUrls: [...CHAIN.rpcUrls.default.http],
    nativeCurrency: {
      name: CHAIN.nativeCurrency.name,
      symbol: CHAIN.nativeCurrency.symbol,
      decimals: CHAIN.nativeCurrency.decimals,
    },
    // Omitted rather than sent empty: MetaMask rejects a malformed entry.
    ...(CHAIN.blockExplorers?.default?.url
      ? { blockExplorerUrls: [CHAIN.blockExplorers.default.url] }
      : {}),
  };
}

/** Switch the wallet to this network, adding it first if unknown (error 4902). */
export async function switchToNetwork(): Promise<void> {
  if (!hasInjectedWallet()) {
    throw new Error("No injected wallet found. Install MetaMask to continue.");
  }
  try {
    await window.ethereum!.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch (error) {
    if ((error as { code?: number })?.code !== 4902) throw error;
    await window.ethereum!.request({
      method: "wallet_addEthereumChain",
      params: [addChainParams()],
    });
  }
}

export async function requestAccount(): Promise<`0x${string}`> {
  if (!hasInjectedWallet()) {
    throw new Error("No injected wallet found. Install MetaMask to continue.");
  }
  const accounts = (await window.ethereum!.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts?.length) throw new Error("Wallet returned no accounts.");
  return accounts[0] as `0x${string}`;
}

export async function ensureCorrectNetwork(): Promise<void> {
  if (!hasInjectedWallet()) return;
  await switchToNetwork();
}

function browserClient(account?: `0x${string}`) {
  if (typeof window === "undefined") {
    throw new Error("Wallet clients are browser-only; guard them behind an effect.");
  }
  if (!account) return createClient({ chain: CHAIN });
  const provider = window.ethereum;
  if (!provider) {
    throw new Error("No injected wallet found. Install MetaMask to send transactions.");
  }
  return createClient({ chain: CHAIN, provider, account });
}

export async function getBalance(account: `0x${string}`): Promise<bigint | null> {
  try {
    return await browserClient().getBalance({ address: account });
  } catch {
    return null;
  }
}

/**
 * A payable write that CAN SUCCEED AND STILL HAVE BEEN TURNED DOWN.
 *
 * `analyze_proposal` never raises once value is attached — a revert would roll
 * back storage but not the incoming value, leaving the deposit with no record
 * to refund it from. So a refusal arrives as a SUCCESSFUL transaction whose
 * return value says `status: "REJECTED"`, and telling the two apart is this
 * type's whole job. Reporting a rejection as a confirmation would show someone
 * an assessment that does not exist and a fee that has already been credited
 * back to them.
 */
export type SubmitResult =
  /** The contract stored an assessment. Confirmed by reading it back. */
  | { kind: "ok"; hash: string; assessmentId: number }
  /** The transaction succeeded; the contract declined and credited the fee back. */
  | { kind: "rejected"; hash: string; reason: string; refundWei: string | null }
  /** The transaction never settled, or never left the wallet. */
  | { kind: "failed"; hash: string | null; error: string };

const STATUS_NAMES = [
  "PENDING",
  "PROPOSING",
  "COMMITTING",
  "REVEALING",
  "ACCEPTED",
  "FINALIZED",
  "UNDETERMINED",
  "CANCELED",
];

function settledName(tx: unknown): string {
  const status = (tx as { status?: number | string })?.status;
  return typeof status === "number"
    ? (STATUS_NAMES[status] ?? "")
    : String(status ?? "");
}

/** Pull the contract's own return object out of a settled receipt. */
function returnedPayload(tx: unknown): Record<string, unknown> | null {
  const receipt = (
    tx as { consensus_data?: { leader_receipt?: unknown[] } }
  )?.consensus_data?.leader_receipt?.[0] as
    | { result?: { payload?: unknown } }
    | undefined;
  const payload = receipt?.result?.payload as
    | { readable?: string }
    | string
    | undefined;
  const text =
    typeof payload === "string"
      ? payload
      : typeof payload?.readable === "string"
        ? payload.readable
        : null;
  if (text === null) return null;
  try {
    const once = JSON.parse(text);
    return typeof once === "string"
      ? (JSON.parse(once) as Record<string, unknown>)
      : (once as Record<string, unknown>);
  } catch {
    return null;
  }
}

/**
 * Submit one proposal for analysis and wait for the round to settle.
 *
 * Five validators fetch the proposal and have to agree, so this is minutes, not
 * seconds. The caller gets the transaction hash the moment it is signed so the
 * wait is never a blank screen.
 */
export async function submitAnalysis(
  account: `0x${string}`,
  url: string,
  dao: string,
  feeWei: bigint,
  opts: {
    /**
     * The newest assessment id this URL already had, from the free preview.
     * Without it a refused re-analysis reads as a success, because
     * `get_assessment_by_url` happily returns the assessment that was already
     * there.
     */
    previousAssessmentId: number | null;
    /** Server-side, uncached read of the contract's own state. */
    confirm: () => Promise<{ assessmentId: number | null; analyzedAt: number | null }>;
    onHash?: (hash: string) => void;
  },
): Promise<SubmitResult> {
  const wallet = browserClient(account);
  const read = browserClient();
  let hash: string;
  try {
    hash = await wallet.writeContract({
      address: VOTEGUARD,
      functionName: "analyze_proposal",
      args: [url, dao] as CalldataEncodable[],
      value: feeWei,
    });
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    return {
      kind: "failed",
      hash: null,
      error: /User rejected|4001|denied/i.test(message)
        ? "You dismissed the wallet prompt."
        : message,
    };
  }
  opts.onHash?.(hash);

  const started = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 4000));
    let tx: unknown = null;
    try {
      tx = await read.getTransaction({ hash: hash as TransactionHash });
    } catch {
      // Transient RPC noise. Keep polling; absence of an answer is not an answer.
    }
    const name = settledName(tx);
    if (name === "UNDETERMINED") {
      return {
        kind: "failed",
        hash,
        error:
          "The validators did not converge on this proposal. Nothing was stored and nothing was charged.",
      };
    }
    if (name === "CANCELED") {
      return { kind: "failed", hash, error: "The transaction was canceled." };
    }
    if (name === "ACCEPTED" || name === "FINALIZED") {
      return settle(hash, returnedPayload(tx), opts);
    }
    if (Date.now() - started > 480_000) {
      return {
        kind: "failed",
        hash,
        error:
          "The round did not settle within eight minutes. It may still land — check the proposal list before resubmitting.",
      };
    }
  }
}

/**
 * Decide what a settled transaction actually did. Exported for test/wallet_settle.mjs.
 *
 * THE RECEIPT IS NOT THE AUTHORITY, THE CONTRACT'S STATE IS. Bradbury returns
 * no readable `consensus_data`, so a refusal and an unreadable reply look
 * identical from the receipt alone — and an earlier version of this function
 * treated the unreadable case as success, which reported an assessment that was
 * never written. Every path here therefore ends by reading the record back.
 */
export async function settle(
  hash: string,
  body: Record<string, unknown> | null,
  opts: {
    previousAssessmentId: number | null;
    confirm: () => Promise<{ assessmentId: number | null; analyzedAt: number | null }>;
  },
): Promise<SubmitResult> {
  const rejected = body && String(body.status) === "REJECTED";
  const reason = rejected ? String(body.reason ?? "") : "";
  const refundWei = rejected ? String(body.refund_wei ?? "0") : null;

  /**
   * A short retry, not a poll. The round is already ACCEPTED, so the record is
   * there or it never will be; this only covers a node answering a read from a
   * marginally stale view.
   */
  let confirmed = { assessmentId: null as number | null, analyzedAt: null as number | null };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      confirmed = await opts.confirm();
    } catch {
      // A failed confirmation is not a refusal. Try again, then fall through.
    }
    const id = confirmed.assessmentId;
    if (id !== null && id !== opts.previousAssessmentId) {
      return { kind: "ok", hash, assessmentId: id };
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
  }

  // Nothing new was stored. Say why if the contract told us, and say plainly
  // that we could not read the reason if it did not.
  return {
    kind: "rejected",
    hash,
    reason:
      reason ||
      "The round settled without storing an assessment, and this network does not return the contract's reason with the receipt. The usual causes are the 5-minute per-wallet cooldown, the 15-minute per-proposal cooldown, or the validators agreeing the proposal could not be read.",
    refundWei,
  };
}
