// notify-card.js — PnL close card sender for Telegram. ESM.
// Drop-in module deployed alongside telegram.js. Keeps telegram.js edits minimal.
//
// Exports:
//   sendPnlCard({ result, tracked, brand, url, walletAddress, solPrice, chatId, token })
//     -> renders card PNG and posts via sendPhoto; returns true on success, false otherwise.
//
// Fully best-effort: any failure returns false so the caller can fall back to text.

import { renderPnlCard } from "./card-renderer.js";
import { buildCardData } from "./card-data.js";
import { log } from "./logger.js";

export async function sendPnlCard({ result, tracked, brand, url, walletAddress, solPrice, chatId, token, reason } = {}) { /* __CLOSEREASON__ */
  try {
    if (!token || !chatId) return false;

    const data = await buildCardData({ result, tracked, brand, url, walletAddress, solPrice });
    // caption: concise text summary (also survives if image somehow fails to display)
    const pos = Number(data.pnlSol) >= 0;
    const sign = pos ? "+" : "";
    const caption =
      `<b>${pos ? "🟢" : "🔴"} ${data.pair} — POSISI DITUTUP</b>\n` +
      `PnL: <b>${sign}${Number(data.pnlSol).toFixed(4)} SOL</b> (${sign}${Number(data.pnlPct).toFixed(2)}%)\n` +
      `Durasi: ${data.time}` +
      (reason ? `\nAlasan: ${String(reason).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 200)}` : "");

    const png = await renderPnlCard(data);
    if (!png || png.length < 1000) return false;

    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("caption", caption.slice(0, 1024));
    form.append("parse_mode", "HTML");
    form.append("photo", new Blob([png], { type: "image/png" }), "pnl-card.png");

    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      log("telegram_error", `sendPhoto ${res.status}: ${err.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    log("telegram_warn", `PnL card render/send failed: ${e.message}`);
    return false;
  }
}
