import { withRetry } from "../services/retry.js";

export async function executeHttpRequest({ step, input }) {
  const config = step.config || {};
  const method = String(config.method || "GET").toUpperCase();
  const url = String(config.url || "").trim();
  const timeoutMs = Math.min(30_000, Math.max(1_000, Number(config.timeout_ms || 10_000)));

  if (!url) throw new Error("HTTP request URL is required");
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("Only HTTP(S) URLs are supported");

  const headers = { ...(config.headers || {}) };
  const body = config.body ?? input ?? {};

  const { result, attempt } = await withRetry(async () => {
    const options = { method, headers, signal: AbortSignal.timeout(timeoutMs) };
    if (!["GET", "HEAD"].includes(method)) {
      options.headers["Content-Type"] = options.headers["Content-Type"] || "application/json";
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) throw new Error(`HTTP request failed: ${response.status}`);
    return { statusCode: response.status, data };
  }, { attempts: Math.max(1, Number(config.max_attempts || 2)), delayMs: Math.max(100, Number(config.retry_delay_ms || 1000)) });

  return { status: "completed", output: result, attemptCount: attempt };
}
