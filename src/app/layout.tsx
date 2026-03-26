import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MixStudio — Player Audio Multipiste",
  description: "Lecteur audio multipiste professionnel avec paroles synchronisées",
  applicationName: "MixStudio",
  appleWebApp: {
    capable: true,
    title: "MixStudio",
    statusBarStyle: "black-translucent",
  },
}

export const viewport: Viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        {/* Anti-FOUC : applique le thème avant le premier rendu */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('mixstudio-theme');
            if (t === 'light') document.documentElement.setAttribute('data-theme','light');
          } catch(e) {}
        `}} />
        {/* Icône iOS */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        {/* Splash screens iOS (optionnel — améliore le démarrage) */}
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
