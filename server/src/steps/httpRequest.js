import { withRetry } from "../services/retry.js";

export async function executeHttpRequest({ step, input }) {
  const config = step.config || {};

  const method = config.method || "GET";
  const url = config.url;
  const headers = config.headers || {};

  if (!url) {
    throw new Error("HTTP request URL is required");
  }

  const options = {
    method,
    headers,
  };

  // GET/HEAD requests generally don't need a body
  if (!["GET", "HEAD"].includes(method.toUpperCase())) {
    options.body = JSON.stringify(config.body ?? input);

    options.headers = {
      "Content-Type": "application/json",
      ...headers,
    };
  }

  const { result, attempt } = await withRetry(
    async () => {
      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`HTTP request failed: ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";

      const data = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      return {
        statusCode: response.status,
        data,
      };
    },
    {
      attempts: 2,
      delayMs: 1000,
    },
  );

  return {
    status: "completed",
    output: result,
    attemptCount: attempt,
  };
}
