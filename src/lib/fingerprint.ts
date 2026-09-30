"use client";

/**
 * Browser/device fingerprint → 64-char hex (SHA-256).
 * Combines stable, non-PII signals: canvas & WebGL rendering, screen, timezone,
 * languages, hardware concurrency, platform and UA. Same device+browser → same ID,
 * even after clearing cookies.
 */
function canvasSignal(): string {
  try {
    const c = document.createElement("canvas");
    c.width = 240;
    c.height = 60;
    const ctx = c.getContext("2d");
    if (!ctx) return "no-canvas";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f60";
    ctx.fillRect(100, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.font = "14px 'Arial'";
    ctx.fillText("StockAI fp ✓ 1.618", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.font = "18px 'Times New Roman'";
    ctx.fillText("$AAPL ↑ 0.42%", 4, 45);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgb(255,0,255)";
    ctx.beginPath();
    ctx.arc(50, 50, 25, 0, Math.PI * 2);
    ctx.fill();
    return c.toDataURL();
  } catch {
    return "canvas-err";
  }
}

function webglSignal(): string {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl") || c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "no-webgl";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return [vendor, renderer, gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getSupportedExtensions()?.length].join("|");
  } catch {
    return "webgl-err";
  }
}

async function sha256Hex(input: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Non-secure-context fallback: 8 rounds of FNV-1a → 64 hex chars.
  let out = "";
  for (let r = 0; r < 8; r++) {
    let h = 0x811c9dc5 ^ r;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out += h.toString(16).padStart(8, "0");
  }
  return out;
}

export async function getFingerprint(): Promise<string> {
  const n = navigator as Navigator & { deviceMemory?: number };
  const parts = [
    n.userAgent,
    n.language,
    (n.languages || []).join(","),
    n.platform,
    n.hardwareConcurrency,
    n.deviceMemory ?? "",
    n.maxTouchPoints,
    screen.width,
    screen.height,
    screen.colorDepth,
    window.devicePixelRatio,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    new Date().getTimezoneOffset(),
    canvasSignal(),
    webglSignal(),
  ];
  return sha256Hex(parts.join("§"));
}
