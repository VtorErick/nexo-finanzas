import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";
  const title = "Nexo · Tu dinero, en perspectiva";
  const description = "Cuentas, actividad, metas y proyecciones en una experiencia financiera clara, privada y fácil de usar.";

  return {
    title,
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title,
      description,
      type: "website",
      locale: "es_MX",
      images: [{ url: `${origin}/og-nexo-2026.png`, width: 1729, height: 910, alt: "Nexo · Tu dinero, en perspectiva." }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og-nexo-2026.png`],
    },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";

  return (
    <html lang="es">
      <head>
        <meta property="og:image" content={`${origin}/og-nexo-2026.png`} />
        <meta property="og:image:width" content="1729" />
        <meta property="og:image:height" content="910" />
        <meta name="twitter:image" content={`${origin}/og-nexo-2026.png`} />
      </head>
      <body>{children}</body>
    </html>
  );
}
