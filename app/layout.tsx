import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import { ModeratorProvider } from "@/components/Profile";
import Shell from "@/components/Shell";
import { currentModerator } from "@/lib/session";
import { ShipmentsProvider } from "@/lib/useShipments";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font" });

// Absolute address of the site, used to turn the preview image path into a full URL in the og:image tag.
// Set NEXT_PUBLIC_SITE_URL to the deployed address (e.g. https://shiptuationship.example.com); it falls back to localhost for development.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const title = "Shiptuationship: AI Logistics Assistant";
const description = "Turn freight email into decisions. Shiptuationship classifies incoming shipping email, cross-checks Shipping Instructions against Draft Bills of Lading, and keeps a live audit log of every review.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: "Shiptuationship",
  // the link preview image is public/opengraph.png (1200x630), shared by Open Graph and Twitter
  openGraph: { type: "website", siteName: "Shiptuationship", title, description, locale: "en_US", images: [{ url: "/opengraph.png", width: 1200, height: 630, alt: title }] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph.png"] },
};

// device-width + viewport-fit=cover: use the full screen on phones with notches (the shell pads for the safe areas)
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f5f5f7" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const moderator = await currentModerator(); // the app shell (and its data fetching) only exists once logged in; the front page renders bare
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* before first paint, so there is no flash: the app applies the colour scheme chosen in Settings; the front page (logged out) is always the default light one */}
        {moderator && <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("shiptuationship-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}` }} />}
      </head>
      <body className={figtree.variable}>
        {moderator ? (
          <ModeratorProvider value={moderator}>
            <ShipmentsProvider>
              <Shell>{children}</Shell>
            </ShipmentsProvider>
          </ModeratorProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
