import { GoogleGenAI } from "@google/genai";
import { withRetry } from "../services/retry.js";

function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  return new GoogleGenAI({ apiKey });
}

export async function executeLlmCall({ step, input, context }) {
  const config = step.config || {};
  const promptTemplate = config.prompt || "Analyze this input and finish with the word APPROVE when the request is safe to continue: {{input}}";
  const previousOutput = context?.previousOutput ?? input ?? {};
  const prompt = promptTemplate.replace("{{input}}", JSON.stringify(previousOutput));
  const model = config.model || process.env.GEMINI_MODEL || "gemini-3.6-flash";

  const { result, attempt } = await withRetry(
    async () => {
      const response = await getGemini().models.generateContent({
        model,
        contents: prompt,
      });
      const text = response.text;
      if (!text) throw new Error("Gemini returned an empty response");
      return { text, model };
    },
    { attempts: Number(config.max_attempts || 2), delayMs: Number(config.retry_delay_ms || 1000) },
  );

  return { status: "completed", output: result, attemptCount: attempt };
}
