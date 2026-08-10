import { withRetry } from "../services/retry.js";

export async function executeHttpRequest({ step, input }) {
  const config = step.config || {};
  const method = String(config.method || "GET").toUpperCase();
  const url = config.url;
  const headers = config.headers || {};

  if (!url) throw new Error("HTTP request URL is required");

  const options = { method, headers: { ...headers } };
  if (!["GET", "HEAD"].includes(method)) {
    options.headers["Content-Type"] = options.headers["Content-Type"] || "application/json";
    options.body = JSON.stringify(config.body ?? input ?? {});
  }

  const { result, attempt } = await withRetry(async () => {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      throw new Error(`HTTP request failed: ${response.status}`);
    }

    return { statusCode: response.status, data };
  }, { attempts: 2, delayMs: 1000 });

  return { status: "completed", output: result, attemptCount: attempt };
}
