export async function withRetry(operation, { attempts = 2, delayMs = 1000 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return { result: await operation(), attempt };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      lastError.attemptCount = attempt;
      console.log(`Attempt ${attempt} failed: ${lastError.message}`);
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  lastError.attemptCount = attempts;
  throw lastError;
}
