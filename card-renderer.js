// card-renderer.js — PnL close card renderer (Metlex-style chart + Fabriq-style fallback)
// Pure Node via @napi-rs/canvas. ESM (agent uses "type":"module").
//
// Public API:
//   renderPnlCard(data) -> Buffer (PNG)
//
// data = {
//   pair: "FABLE-SOL",
//   pnlSol: 0.3742,            // signed; drives green/red
//   pnlPct: 5.01,              // signed
//   time: "03:32:56",          // HH:MM:SS elapsed OR wall clock (caller decides)
//   // bottom stats (Metlex):
//   tvlSol: 7.47, binStep: 100, bins: 86, baseFeePct: 2,
//   // Fabriq-style details (fallback / also shown):
//   positions: 5, totalDepositsSol: 14.1413, currentDepositsSol: 0,
//   withdrawalsSol: 13.9844, feesSol: 0.5109,
//   closedAtUtc: "2026-07-04 03:32:02 UTC",
//   brand: "PureXBT",          // header brand text
//   candles: [{time,open,high,low,close}, ...] | null,  // null => fallback layout
//   entryTime: 1783118700, exitTime: 1783135800,        // unix sec for markers
//   bgPath: "/abs/path/card-bg.png" | null,             // optional background image
// }

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Font registration (idempotent) ──────────────────────────────
let _fontReady = false;
function ensureFonts() {
  if (_fontReady) return;
  const fontDir = path.join(__dirname, "fonts");
  const candidates = [
    ["Oxanium-VariableFont.ttf", "Oxanium"],
  ];
  for (const [file, family] of candidates) {
    const p = path.join(fontDir, file);
    try { if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, family); } catch {}
  }
  _fontReady = true;
}
// Prefer Oxanium, fall back to DejaVu Sans (present on the VPS) then generic.
const FONT = "Oxanium, 'DejaVu Sans', sans-serif";

// ── Colors ──────────────────────────────────────────────────────
const C = {
  green: "#20C997",
  red: "#FF4D6D",
  white: "#FFFFFF",
  gray: "#9AA0B4",
  grayDim: "#6B7088",
  candleUp: "#6C72A0",     // slate-blue (small pullbacks / up) — brighter for contrast
  candleDown: "#EDEFF5",   // bright (down move)
  pillDark: "rgba(40,44,64,0.85)",
  pillWhite: "#F2F3F8",
  dash: "rgba(255,255,255,0.32)",
  violet: "#7A4FCF",
};

const W = 1200, H = 675; // 16:9

// ── Helpers ─────────────────────────────────────────────────────
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
function pill(ctx, x, y, text, opt = {}) {
  const padX = opt.padX ?? 16, padY = opt.padY ?? 9;
  const fontSize = opt.fontSize ?? 22, weight = opt.weight ?? 700;
  ctx.font = `${weight} ${fontSize}px ${FONT}`;
  const tw = ctx.measureText(text).width;
  const w = tw + padX * 2, h = fontSize + padY * 2;
  roundRect(ctx, x, y, w, h, opt.radius ?? 10);
  ctx.fillStyle = opt.bg ?? C.pillWhite;
  ctx.fill();
  ctx.fillStyle = opt.fg ?? "#12131A";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + h / 2 + 1);
  return { w, h };
}

