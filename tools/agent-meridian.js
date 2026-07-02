import { config } from "../config.js";
import { fetchWithRetry } from "../lib/fetch-retry.js";

export function getAgentMeridianBase() {
  return String(config.api.url || "https://api.agentmeridian.xyz/api").replace(/\/+$/, "");
}

export function getAgentMeridianHeaders({ json = false } = {}) {
  const headers = {};
  if (json) headers["Content-Type"] = "application/json";
  if (config.api.publicApiKey) headers["x-api-key"] = config.api.publicApiKey;
  return headers;
}

export function getAgentIdForRequests() {
  return config.hiveMind.agentId || "agent-local";
}

async function agentMeridianJsonOnce(pathname, options = {}) {
  const res = await fetchWithRetry(`${getAgentMeridianBase()}${pathname}`, options);
  const text = await res.text().catch(() => "");
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!res.ok) {
    const error = new Error(payload?.error || `${pathname} ${res.status}`);
    error.status = res.status;
    error.payload = payload;
    error.retryAfter = res.headers.get("retry-after");
    throw error;
  }
  return payload;
}

export async function agentMeridianJson(pathname, options = {}) {
  return agentMeridianJsonOnce(pathname, options);
}
