import { AppHeader, Footer } from "@/components/chrome";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-5 py-10">{children}</main>
      <Footer />
    </>
  );
}