// ── Background ───────────────────────────────────────────────────
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
    // Scrims so white/green/red text + candles stay readable over a busy photo.
    // 1) global darken for overall contrast
    ctx.fillStyle = "rgba(6,6,12,0.32)";
    ctx.fillRect(0, 0, W, H);
    // 2) left text zone — vertical dark gradient (strong at far-left, fades toward center)
    const lg = ctx.createLinearGradient(0, 0, W * 0.52, 0);
    lg.addColorStop(0, "rgba(6,6,12,0.72)");
    lg.addColorStop(0.6, "rgba(6,6,12,0.42)");
    lg.addColorStop(1, "rgba(6,6,12,0)");
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W * 0.52, H);
    // 3) top band (brand/header) + bottom band (stats/timestamp)
    const tg = ctx.createLinearGradient(0, 0, 0, 120);
    tg.addColorStop(0, "rgba(6,6,12,0.6)");
    tg.addColorStop(1, "rgba(6,6,12,0)");
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, W, 120);
    const bg2 = ctx.createLinearGradient(0, H - 170, 0, H);
    bg2.addColorStop(0, "rgba(6,6,12,0)");
    bg2.addColorStop(0.5, "rgba(6,6,12,0.55)");
    bg2.addColorStop(1, "rgba(6,6,12,0.86)");
    ctx.fillStyle = bg2;
    ctx.fillRect(0, H - 170, W, 170);
    return;
  }

  // Programmatic navy -> purple -> magenta gradient (placeholder until user swaps a bg)
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0.0, "#0A0A14");
  g.addColorStop(0.42, "#161327");
  g.addColorStop(0.72, "#4B357F");
  g.addColorStop(1.0, "#B4357A");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // magenta bloom bottom-right
  const rg = ctx.createRadialGradient(W * 0.82, H * 0.95, 40, W * 0.82, H * 0.95, 640);
  rg.addColorStop(0, "rgba(232,92,154,0.42)");
  rg.addColorStop(1, "rgba(232,92,154,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
  // faint top navy vignette
  const tg = ctx.createLinearGradient(0, 0, 0, H * 0.5);
  tg.addColorStop(0, "rgba(10,10,20,0.55)");
  tg.addColorStop(1, "rgba(10,10,20,0)");
  ctx.fillStyle = tg;
  ctx.fillRect(0, 0, W, H * 0.5);
}

