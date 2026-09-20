import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import Shell from "@/components/Shell";
import { ShipmentsProvider } from "@/lib/useShipments";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font" });

// Absolute address of the site, used to turn the preview image path into a full URL in the og:image tag.
// Set NEXT_PUBLIC_SITE_URL to the deployed address (e.g. https://shiptuationship.example.com); it falls back to localhost for development.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const title = "Shiptuationship: SI & BL Verification Desk";
const description = "Turn freight email into decisions. Shiptuationship classifies incoming shipping email, cross-checks Shipping Instructions against Draft Bills of Lading, and keeps a live audit log of every review.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: "Shiptuationship",
  // the preview image comes from app/opengraph-image.tsx and app/twitter-image.tsx
  openGraph: { type: "website", siteName: "Shiptuationship", title, description, locale: "en_US" },
  twitter: { card: "summary_large_image", title, description },
};

// device-width + viewport-fit=cover: use the full screen on phones with notches (the shell pads for the safe areas)
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f5f5f7" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* apply the saved colour scheme before first paint, so there is no flash of the default one */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("shiptuationship-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}` }} />
      </head>
      <body className={figtree.variable}>
        <ShipmentsProvider>
          <Shell>{children}</Shell>
        </ShipmentsProvider>
      </body>
    </html>
  );
}
