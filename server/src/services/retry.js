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
      const result = await operation();

      return {
        result,
        attempt
      };
    } catch (error) {
      lastError = error;

      console.log(
        `Attempt ${attempt} failed: ${error.message}`
      );

      if (attempt < attempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, delayMs)
        );
      }
    }
  }

  throw lastError;
}