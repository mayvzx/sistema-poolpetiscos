import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "Pool Petiscos & Lanches | Caixa, estoque e financeiro";
const description =
  "Gestão de comandas, vendas, estoque, caixa, finanças e música ambiente da Pool Petiscos & Lanches.";
const productionOrigin = "https://pool-petiscos-caixa.mayrom.chatgpt.site";
const appearanceBootstrap = `(()=>{try{const key="pool-petiscos-preferencias-visuais-v1";const saved=JSON.parse(localStorage.getItem(key)||"null");const allowed=[90,95,100,105,110,115,120,125,130,135];const scale=allowed.includes(saved?.fontScale)?saved.fontScale:100;const mode=["system","light","dark"].includes(saved?.themeMode)?saved.themeMode:"system";const dark=mode==="dark"||(mode==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);const theme=dark?"dark":"light";document.documentElement.dataset.poolTheme=theme;document.documentElement.style.colorScheme=theme;document.documentElement.style.setProperty("--pool-font-scale",String(scale/100));}catch{}})();`;

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
  const isLoopbackHost =
    host !== null &&
    /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const protocol =
    forwardedProtocol || (isLoopbackHost ? "http" : "https");
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
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrap }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
