import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";

export const metadata: Metadata = {
  title: "MixStudio — Player Audio Multipiste",
  description: "Lecteur audio multipiste professionnel avec analyse harmonique et paroles synchronisées",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      {/* Script anti-FOUC : applique le thème avant le premier rendu */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('mixstudio-theme');
            if (t === 'light') document.documentElement.setAttribute('data-theme','light');
          } catch(e) {}
        `}} />
      </head>
      <body className="antialiased">
        {children}
        <Script id="register-sw" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
          }
        `}</Script>
      </body>
    </html>
  );
}
