import { ImageResponse } from "next/og";

// Ícone da tela inicial do iPhone (o iOS não usa SVG). Gerado no build, sem arquivo binário.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0f1a", color: "#a48bff", fontSize: 110, fontWeight: 700 }}>
        F
      </div>
    ),
    size,
  );
}
