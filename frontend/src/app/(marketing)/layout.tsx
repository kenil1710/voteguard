import { MarketingHeader, Footer } from "@/components/chrome";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <MarketingHeader />
      <main>{children}</main>
      <Footer />
    </>
  );
}
