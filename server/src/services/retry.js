export async function withRetry(
  operation,
  {
    attempts = 2,
    delayMs = 1000
  } = {}
) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return {
        result: await operation(),
        attempt
      };
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await new Promise(resolve =>
          setTimeout(resolve, delayMs)
        );
      }
    }
  }

  throw lastError;
}