"use client";

import { useWallet } from "./WalletProvider";
import { IS_GASLESS, NETWORK_LABEL } from "@/lib/wallet";
import { gen, shortAddress } from "@/lib/format";

/**
 * The only interactive island in the app header, which is otherwise a server
 * component. Keeping it this small is the point: the header still renders from
 * the server with the network badge and the contract address, and the wallet is
 * the one piece that has to wait for the browser.
 */
export function ConnectWallet() {
  const {
    account,
    balance,
    connect,
    disconnect,
    connecting,
    hasWallet,
    onWrongNetwork,
    switchNetwork,
  } = useWallet();

  if (onWrongNetwork) {
    return (
      <button
        onClick={switchNetwork}
        className="rounded-md border border-[color-mix(in_oklab,var(--color-verdict-warn)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-verdict-warn)_12%,transparent)] px-3 py-1.5 text-[13px] font-semibold text-[color:var(--color-verdict-warn)]"
      >
        Switch to {NETWORK_LABEL}
      </button>
    );
  }

  if (account) {
    return (
      <button
        onClick={disconnect}
        title={`${account} — click to disconnect`}
        className="rounded-md border border-ink-600/60 bg-ink-800/60 px-3 py-1.5 font-mono text-[11px] text-ink-200 transition-colors hover:border-royal-400/60 hover:text-white"
      >
        {shortAddress(account)}
        {balance !== null && !IS_GASLESS ? (
          <span className="ml-2 text-ink-400">
            {gen(balance.toString())} GEN
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={connecting}
      className="rounded-md bg-royal-500 px-3.5 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-royal-400 disabled:opacity-50"
    >
      {connecting
        ? "Connecting…"
        : hasWallet
          ? "Connect wallet"
          : "Install a wallet"}
    </button>
  );
}
