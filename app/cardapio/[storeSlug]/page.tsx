import type { Metadata, Viewport } from "next";
import PublicMenuApp from "@/features/online-orders/public-menu-app";

export const metadata: Metadata = {
  title: "Cardápio digital | Pool Petiscos & Lanches",
  description: "Faça seu pedido pelo cardápio digital da Pool Petiscos & Lanches.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fffaf4",
  colorScheme: "light",
};

export default async function PublicMenuPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  return <PublicMenuApp storeSlug={storeSlug} />;
}
