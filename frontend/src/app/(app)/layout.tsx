import { AppHeader, Footer } from "@/components/chrome";
import { WalletProvider } from "@/components/WalletProvider";

/**
 * The wallet is scoped to this route group on purpose. The marketing shell has
 * no import path to chain state at all — that is what keeps the landing page
 * from half-rendering on a slow RPC — so the provider lives here rather than in
 * the root layout, where it would reach both.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-5 py-10">{children}</main>
      <Footer />
    </WalletProvider>
  );
}
