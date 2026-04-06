/**
 * Ditto — Web Search via Perplexity Sonar API
 *
 * Gives Alex the ability to search the web in real-time during conversations.
 * Uses Perplexity's sonar model (search + synthesis in one call).
 * OpenAI-compatible API — reuses the OpenAI SDK.
 *
 * Provenance: Perplexity sonar API (OpenAI-compatible), Brief 093 (front door intelligence).
 */

import OpenAI from "openai";

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return null;
  client = new OpenAI({
    apiKey,
    baseURL: "https://api.perplexity.ai",
  });
  return client;
}

/**
 * Search the web and return a synthesized answer with sources.
 * Returns null if Perplexity is not configured.
 */
export async function webSearch(query: string): Promise<string | null> {
  const perplexity = getClient();
  if (!perplexity) {
    console.warn("[web-search] PERPLEXITY_API_KEY not set — skipping search");
    return null;
  }

  try {
    const response = await perplexity.chat.completions.create({
      model: "sonar",
      messages: [
        {
          role: "system",
          content: "You are a research assistant. Return concise, factual results. Include company/person names, locations, and contact details when available. Format as a bulleted list.",
        },
        {
          role: "user",
          content: query,
        },
      ],
      max_tokens: 500,
    });

    const result = response.choices[0]?.message?.content;
    if (!result) return null;

    console.log(`[web-search] Query: "${query}" — ${result.length} chars returned`);
    return result;
  } catch (err) {
    console.error("[web-search] Error:", (err as Error).message);
    return null;
  }
}
