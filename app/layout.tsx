import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import Shell from "@/components/Shell";
import { ShipmentsProvider } from "@/lib/useShipments";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font" });

export const metadata: Metadata = {
  title: "Skymetrics — Ocean Manifest Desk",
  description: "Ocean document intake, automated cross-verification, and discrepancy desk.",
};

// device-width + viewport-fit=cover: use the full screen on phones with notches (the shell pads for the safe areas)
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f5f5f7" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={figtree.variable}>
        <ShipmentsProvider>
          <Shell>{children}</Shell>
        </ShipmentsProvider>
      </body>
    </html>
  );
}
