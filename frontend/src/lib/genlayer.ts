/**
 * The one place a GenLayer client is built.
 *
 * Reads run on the SERVER. A browser talking to the RPC directly hits CORS on
 * Studionet and a per-minute rate limit on both networks, and the failure mode
 * is a page that renders empty for reasons the user cannot see. Server
 * components read once, cache, and ship HTML.
 */
import { createClient } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";

export const NETWORK = (process.env.NEXT_PUBLIC_NETWORK ?? "bradbury") as
  | "bradbury"
  | "studionet";

export const CHAIN = NETWORK === "studionet" ? studionet : testnetBradbury;

export const VOTEGUARD = (process.env.NEXT_PUBLIC_VOTEGUARD ?? "") as `0x${string}`;
export const CONSUMER = (process.env.NEXT_PUBLIC_CONSUMER ?? "") as `0x${string}`;

export const EXPLORER =
  NETWORK === "studionet"
    ? "https://studio.genlayer.com"
    : "https://explorer-bradbury.genlayer.com";

let client: ReturnType<typeof createClient> | null = null;

export function reader() {
  if (!client) client = createClient({ chain: CHAIN });
  return client;
}

export function explorerAddress(address: string) {
  return `${EXPLORER}/address/${address}`;
}

export function explorerTx(hash: string) {
  return `${EXPLORER}/tx/${hash}`;
}

export const configured = Boolean(VOTEGUARD);
