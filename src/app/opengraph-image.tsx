import { ImageResponse } from "next/og";

export const alt = "Nazar: see what your money did, and understand why";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The picture a link to Nazar shows: the rings, the name and the one-line promise. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#0a0f1c", color: "#e8ecf4", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ width: 84, height: 84, borderRadius: 999, border: "6px solid #6d8bff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: 999, border: "6px solid #6d8bff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 14, height: 14, borderRadius: 999, background: "#6d8bff" }} />
            </div>
          </div>
          <div style={{ fontSize: 64, fontWeight: 700 }}>Nazar</div>
        </div>
        <div style={{ marginTop: 48, fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>See what your money did.</div>
        <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, color: "#6d8bff" }}>Understand why.</div>
        <div style={{ marginTop: 36, fontSize: 30, color: "#9aa4b8" }}>Stocks, funds, gold, US stocks, crypto and FDs in one place. Free. No tips.</div>
      </div>
    ),
    size,
  );
}
