// daily-card-renderer.js — Daily P&L summary card (Fabriq-style) over an adaptive background image.
// Pure Node via @napi-rs/canvas. ESM.
//
// Public API:
//   renderDailyCard(data) -> Buffer (PNG)
//
// data = {
//   dateLabel: "July 4, 2026",       // big date heading
//   positions: 45,                    // N positions closed today
//   dailyPnlSol: 1.4982,              // signed; drives green/red + bg win/lose
//   feesSol: 3.0444,
//   depositsSol: 384.6800,
//   withdrawalsSol: 383.1338,
//   winRatePct: 62.2,
//   brand: "PureXBT",                 // top-left brand
//   footerUtc: "2026-07-04 17:00:03 UTC",
//   bgPath: "/abs/path/bg.jpg" | null, // background image (adaptive chosen by caller OR auto)
// }

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Font registration (idempotent, shares fonts/ with card-renderer) ──
let _fontReady = false;
function ensureFonts() {
  if (_fontReady) return;
  const fontDir = path.join(__dirname, "fonts");
  const candidates = [["Oxanium-VariableFont.ttf", "Oxanium"]];
  for (const [file, family] of candidates) {
    const p = path.join(fontDir, file);
    try { if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, family); } catch {}
  }
  _fontReady = true;
}
const FONT = "Oxanium, 'DejaVu Sans', sans-serif";

const C = {
  green: "#20C997",
  red: "#FF4D6D",
  white: "#FFFFFF",
  gray: "#AEB4C6",
  grayDim: "#7B8098",
};

const W = 1200, H = 675;

function fnum(n, d = 4) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0." + "0".repeat(d);
  return x.toFixed(d);
}
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ── Background: image + scrims, or dark-green gradient fallback (Fabriq look) ──
async function drawBackground(ctx, bgPath) {
  let hasImage = false;
  if (bgPath && fs.existsSync(bgPath)) {
    try {
      const img = await loadImage(bgPath);
      ctx.drawImage(img, 0, 0, W, H);
      hasImage = true;
    } catch {}
  }
  if (hasImage) {
    // global darken
    ctx.fillStyle = "rgba(6,8,10,0.34)";
    ctx.fillRect(0, 0, W, H);
    // left text zone gradient (strong left → fade center)
    const lg = ctx.createLinearGradient(0, 0, W * 0.60, 0);
    lg.addColorStop(0, "rgba(4,8,8,0.74)");
    lg.addColorStop(0.62, "rgba(4,8,8,0.40)");
    lg.addColorStop(1, "rgba(4,8,8,0)");
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W * 0.60, H);
    // top band (brand) + bottom band (footer)
    const tg = ctx.createLinearGradient(0, 0, 0, 120);
    tg.addColorStop(0, "rgba(4,8,8,0.70)");
    tg.addColorStop(1, "rgba(4,8,8,0)");
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, W, 120);
    const bg = ctx.createLinearGradient(0, H - 90, 0, H);
    bg.addColorStop(0, "rgba(4,8,8,0)");
    bg.addColorStop(1, "rgba(4,8,8,0.72)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, H - 90, W, 90);
    return;
  }
  // Fabriq-style dark-green gradient (no image fallback)
  const g = ctx.createLinearGradient(W, 0, 0, H);
  g.addColorStop(0, "#0e3d34");
  g.addColorStop(0.5, "#0a2b26");
  g.addColorStop(1, "#061a17");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ── Fabriq dot logo (6x6 diamond of dots) ───────────────────────
function drawDotLogo(ctx, cx, cy, color) {
  const n = 6, gap = 6, r = 2.2;
  const total = (n - 1) * gap;
  const ox = cx - total / 2, oy = cy - total / 2;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // diamond mask: keep dots within a rotated-square-ish falloff
      const dx = i - (n - 1) / 2, dy = j - (n - 1) / 2;
      const d = Math.abs(dx) + Math.abs(dy);
      if (d > (n - 1) / 2 + 1.2) continue;
      const a = Math.max(0.25, 1 - d / (n));
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(ox + i * gap, oy + j * gap, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export async function renderDailyCard(data = {}) {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";

  const pnl = Number(data.dailyPnlSol) || 0;
  const pnlColor = pnl >= 0 ? C.green : C.red;

  await drawBackground(ctx, data.bgPath || null);

  const padL = 64;

  // ── Header: brand (top-left) + url-less, right side brand tag ──
  ctx.fillStyle = C.grayDim;
  drawDotLogo(ctx, padL + 12, 52, pnlColor);
  ctx.font = `700 30px ${FONT}`;
  ctx.fillStyle = C.white;
  ctx.textBaseline = "middle";
  ctx.fillText(String(data.brand || "PureXBT"), padL + 36, 53);

  // ── Date heading + positions ──
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 64px ${FONT}`;
  ctx.fillStyle = C.white;
  ctx.fillText(String(data.dateLabel || ""), padL, 180);

  ctx.font = `500 26px ${FONT}`;
  ctx.fillStyle = C.gray;
  ctx.fillText(`${Number(data.positions) || 0} positions`, padL, 222);

  // ── DAILY P&L (big) ──
  ctx.font = `600 34px ${FONT}`;
  ctx.fillStyle = C.gray;
  ctx.fillText("DAILY P&L", padL, 330);

  const sign = pnl >= 0 ? "+" : "-";
  const pnlText = `${sign}${fnum(Math.abs(pnl))} SOL`;
  ctx.font = `800 84px ${FONT}`;
  ctx.fillStyle = pnlColor;
  ctx.fillText(pnlText, padL, 412);

  // ── DETAILS panel (right side) ──
  const rightX = W - 64;              // right edge for right-aligned values
  const labelX = 720;                 // left edge for labels
  // scrim panel behind DETAILS so values stay legible over bright bg areas
  if (data.bgPath) {
    roundRect(ctx, labelX - 28, 210, (rightX + 28) - (labelX - 28), 276, 18);
    ctx.fillStyle = "rgba(4,8,8,0.68)";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.stroke();
  }
  let ry = 250;
  ctx.textAlign = "left";
  ctx.font = `600 24px ${FONT}`;
  ctx.fillStyle = C.gray;
  ctx.fillText("DETAILS", labelX, ry);
  ry += 44;

  const rows = [
    ["Fees:", `${fnum(data.feesSol)} SOL`],
    ["Deposits:", `${fnum(data.depositsSol)} SOL`],
    ["Withdrawals:", `${fnum(data.withdrawalsSol)} SOL`],
    ["Win rate:", `${(Number(data.winRatePct) || 0).toFixed(1)}%`],
  ];
  for (const [label, value] of rows) {
    ctx.font = `500 26px ${FONT}`;
    ctx.fillStyle = C.gray;
    ctx.textAlign = "left";
    ctx.fillText(label, labelX, ry);
    ctx.font = `700 26px ${FONT}`;
    ctx.fillStyle = C.white;
    ctx.textAlign = "right";
    ctx.fillText(value, rightX, ry);
    ry += 46;
  }
  ctx.textAlign = "left";

  // ── Footer timestamp (bottom-right) ──
  if (data.footerUtc) {
    ctx.font = `500 20px ${FONT}`;
    ctx.fillStyle = C.grayDim;
    ctx.textAlign = "right";
    ctx.fillText(String(data.footerUtc), W - 64, H - 34);
    ctx.textAlign = "left";
  }

  return canvas.toBuffer("image/png");
}

export default { renderDailyCard };
