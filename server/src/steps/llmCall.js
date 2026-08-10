import { GoogleGenAI } from "@google/genai";
import { withRetry } from "../services/retry.js";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

export async function executeLlmCall({
  step,
  input,
  context
}) {
  const config = step.config || {};

  const promptTemplate =
    config.prompt || "Analyze this input: {{input}}";

  const previousOutput =
    context?.previousOutput ?? null;

  const prompt = promptTemplate.replace(
    "{{input}}",
    JSON.stringify(previousOutput ?? input)
  );

  const { result, attempt } = await withRetry(
    async () => {
      const response = await ai.models.generateContent({
        model: config.model || "gemini-2.5-flash",
        contents: prompt
      });

      const text = response.text;

      if (!text) {
        throw new Error(
          "Gemini returned an empty response"
        );
      }

      return {
        text
      };
    },
    {
      attempts: 2,
      delayMs: 1000
    }
  );

  return {
    status: "completed",

    output: result,

    attemptCount: attempt
  };
}