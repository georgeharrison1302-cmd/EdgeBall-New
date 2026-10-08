import { ImageResponse } from "next/og";

export const alt = "EdgeBall — football stats, model edges and bookmaker prices";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "#eef3f9",
          color: "#0f172a",
        }}
      >
        <div style={{ display: "flex", fontSize: 96, fontWeight: 800, letterSpacing: -2 }}>
          Edge<span style={{ color: "#2563eb" }}>Ball</span>
        </div>
        <div style={{ marginTop: 24, fontSize: 40, color: "#475569", maxWidth: 900 }}>
          Football stats, model probabilities and bookmaker prices — side by side.
        </div>
        <div style={{ marginTop: 48, display: "flex", gap: 16, fontSize: 28, fontWeight: 700 }}>
          <span style={{ background: "#2563eb", color: "#fff", padding: "10px 24px", borderRadius: 999 }}>
            Match Hub
          </span>
          <span style={{ background: "#fff", border: "2px solid #e2e8f0", padding: "10px 24px", borderRadius: 999 }}>
            Player Props
          </span>
          <span style={{ background: "#fff", border: "2px solid #e2e8f0", padding: "10px 24px", borderRadius: 999 }}>
            Referee Desk
          </span>
        </div>
      </div>
    ),
    size,
  );
}