// ── Candlestick chart (Metlex-style) ────────────────────────────
function drawChart(ctx, data, box) {
  const { x, y, w, h } = box;
  let candles = data.candles;
  if (!candles || candles.length < 2) return false;

  // Zoom in like Metlex: instead of drawing all ~96 candles (which makes each
  // candle a thin sliver and the price action look flat), focus the window on
  // the entry→exit span with a little padding, capped to ~TARGET candles so
  // bodies are wide and the move is clearly readable.
  const TARGET = 22;      // desired candle count in view (Metlex shows ~15-18)
  const PAD = 3;          // candles of context on each side of entry/exit
  let entryTime = Number(data.entryTime);
  let exitTime = Number(data.exitTime);
  let sliceStart = 0, sliceEnd = candles.length; // [start, end)
  if (candles.length > TARGET) {
    const nearest = (t) => {
      if (!Number.isFinite(t)) return -1;
      let best = -1, bestD = Infinity;
      for (let i = 0; i < candles.length; i++) {
        const d = Math.abs(Number(candles[i].time) - t);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    };
    let ei = nearest(entryTime);
    let xi = nearest(exitTime);
    if (ei < 0 && xi < 0) {
      // no timestamps -> just take the most-recent TARGET candles
      sliceStart = candles.length - TARGET;
      sliceEnd = candles.length;
    } else {
      if (ei < 0) ei = Math.max(0, xi - TARGET + 1);
      if (xi < 0) xi = Math.min(candles.length - 1, ei + TARGET - 1);
      let lo = Math.min(ei, xi) - PAD;
      let hiIdx = Math.max(ei, xi) + PAD;
      // ensure at least TARGET candles in view, centered on the span
      let span = hiIdx - lo + 1;
      if (span < TARGET) {
        const grow = TARGET - span;
        lo -= Math.floor(grow / 2);
        hiIdx += Math.ceil(grow / 2);
      }
      // if the entry→exit span itself exceeds TARGET, keep it but don't blow up
      sliceStart = Math.max(0, lo);
      sliceEnd = Math.min(candles.length, hiIdx + 1);
      // clamp width to a sane max (span may be huge for long positions)
      if (sliceEnd - sliceStart > TARGET * 3) {
        // sample down: keep endpoints, thin the middle — but simplest: bias to exit side
        sliceStart = Math.max(0, sliceEnd - TARGET * 3);
      }
    }
    candles = candles.slice(sliceStart, sliceEnd);
    if (candles.length < 2) { candles = data.candles; sliceStart = 0; }
  }

  const lows = candles.map(c => Number(c.low)).filter(Number.isFinite);
  const highs = candles.map(c => Number(c.high)).filter(Number.isFinite);
  let lo = Math.min(...lows), hi = Math.max(...highs);
  if (!(hi > lo)) return false;
  const pad = (hi - lo) * 0.08;
  lo -= pad; hi += pad;

  // dark backing panel so both bright & dark candles stay legible over the
  // magenta gradient (rounded, subtle border)
  roundRect(ctx, x - 14, y - 14, w + 28, h + 28, 16);
  ctx.fillStyle = "rgba(8,8,16,0.42)";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.stroke();

  const n = candles.length;
  const pitch = w / n;
  const bodyW = Math.max(2, pitch * 0.55);
  const yOf = (price) => y + h - ((price - lo) / (hi - lo)) * h;
  const xOf = (i) => x + i * pitch + pitch / 2;

  // exit-zone shaded region (right ~28%)
  const zoneX = x + w * 0.72;
  const zg = ctx.createLinearGradient(zoneX, 0, x + w, 0);
  zg.addColorStop(0, "rgba(122,79,207,0)");
  zg.addColorStop(1, "rgba(150,79,207,0.30)");
  ctx.fillStyle = zg;
  ctx.fillRect(zoneX, y, x + w - zoneX, h);

  // candles
  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const o = Number(c.open), cl = Number(c.close), hg = Number(c.high), lw = Number(c.low);
    if (![o, cl, hg, lw].every(Number.isFinite)) continue;
    const up = cl >= o;
    const col = up ? C.candleUp : C.candleDown;
    const cx = xOf(i);
    // wick
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx, yOf(hg));
    ctx.lineTo(cx, yOf(lw));
    ctx.stroke();
    // body
    const yTop = yOf(Math.max(o, cl));
    const bh = Math.max(1.5, Math.abs(yOf(o) - yOf(cl)));
    ctx.fillStyle = col;
    roundRect(ctx, cx - bodyW / 2, yTop, bodyW, bh, 2);
    ctx.fill();
  }

  // HIGH/LOW guide lines + labels
  const hiY = yOf(hi - pad * 0.5), loY = yOf(lo + pad * 0.5);
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = C.dash;
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(x, hiY); ctx.lineTo(x + w, hiY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, loY); ctx.lineTo(x + w, loY); ctx.stroke();
  ctx.setLineDash([]);

  // ENTRY / EXIT marker index from time (fallback: first/last)
  const idxByTime = (t) => {
    if (!Number.isFinite(t)) return -1;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const ct = Number(candles[i].time);
      const d = Math.abs(ct - t);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };
  let ei = idxByTime(data.entryTime); if (ei < 0) ei = 0;
  let xi = idxByTime(data.exitTime); if (xi < 0) xi = n - 1;

  // entry/exit vertical dashed boundaries
  ctx.setLineDash([5, 6]);
  ctx.strokeStyle = C.dash;
  for (const bi of [ei, xi]) {
    ctx.beginPath(); ctx.moveTo(xOf(bi), y); ctx.lineTo(xOf(bi), y + h); ctx.stroke();
  }
  ctx.setLineDash([]);

  // marker dots
  const dot = (cx, cy) => {
    ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = C.white; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "#12131A"; ctx.stroke();
  };
  const eY = yOf(Number(candles[ei].close));
  const xY = yOf(Number(candles[xi].close));
  dot(xOf(ei), eY);
  dot(xOf(xi), xY);

  // ENTRY / EXIT pills near dots
  ctx.textBaseline = "middle";
  pill(ctx, Math.min(xOf(ei) + 12, x + w - 90), Math.max(y + 6, eY - 34), "ENTRY",
    { fontSize: 16, padX: 12, padY: 6, bg: C.pillWhite, fg: "#12131A" });
  pill(ctx, Math.min(xOf(xi) - 70, x + w - 76), Math.max(y + 6, xY - 34), "EXIT",
    { fontSize: 16, padX: 12, padY: 6, bg: C.pillWhite, fg: "#12131A" });

  // HIGH / LOW two-part badges (top-right & bottom-left of chart)
  const hilo = (label, val, px, py) => {
    ctx.font = `700 16px ${FONT}`;
    const tagW = ctx.measureText(label).width + 20;
    roundRect(ctx, px, py, tagW, 30, 8); ctx.fillStyle = C.pillDark; ctx.fill();
    ctx.fillStyle = C.white; ctx.textBaseline = "middle";
    ctx.fillText(label, px + 10, py + 16);
    pill(ctx, px + tagW + 6, py, val, { fontSize: 16, padX: 12, padY: 5, bg: C.pillWhite, fg: "#12131A" });
  };
  hilo("HIGH", fmtPrice(hi - pad), x + 4, y + 4);
  hilo("LOW", fmtPrice(lo + pad), x + 4, y + h - 34);

  return true;
}

