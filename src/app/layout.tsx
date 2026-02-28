import type { Metadata } from "next";
import "./globals.css";

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
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
