import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "Pool Petiscos & Lanches | Caixa, estoque e financeiro";
const description =
  "Sistema demonstrativo de vendas, estoque, caixa e controle financeiro da Pool Petiscos & Lanches.";
const productionOrigin = "https://pool-petiscos-caixa.mayrom.chatgpt.site";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders
    .get("x-forwarded-host")
    ?.split(",")[0]
    .trim();
  const host = forwardedHost || requestHeaders.get("host");
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim();
  const protocol =
    forwardedProtocol || (host?.startsWith("localhost") ? "http" : "https");
  let origin = productionOrigin;
  if (host) {
    try {
      origin = new URL(`${protocol}://${host}`).origin;
    } catch {
      origin = productionOrigin;
    }
  }
  const metadataBase = new URL(origin);
  const socialImage = new URL("/og.png", metadataBase).toString();

  return {
    metadataBase,
    title,
    description,
    icons: {
      icon: "/pool-logo-round.jpg",
      shortcut: "/pool-logo-round.jpg",
    },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      url: origin,
      siteName: "Pool Petiscos & Lanches",
      title,
      description,
      images: [
        {
          url: socialImage,
          width: 1732,
          height: 909,
          alt: "Pool Petiscos & Lanches — Caixa, estoque e financeiro",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