// small-number formatting for tiny prices. Uses a leading-zero-count notation
// that renders safely in any font (no Unicode subscript glyphs):
//   0.00000006572 -> "0.0₅6572" if subscripts render, else "0.0(7)6572"
// We AVOID subscript glyphs entirely to prevent font-fallback artifacts.
function fmtPrice(p) {
  const x = Number(p);
  if (!Number.isFinite(x) || x <= 0) return "0";
  if (x >= 0.001) return String(Number(x.toPrecision(4)));
  // count leading zeros after decimal
  const s = x.toExponential(); // e.g. 6.572e-8
  const m = s.match(/^(\d(?:\.\d+)?)e-(\d+)$/);
  if (!m) return String(Number(x.toPrecision(4)));
  const mantissa = m[1].replace(".", "");
  const exp = parseInt(m[2], 10);
  const zeros = exp - 1; // zeros between "0." and first sig digit
  return `0.0(${zeros})${mantissa.slice(0, 4)}`;
}

// ── Bottom stats bar (Metlex) ───────────────────────────────────
function drawBottomStats(ctx, data) {
  const items = [
    ["TVL", `${fnum(data.tvlSol, 2)} SOL`, C.white],
    ["BIN STEP", `${data.binStep ?? "?"}`, C.white],
    ["BINS", `${data.bins ?? "?"}`, C.white],
    ["BASE FEE", `${data.baseFeePct ?? "?"}%`, C.green],
    ["PNL", `${data.pnlPct >= 0 ? "+" : ""}${fnum(data.pnlPct, 2)}%`, data.pnlPct >= 0 ? C.green : C.red],
  ];
  const y = H - 92;
  const colW = W / items.length;
  items.forEach(([label, val, col], i) => {
    const cx = colW * i + colW / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.gray;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText(label, cx, y);
    ctx.fillStyle = col;
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(val, cx, y + 34);
  });
  ctx.textAlign = "left";
}

