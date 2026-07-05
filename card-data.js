// card-data.js — assemble PnL card data at close time. ESM.
//
// Pulls REAL data:
//   - candles[] from Meridian chart-indicators API (for the Metlex chart)
//   - closed-PnL SOL figures from Meteora datapi (deposits/withdrawals/fees/pnl in SOL)
// Everything is best-effort with safe fallbacks so a card is ALWAYS produced.
//
// Exposed: buildCardData({ result, tracked, brand, url, walletAddress })

import { config } from "./config.js";

const SOL_MINT = "So11111111111111111111111111111111111111112";

function num(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function fetchTimeout(url, opts = {}, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

// ── Meridian candles (OHLCV) for the position base mint ─────────
async function fetchCandles(baseMint, { interval = "15_MINUTE", candles = 96 } = {}) {
  try {
    if (!baseMint) return null;
    const key = config?.api?.publicApiKey;
    if (!key) return null;
    const base = String(config?.api?.url || "https://api.agentmeridian.xyz/api").replace(/\/+$/, "");
    const url = `${base}/chart-indicators/${baseMint}?interval=${interval}&candles=${candles}&rsiLength=2`;
    const r = await fetchTimeout(url, { headers: { "x-api-key": key } }, 12000);
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    const arr = j?.candles || j?.data?.candles || null;
    if (!Array.isArray(arr) || arr.length < 2) return null;
    // normalize
    return arr
      .map((c) => ({
        time: num(c.time),
        open: num(c.open),
        high: num(c.high),
        low: num(c.low),
        close: num(c.close),
      }))
      .filter((c) => Number.isFinite(c.open) && c.high >= c.low);
  } catch {
    return null;
  }
}

// ── Meteora closed-PnL (SOL figures) — aggregate across closed positions in pool ──
async function fetchClosedSol(poolAddress, walletAddress) {
  try {
    if (!poolAddress || !walletAddress) return null;
    const url = `https://dlmm.datapi.meteora.ag/positions/${poolAddress}/pnl?user=${walletAddress}&status=closed&pageSize=50&page=1`;
    const r = await fetchTimeout(url, {}, 12000);
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    const arr = j?.positions || j?.data || (Array.isArray(j) ? j : null);
    if (!Array.isArray(arr) || arr.length === 0) return null;

    const solOf = (obj) => num(obj?.total?.sol, 0);
    // Identify the JUST-CLOSED position = the one with the latest closedAt.
    let lastClosedEntry = null, latestClosed = 0;
    for (const e of arr) {
      const cAt = num(e.closedAt, 0);
      if (cAt >= latestClosed) { latestClosed = cAt; lastClosedEntry = e; }
    }
    const e = lastClosedEntry || arr[0];
    // All figures reflect THIS single position (not the pool's full history),
    // so PnL / duration / chart / deposits / fees all agree.
    const dep = solOf(e.allTimeDeposits);
    const wd = solOf(e.allTimeWithdrawals);
    const fees = solOf(e.allTimeFees);
    const pnlSol = num(e.pnlSol, 0);
    let binsSpan = null;
    if (Number.isFinite(Number(e.upperBinId)) && Number.isFinite(Number(e.lowerBinId))) {
      binsSpan = Math.abs(Number(e.upperBinId) - Number(e.lowerBinId)) + 1;
    }
    // "current deposits" = deposits still live = deposits - withdrawals (>=0)
    const currentDepositsSol = Math.max(0, dep - wd);
    // token X = base mint (string) — for chart candles
    const baseMintFromApi = typeof j?.tokenX === "string" ? j.tokenX : (j?.tokenX?.mint || j?.tokenX?.address || null);
    return {
      totalDepositsSol: dep,
      withdrawalsSol: wd,
      feesSol: fees,
      currentDepositsSol,
      pnlSol,
      positions: 1,
      bins: binsSpan,
      // Duration + chart markers from THIS position's own timestamps.
      createdAt: num(e.createdAt, 0) || null,
      closedAt: num(e.closedAt, 0) || latestClosed || null,
      baseMint: baseMintFromApi,
      solPrice: num(j?.solPrice, 0) || null,
    };
  } catch {
    return null;
  }
}

// ── Meteora pool config (bin_step + base_fee) ───────────────────
async function fetchPoolConfig(poolAddress) {
  try {
    if (!poolAddress) return null;
    const url = `https://dlmm.datapi.meteora.ag/pools/${poolAddress}`;
    const r = await fetchTimeout(url, {}, 10000);
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    const cfg = j?.pool_config || {};
    const binStep = num(cfg.bin_step, 0) || null;
    // base fee: prefer static pool_config base_fee_pct, else live dynamic_fee_pct
    let baseFeePct = Number.isFinite(Number(cfg.base_fee_pct)) ? Number(cfg.base_fee_pct) : null;
    if (baseFeePct == null && Number.isFinite(Number(j?.dynamic_fee_pct))) baseFeePct = Number(j.dynamic_fee_pct);
    return { binStep, baseFeePct };
  } catch {
    return null;
  }
}

// ── Duration string from tracked.deployed_at → now ──────────────
function fmtDurationSec(sec) {
  const s0 = Number(sec);
  if (!Number.isFinite(s0) || s0 < 0) return null;
  const s = Math.floor(s0);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec2 = s % 60;
  const p2 = (x) => String(x).padStart(2, "0");
  return `${d}D ${p2(h)}H ${p2(m)}M ${p2(sec2)}S`;
}
function fmtDuration(deployedAt) {
  const start = Number(deployedAt);
  if (!Number.isFinite(start) || start <= 0) return null;
  let ms = Date.now() - (start > 1e12 ? start : start * 1000);
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p2 = (x) => String(x).padStart(2, "0");
  return `${d}D ${p2(h)}H ${p2(m)}M ${p2(sec)}S`;
}

// ── Main ────────────────────────────────────────────────────────
export async function buildCardData({ result = {}, tracked = {}, brand, url, walletAddress, solPrice } = {}) {
  const poolAddress = result.pool || tracked.pool || null;
  const baseMint = result.base_mint || tracked.base_mint || null;
  // Initial pair guess from what the caller passed. May be unresolved ("?-SOL")
  // when a relay/auto-exit close returns no pool_name AND no base_mint — we heal
  // it below using the base mint the Meteora closed-PnL API gives us.
  let pair = result.pool_name || tracked.pool_name || (baseMint ? `${baseMint.slice(0, 8)}-SOL` : "?-SOL");

  // pnl in SOL: prefer Meteora closed SOL, else convert USD via solPrice
  const pnlUsd = num(result.pnl_usd, 0);
  const pnlPct = num(result.pnl_pct, 0);

  // Fetch closed-PnL first (gives us base mint + solPrice), then candles + pool config.
  const closed = await fetchClosedSol(poolAddress, walletAddress);
  const candleMint = baseMint || closed?.baseMint || null;
  const [candles, poolCfg] = await Promise.all([
    fetchCandles(candleMint),
    fetchPoolConfig(poolAddress),
  ]);

  // Heal an unresolved pair using the base mint from the Meteora closed-PnL API.
  if ((pair === "?-SOL" || !pair) && closed?.baseMint) {
    pair = `${String(closed.baseMint).slice(0, 8)}-SOL`;
  }

  let pnlSol = closed?.pnlSol;
  if (!Number.isFinite(pnlSol) || (pnlSol === 0 && !closed)) {
    const sp = num(solPrice, 0) || num(closed?.solPrice, 0);
    pnlSol = sp > 0 ? pnlUsd / sp : num(result.pnl_sol, 0);
  }

  // entry/exit unix for chart markers + duration — prefer Meteora closed timestamps
  const deployedAtRaw = num(tracked.deployed_at || tracked.deployedAt, 0);
  const deployedSec = deployedAtRaw > 1e12 ? Math.floor(deployedAtRaw / 1000) : deployedAtRaw || 0;
  const entryTime = closed?.createdAt || deployedSec || null;
  const exitTime = closed?.closedAt || Math.floor(Date.now() / 1000);

  const nowUtc = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const durSec = entryTime && exitTime ? Math.max(0, exitTime - entryTime) : null;

  return {
    pair,
    pnlSol: num(pnlSol, 0),
    pnlPct,
    time: fmtDurationSec(durSec) || fmtDuration(deployedAtRaw) || nowUtc.slice(11),
    // bottom stats (Metlex) — prefer tracked, fall back to closed-API derived
    tvlSol: num(tracked.tvl_sol ?? tracked.tvlSol ?? tracked.tvl, 0) || num(closed?.totalDepositsSol, 0),
    binStep: tracked.bin_step ?? tracked.binStep ?? poolCfg?.binStep ?? null,
    bins: (() => {
      const br = tracked.bin_range || tracked.binRange;
      if (Array.isArray(br) && br.length === 2) return Math.abs(num(br[1]) - num(br[0])) + 1;
      return tracked.bins ?? tracked.bins_below ?? closed?.bins ?? null;
    })(),
    baseFeePct: (() => {
      const bf = tracked.base_fee ?? tracked.baseFee;
      if (bf != null) {
        const n = Number(bf);
        return n > 1 ? n : n * 100; // accept 0.02 or 2
      }
      // fallback: Meteora pool config base_fee_pct (already a percent, e.g. 3)
      if (poolCfg?.baseFeePct != null) {
        const n = Number(poolCfg.baseFeePct);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    })(),
    // Fabriq details (fallback)
    positions: closed?.positions ?? 1,
    totalDepositsSol: closed?.totalDepositsSol ?? num(tracked.amount_sol, 0),
    currentDepositsSol: closed?.currentDepositsSol ?? 0,
    withdrawalsSol: closed?.withdrawalsSol ?? null,
    feesSol: closed?.feesSol ?? num(result.fees_earned_sol ?? result.total_fees_sol, 0),
    closedAtUtc: nowUtc,
    brand: brand || "PureXBT",
    url: url || "",
    candles,
    entryTime,
    exitTime,
    bgPath: null, // renderer will look for assets/card-bg.png itself
  };
}

export { fetchCandles, fetchClosedSol };
