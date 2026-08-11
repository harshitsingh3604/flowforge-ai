import { GoogleGenAI } from "@google/genai";
import { withRetry } from "../services/retry.js";

function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  return new GoogleGenAI({ apiKey });
}

export async function executeLlmCall({
  step,
  input,
  context
}) {
  const ai = new GoogleGenAI(process.env.GEMINI_API_KEY);

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
        model: config.model || "gemini-3.6-flash",
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