// ── Right-column details (Fabriq-style, fallback) ───────────────
function drawDetailsColumn(ctx, data) {
  const rx = W * 0.56, rW = W * 0.4;
  let y = 150;
  ctx.textAlign = "left";
  ctx.fillStyle = C.gray;
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText("DETAILS", rx, y);
  y += 46;
  const rows = [
    ["POSITIONS", `${data.positions ?? "?"}`],
    ["TOTAL DEPOSITS", `${fnum(data.totalDepositsSol, 4)} SOL`],
    ["CURRENT DEPOSITS", `${fnum(data.currentDepositsSol, 4)} SOL`],
    ["WITHDRAWALS", `${fnum(data.withdrawalsSol, 4)} SOL`],
    ["FEES", `${fnum(data.feesSol, 4)} SOL`],
  ];
  for (const [label, val] of rows) {
    ctx.fillStyle = C.gray;
    ctx.font = `500 21px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(label, rx, y);
    ctx.fillStyle = C.white;
    ctx.font = `700 26px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(val, rx + rW, y);
    y += 52;
  }
  ctx.textAlign = "left";
  // timestamp bottom-right
  if (data.closedAtUtc) {
    ctx.font = `500 22px ${FONT}`;
    ctx.textAlign = "right";
    const tw = ctx.measureText(data.closedAtUtc).width;
    // subtle dark plate for contrast over pink gradient
    roundRect(ctx, rx + rW - tw - 14, H - 62, tw + 20, 32, 8);
    ctx.fillStyle = "rgba(8,8,16,0.45)";
    ctx.fill();
    ctx.fillStyle = "#CDD1E0";
    ctx.textBaseline = "middle";
    ctx.fillText(data.closedAtUtc, rx + rW - 4, H - 46);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
}

// ── Left column (shared) ────────────────────────────────────────
function drawLeftColumn(ctx, data, withChart) {
  const lx = 56;
  const pos = Number(data.pnlSol) >= 0;
  const pnlCol = pos ? C.green : C.red;

  // header brand
  ctx.textAlign = "left";
  ctx.fillStyle = C.white;
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText(data.brand || "PureXBT", lx, 58);
  // (domain/url intentionally not rendered)
  ctx.textAlign = "left";

  let y = 150;
  // TIME / DURATION
  ctx.fillStyle = C.gray;
  ctx.font = `600 20px ${FONT}`;
  ctx.fillText(withChart ? "TIME" : "DURATION", lx, y);
  y += 44;
  ctx.fillStyle = C.white;
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText(data.time || "-", lx, y);
  y += 42;

  // DLMM label + pair
  ctx.fillStyle = C.gray;
  ctx.font = `600 20px ${FONT}`;
  ctx.fillText("DLMM", lx, y);
  y += 60;
  ctx.fillStyle = C.white;
  ctx.font = `800 68px ${FONT}`;
  ctx.fillText(data.pair || "-", lx, y);
  y += 56;

  // PROFIT (SOL)
  ctx.fillStyle = C.gray;
  ctx.font = `600 20px ${FONT}`;
  ctx.fillText("PROFIT (SOL)", lx, y);
  y += 78;
  ctx.fillStyle = pnlCol;
  ctx.font = `800 76px ${FONT}`;
  const sign = pos ? "+" : "";
  ctx.fillText(`${sign}${fnum(data.pnlSol, 4)}`, lx, y);

  return y;
}

// ── Main entry ──────────────────────────────────────────────────
async function renderPnlCard(data) {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Adaptive background: PnL >= 0 -> win bg, PnL < 0 -> lose bg.
  // Explicit data.bgPath wins; otherwise look for assets/bg-win.jpg | bg-lose.jpg.
  let bgPath = data.bgPath || null;
  if (!bgPath) {
    const pos = Number(data.pnlSol) >= 0;
    const dir = path.join(__dirname, "assets");
    const winCands = ["bg-win.jpg", "bg-win.png", "card-bg-win.jpg"];
    const loseCands = ["bg-lose.jpg", "bg-lose.png", "card-bg-lose.jpg"];
    const generic = ["card-bg.png", "card-bg.jpg"];
    const tryList = (pos ? winCands : loseCands).concat(generic);
    for (const f of tryList) {
      const p = path.join(dir, f);
      if (fs.existsSync(p)) { bgPath = p; break; }
    }
  }
  await drawBackground(ctx, bgPath);

  const hasChart = Array.isArray(data.candles) && data.candles.length >= 2;

  if (hasChart) {
    // Metlex layout: left text, right chart, bottom stats
    drawLeftColumn(ctx, data, true);
    const chartBox = { x: W * 0.5, y: 120, w: W * 0.44, h: 360 };
    const ok = drawChart(ctx, data, chartBox);
    if (ok) {
      drawBottomStats(ctx, data);
    } else {
      // chart data unusable -> details column fallback
      drawDetailsColumn(ctx, data);
    }
  } else {
    // Fabriq layout: left text + right details column
    drawLeftColumn(ctx, data, false);
    drawDetailsColumn(ctx, data);
    // CLOSED badge bottom-left
    pill(ctx, 56, H - 96, "CLOSED", { fontSize: 22, padX: 20, padY: 12, bg: "rgba(42,42,46,0.9)", fg: "#C9CBD6", radius: 12 });
  }

  return canvas.toBuffer("image/png");
}

export { renderPnlCard, fmtPrice };
