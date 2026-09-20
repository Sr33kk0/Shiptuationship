import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// The link preview card (1200x630) shown when the app is shared. Next serves it at /opengraph-image and adds the og:image tag.
export const alt = "Shiptuationship: freight email triage and SI / BL verification";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logo = await readFile(join(process.cwd(), "public", "shiplogo.svg"));
  const src = `data:image/svg+xml;base64,${logo.toString("base64")}`;
  const chip = { display: "flex", padding: "10px 22px", borderRadius: 999, background: "rgba(56, 189, 248, 0.14)", border: "1px solid rgba(56, 189, 248, 0.35)", color: "#7dd3fc", fontSize: 26, fontWeight: 600 } as const;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", padding: "0 88px", gap: 72, background: "linear-gradient(135deg, #04121f 0%, #062a45 100%)", color: "#fff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={288} height={320} alt="" />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", fontSize: 88, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 }}>Shiptuationship</div>
          <div style={{ display: "flex", marginTop: 20, fontSize: 36, lineHeight: 1.3, color: "#b6c8d8" }}>Turn freight email into decisions: triage every message and catch Shipping Instruction vs Draft BL mismatches before they sail.</div>
          <div style={{ display: "flex", gap: 14, marginTop: 36 }}>
            <div style={chip}>Email triage</div>
            <div style={chip}>SI / BL check</div>
            <div style={chip}>Live audit log</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
