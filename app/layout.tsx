import { headers } from "next/headers";
import "./globals.css";
import "./styles/foundation.css";

const title = "Nexo · Tu dinero, en perspectiva";
const description = "Cuentas, actividad, metas y proyecciones en una experiencia financiera clara, privada y fácil de usar.";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";

  return (
    <html lang="es">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="theme-color" content="#143d32" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="shortcut icon" href="/favicon.svg" type="image/svg+xml" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="es_MX" />
        <meta property="og:image" content={`${origin}/og-nexo-2026.png`} />
        <meta property="og:image:width" content="1729" />
        <meta property="og:image:height" content="910" />
        <meta property="og:image:alt" content="Nexo · Tu dinero, en perspectiva." />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={`${origin}/og-nexo-2026.png`} />
      </head>
      <body>{children}</body>
    </html>
  );
}
